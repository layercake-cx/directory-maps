-- ============================================================
-- Migration: 20261126140000_block_pages_api
-- Description: Phase 2 of block-based page editing. Server-side rules for the
--              tables added in 20261126120000_create_block_pages. Still
--              invisible to visitors: no renderer or editor uses this yet.
--
--              1. Tightens phase 1 write access. can_manage_client() is true
--                 for ANY client contact, so phase 1's "own client write"
--                 policies let members bypass locks. New helper
--                 is_directory_admin() = platform admin OR a contact whose
--                 role is owner/manager. Direct table writes now need that;
--                 everyone else (members, claim users) uses the RPCs below,
--                 which enforce locks.
--              2. block_registry(): the block registry (scripts/block-
--                 registry.json) embedded as jsonb. Regenerate with
--                 node scripts/generate-block-registry.mjs --sql in a NEW
--                 migration whenever the registry changes.
--              3. block_data_errors()/assert_block_valid(): validate a block
--                 (type, region, page kind, data, common settings) against
--                 the registry. Rich text is rejected if it contains script/
--                 iframe/object/embed/style tags, javascript: URLs or inline
--                 on* handlers. This is defence in depth; the renderer must
--                 still sanitise on output (phase 3).
--              4. Page RPCs usable by three kinds of caller:
--                   - directory admin (platform admin, client owner/manager):
--                     never bound by locks
--                   - page editor (any other contact of the client): bound by
--                     locks
--                   - claim user (owner or editor of an ACTIVE claim, passing
--                     p_claim_id; entry pages only, own entry only): bound by
--                     locks
--                 get_page_blocks, add_page_block, update_page_block,
--                 reset_page_block_to_template, move_page_block,
--                 remove_page_block, convert_page_to_blocks.
--                 Every write bumps the page's updated_at (so the incremental
--                 publish rebuilds it) and, for a claim user, stamps the same
--                 provenance columns as update_claimed_listing_body().
--              5. Admin template RPCs: save_block_template,
--                 delete_block_template, stamp_block_template (batched
--                 backfill onto pages that lack the block).
--
--              Rules enforced here:
--                lock_content  -> non-admins cannot change the block; nobody
--                                 can set its data on the instance (edit the
--                                 template instead). Admins may still change
--                                 its settings.
--                lock_position -> non-admins cannot move or remove it. It is
--                                 pinned to its template's placement (start
--                                 or end of region) by normalisation, for
--                                 everyone.
--                An editor's data change detaches that block from its
--                template (data becomes non-null); reset re-links it.
--                Stamping onto a page converts it first (so it keeps today's
--                content), and re-adds the block where an owner removed it.
--
--              Deliberately NOT here: the trigger that stamps auto_add
--              templates onto newly created pages (it would sit on
--              directory_entries inserts, which also serve maps; it ships in
--              phase 4 with the editor and its own staging test).
-- Affected tables: directory_block_templates, directory_page_blocks (policies
--                  only); reads/writes directory_entries.updated_at and claim
--                  provenance columns, directory_content_pages.updated_at.
-- Rollback: _20261126140000_block_pages_api.rollback.sql
-- Author: Claude Code
-- Date: 2026-11-26
-- ============================================================
--
-- DRY-RUN BLOCK (run this first — it makes NO persistent changes):
--   BEGIN;
--   <paste everything between "THE MIGRATION" and "POST-MIGRATION VERIFICATION" here>
--   ROLLBACK;
-- ============================================================


-- ------------------------------------------------------------
-- PRE-MIGRATION INTEGRITY CHECKS
-- ------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'directory_page_blocks') then
    raise exception 'ABORT: directory_page_blocks does not exist — apply 20261126120000_create_block_pages.sql first';
  end if;
  if not exists (select 1 from pg_proc where proname = 'require_active_claim_editor') then
    raise exception 'ABORT: require_active_claim_editor() does not exist — apply the claims migrations first';
  end if;
  if not exists (select 1 from pg_proc where proname = 'is_entity_live') then
    raise exception 'ABORT: is_entity_live() does not exist — apply 20261117150000_archive_and_restore.sql first';
  end if;
  if exists (select 1 from pg_proc where proname in ('block_registry', 'is_directory_admin', 'add_page_block')) then
    raise exception 'ABORT: block pages API already exists — migration may have already run';
  end if;
end $$;

select 'directory_block_templates' as tbl, count(*) as rows from public.directory_block_templates union all
select 'directory_page_blocks', count(*) from public.directory_page_blocks union all
select 'directory_entries', count(*) from public.directory_entries
order by tbl;


-- ------------------------------------------------------------
-- THE MIGRATION
-- ------------------------------------------------------------

-- ---- 1. Who counts as a directory admin ----
create or replace function public.is_directory_admin(p_client_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
    or exists (
      select 1 from public.contacts
      where user_id = auth.uid() and client_id = p_client_id and role in ('owner', 'manager')
    );
$$;

comment on function public.is_directory_admin(text) is
  'True for a platform admin or a contact of the client whose role is owner or manager. Block locks never apply to these callers. Stricter than can_manage_client(), which is true for every contact including members.';

drop policy if exists "directory_block_templates_own_client_write" on public.directory_block_templates;
drop policy if exists "directory_page_blocks_own_client_write" on public.directory_page_blocks;

create policy "directory_block_templates_own_client_write"
  on public.directory_block_templates for all to authenticated
  using (directory_id in (
    select d.id from public.directories d
    where d.client_id = public.current_user_client_id() and public.is_directory_admin(d.client_id)
  ))
  with check (directory_id in (
    select d.id from public.directories d
    where d.client_id = public.current_user_client_id() and public.is_directory_admin(d.client_id)
  ));
create policy "directory_page_blocks_own_client_write"
  on public.directory_page_blocks for all to authenticated
  using (directory_id in (
    select d.id from public.directories d
    where d.client_id = public.current_user_client_id() and public.is_directory_admin(d.client_id)
  ))
  with check (directory_id in (
    select d.id from public.directories d
    where d.client_id = public.current_user_client_id() and public.is_directory_admin(d.client_id)
  ));


-- ---- 2. The registry ----
create or replace function public.block_registry()
returns jsonb
language sql
immutable
set search_path = public
as $fn$ select $registry${"version":"0.2","status":"phase 2: derived from the Discover pages handoff v0.1, adapted to this codebase","regions":{"hero":{"label":"Hero","width":"full"},"main":{"label":"Main","width":"flexible (~2/3)"},"sidebar":{"label":"Sidebar","width":"min 320px, optional sticky"}},"commonFields":[{"key":"anchorId","label":"Anchor ID","type":"slug"},{"key":"theme","label":"Theme","type":"enum","options":["default","inverse","accent"]},{"key":"spacingAbove","label":"Spacing above","type":"tokenRef","scale":"--ds-space-*"},{"key":"spacingBelow","label":"Spacing below","type":"tokenRef","scale":"--ds-space-*"},{"key":"visibility","label":"Visibility","type":"enum","options":["all","desktop","mobile"],"default":"all"}],"blocks":[{"id":"hero","name":"Hero banner","group":"structured","allowedRegions":["hero"],"purpose":"Introduces the page; first call to action.","fields":[{"key":"title","label":"Title","type":"text","required":true,"maxLength":40,"note":"Renders as the page H1"},{"key":"intro","label":"Intro","type":"textarea","maxLength":160},{"key":"icon","label":"Icon","type":"icon"},{"key":"showBreadcrumb","label":"Show breadcrumb","type":"boolean","default":true,"note":"Breadcrumb built from page hierarchy"},{"key":"media","label":"Background media","type":"enum","options":["image","none"],"default":"image"},{"key":"mediaAsset","label":"Media asset","type":"image","requiredWhen":"media!='none'","altTextRequired":true},{"key":"overlay","label":"Overlay","type":"enum","options":["left-fade","bottom-fade","full","none"],"default":"left-fade"},{"key":"primaryAction","label":"Primary action","type":"link"},{"key":"secondaryAction","label":"Secondary action","type":"link"}],"variants":{"height":["S","M","L"],"align":["left","centre"],"theme":["inverse","default"]},"tokens":["--ds-hero-min-height","--ds-color-inverse-bg","--ds-color-on-inverse","--ds-overlay","--ds-font-display","--ds-text-display","--ds-button-primary-bg"],"slots":[{"key":"tags","accepts":["tags"],"max":1}],"pageKinds":["entry","content_page"],"maxPerPage":1},{"id":"tags","name":"Tag list","group":"structured","allowedRegions":["hero","main"],"purpose":"Shows the entry's taxonomy terms as chips. Editors choose sources, not text.","fields":[{"key":"sources","label":"Sources","type":"multiEnum","options":["category","attributes","region"],"default":["category","attributes"]},{"key":"link","label":"Link behaviour","type":"enum","options":["filtered-listing","none"],"default":"filtered-listing"},{"key":"maxShown","label":"Max shown","type":"number","min":1,"max":12,"default":6,"note":"Overflow collapses to +n"},{"key":"highlight","label":"Highlighted term","type":"taxonomyRef"}],"variants":{"style":["filled","outline"],"size":["S","M"]},"tokens":["--ds-color-category-{slug}","--ds-radius-sm","--ds-text-label","--ds-tracking-label"],"pageKinds":["entry"]},{"id":"stats","name":"Stat list","group":"structured","allowedRegions":["hero","main"],"purpose":"Two to four short, checkable facts.","fields":[{"key":"title","label":"Block title","type":"text"},{"key":"items","label":"Items","type":"list","min":1,"max":4,"itemFields":[{"key":"value","label":"Value","type":"text","required":true,"maxLength":12},{"key":"label","label":"Label","type":"text","maxLength":40}]},{"key":"overlapPrevious","label":"Overlap previous block","type":"boolean","default":false}],"variants":{"style":["card","plain"],"valueColour":["category","ink"]},"tokens":["--ds-color-surface","--ds-shadow-1","--ds-text-stat","--ds-radius-lg"],"pageKinds":["entry","content_page"]},{"id":"cards","name":"Card grid","group":"structured","allowedRegions":["main"],"purpose":"Reasons, options, formats. Reused with different themes.","fields":[{"key":"title","label":"Block title","type":"text"},{"key":"headingLevel","label":"Heading level","type":"enum","options":["h2","h3"],"default":"h2"},{"key":"items","label":"Items","type":"list","min":2,"max":8,"itemFields":[{"key":"icon","label":"Icon","type":"icon"},{"key":"heading","label":"Heading","type":"text","required":true,"maxLength":40},{"key":"body","label":"Body","type":"richTextBasic","maxLength":200},{"key":"link","label":"Link","type":"link"}]},{"key":"columns","label":"Columns","type":"enum","options":["auto","2","3","4"],"default":"auto"}],"variants":{"theme":["default","inverse"],"card":["filled","outline"],"density":["comfortable","compact"]},"tokens":["--ds-color-surface","--ds-color-inverse-bg","--ds-radius-lg","--ds-color-icon-bg","--ds-color-icon","--ds-space-5"],"pageKinds":["entry","content_page"]},{"id":"media","name":"Media and list","group":"structured","allowedRegions":["main"],"purpose":"Image beside a short ordered or unordered list.","fields":[{"key":"title","label":"Block title","type":"text"},{"key":"media","label":"Media","type":"image","altTextRequired":true},{"key":"mediaPosition","label":"Media position","type":"enum","options":["left","right"],"default":"left"},{"key":"listStyle","label":"List style","type":"enum","options":["numbered","bulleted","checklist"],"default":"numbered"},{"key":"items","label":"Items","type":"list","min":1,"max":6,"itemFields":[{"key":"heading","label":"Heading","type":"text","required":true},{"key":"body","label":"Body","type":"text"}]}],"variants":{"mediaTilt":["on","off"]},"tokens":["--ds-radius-lg","--ds-tilt-angle","--ds-marker-bg","--ds-marker-fg"],"pageKinds":["entry","content_page"]},{"id":"attrs","name":"Attribute list","group":"structured","allowedRegions":["sidebar","main"],"purpose":"Explains each of the entry's attributes in its own terms; reads the same taxonomy as Tag list.","fields":[{"key":"title","label":"Block title","type":"text","default":"Is it for me?"},{"key":"source","label":"Source","type":"enum","options":["page-attributes","manual"],"default":"page-attributes"},{"key":"descriptions","label":"Per-attribute descriptions","type":"map","keyType":"taxonomyRef","valueType":"text","note":"Overrides the default description per entry"},{"key":"footerLink","label":"Footer link","type":"link"}],"variants":{"theme":["inverse","default"]},"tokens":["--ds-color-inverse-bg","--ds-color-accent","--ds-color-on-accent","--ds-radius-xl"],"pageKinds":["entry"]},{"id":"actions","name":"Action list","group":"structured","allowedRegions":["sidebar","main"],"purpose":"Linked next steps; the main conversion point.","fields":[{"key":"title","label":"Block title","type":"text","required":true},{"key":"subtitle","label":"Subtitle","type":"text"},{"key":"headerStyle","label":"Header style","type":"enum","options":["accent-band","plain"],"default":"accent-band"},{"key":"items","label":"Items","type":"list","min":1,"max":6,"itemFields":[{"key":"icon","label":"Icon","type":"icon"},{"key":"label","label":"Label","type":"text","required":true},{"key":"sublabel","label":"Sublabel","type":"text"},{"key":"link","label":"Link","type":"link","required":true}]},{"key":"sticky","label":"Sticky in sidebar","type":"boolean","default":false,"note":"Only applies in sidebar region"}],"variants":{"header":["accent","plain"]},"tokens":["--ds-color-accent","--ds-color-on-accent","--ds-shadow-2","--ds-sticky-offset","--ds-color-icon-bg"],"slots":[{"key":"footer","accepts":["chips"],"max":1}],"pageKinds":["entry","content_page"]},{"id":"chips","name":"Chip list","group":"structured","allowedRegions":["sidebar","main"],"purpose":"Short plain-text items (kit lists, formats).","fields":[{"key":"title","label":"Label","type":"text"},{"key":"items","label":"Items","type":"textList","min":1,"max":8,"itemMaxLength":30}],"variants":{"style":["pill","outline"]},"tokens":["--ds-color-subtle-bg","--ds-radius-pill","--ds-text-small"],"pageKinds":["entry","content_page"]},{"id":"contact","name":"Contact block","group":"structured","allowedRegions":["sidebar","main"],"purpose":"Generic organisation card backed by an Organisation record.","fields":[{"key":"title","label":"Block title","type":"text","note":"e.g. Governed by, Partner, Run by"},{"key":"organisation","label":"Organisation","type":"recordRef","recordType":"organisation","required":true},{"key":"fieldsShown","label":"Fields shown","type":"multiEnum","options":["logo","website","email","phone","address","social"],"default":["logo","website"]},{"key":"websiteLabel","label":"Website link label","type":"text","default":"Visit website"}],"variants":{"layout":["compact","full"],"logoSize":["S","M"]},"tokens":["--ds-color-surface","--ds-logo-size","--ds-radius-md","--ds-color-ink-muted","--ds-color-border"],"pageKinds":["entry","content_page"],"status":"deferred","deferredReason":"Needs Organisation records, which do not exist yet."},{"id":"claim","name":"Claim prompt","group":"structured","allowedRegions":["hero","main","sidebar"],"purpose":"Invites the organisation behind an entry to claim it.","fields":[{"key":"title","label":"Heading","type":"text","required":true,"mergeFields":["entry.name","entry.short_name"]},{"key":"body","label":"Body","type":"textarea","maxLength":200,"mergeFields":["entry.name","entry.short_name"]},{"key":"icon","label":"Icon","type":"icon"},{"key":"primaryAction","label":"Primary action","type":"link"},{"key":"secondaryLink","label":"Secondary link","type":"link"},{"key":"actionMode","label":"Action mode","type":"enum","options":["link-out","inline-form"],"default":"link-out"},{"key":"formFields","label":"Form fields","type":"multiEnum","options":["name","email","role","website","message"],"default":["name","email","message"],"requiredWhen":"actionMode=='inline-form'"},{"key":"layout","label":"Layout","type":"enum","options":["auto","banner","stacked"],"default":"auto","note":"auto = banner in hero/main, stacked in sidebar"}],"variants":{"tone":["neutral","accent"],"emphasisEdge":["left","top","none"],"dismissible":["yes","no"]},"tokens":["--ds-color-subtle-bg","--ds-color-callout-edge","--ds-color-ink","--ds-button-primary-bg","--ds-radius-md","--ds-space-4"],"visibilityRule":"entry.claimed == false","pageKinds":["entry"]},{"id":"rich","name":"Rich text","group":"text","allowedRegions":["main"],"purpose":"Paragraphs of editorial copy.","fields":[{"key":"title","label":"Heading","type":"text"},{"key":"body","label":"Body","type":"richText","marks":["bold","italic","link","bulletList","orderedList"]},{"key":"style","label":"Style","type":"enum","options":["normal","lead"],"default":"normal"}],"variants":{},"tokens":["--ds-text-body","--ds-measure","--ds-color-link"],"pageKinds":["entry","content_page"]},{"id":"heading","name":"Heading","group":"text","allowedRegions":["main"],"purpose":"Standalone section heading; creates an anchor.","fields":[{"key":"title","label":"Text","type":"text","required":true,"maxLength":60},{"key":"level","label":"Level","type":"enum","options":["h2","h3","h4"],"default":"h2"},{"key":"eyebrow","label":"Eyebrow","type":"text"}],"variants":{"case":["upper","sentence"]},"tokens":["--ds-font-display","--ds-text-h2","--ds-case-heading"],"pageKinds":["entry","content_page"]},{"id":"list","name":"List","group":"text","allowedRegions":["main"],"purpose":"Plain list without media.","fields":[{"key":"title","label":"Heading","type":"text"},{"key":"items","label":"Items","type":"textList","min":1,"max":20},{"key":"listStyle","label":"Style","type":"enum","options":["bulleted","numbered","checklist"],"default":"bulleted"}],"variants":{"columns":["1","2"]},"tokens":["--ds-marker-bg","--ds-marker-fg","--ds-space-3"],"pageKinds":["entry","content_page"]},{"id":"quote","name":"Quote","group":"text","allowedRegions":["main"],"purpose":"A real, attributed quote.","fields":[{"key":"title","label":"Quote","type":"textarea","required":true,"maxLength":280},{"key":"who","label":"Attribution","type":"text","required":true},{"key":"role","label":"Role or source","type":"text"}],"variants":{"style":["pull","inline"]},"tokens":["--ds-font-display","--ds-color-accent","--ds-text-h3"],"pageKinds":["entry","content_page"]},{"id":"callout","name":"Callout","group":"text","allowedRegions":["main","sidebar"],"purpose":"Boxed notice: tips, warnings, standard statements.","fields":[{"key":"title","label":"Heading","type":"text"},{"key":"body","label":"Body","type":"richTextBasic","maxLength":300},{"key":"tone","label":"Tone","type":"enum","options":["info","tip","warning"],"default":"info"}],"variants":{"icon":["on","off"]},"tokens":["--ds-color-callout-{tone}","--ds-radius-md","--ds-space-4"],"pageKinds":["entry","content_page"]},{"id":"faq","name":"FAQ","group":"text","allowedRegions":["main"],"purpose":"Expandable questions and answers.","fields":[{"key":"title","label":"Heading","type":"text"},{"key":"items","label":"Items","type":"list","min":1,"max":15,"itemFields":[{"key":"question","label":"Question","type":"text","required":true},{"key":"answer","label":"Answer","type":"richTextBasic","required":true}]},{"key":"firstOpen","label":"First item open","type":"boolean","default":false},{"key":"structuredData","label":"Add FAQPage structured data","type":"boolean","default":true}],"variants":{"expand":["one","many"]},"tokens":["--ds-color-border","--ds-text-h3","--ds-motion-fast"],"pageKinds":["entry","content_page"]},{"id":"table","name":"Table","group":"text","allowedRegions":["main"],"purpose":"Simple tabular facts.","fields":[{"key":"title","label":"Caption","type":"text","required":true,"note":"Required for accessibility"},{"key":"rows","label":"Rows","type":"table","maxColumns":6,"maxRows":30},{"key":"headerRow","label":"First row is header","type":"boolean","default":true}],"variants":{"striped":["on","off"]},"tokens":["--ds-color-border","--ds-color-subtle-bg","--ds-text-small"],"pageKinds":["entry","content_page"]},{"id":"divider","name":"Divider","group":"text","allowedRegions":["main"],"purpose":"Visual break between groups of blocks.","fields":[{"key":"style","label":"Style","type":"enum","options":["line","space","diagonal"],"default":"line"}],"variants":{"spacing":["S","M","L"]},"tokens":["--ds-color-border","--ds-space-7"],"pageKinds":["entry","content_page"]},{"id":"entry_hero","name":"Entry header","group":"page-data","allowedRegions":["hero"],"pageKinds":["entry"],"purpose":"Logo tile, name, summary and category chips, as on every entry page today.","fields":[],"variants":{},"tokens":[],"dataBound":true,"maxPerPage":1},{"id":"page_title","name":"Page title","group":"page-data","allowedRegions":["hero"],"pageKinds":["content_page"],"purpose":"Breadcrumb and page title for a content page.","fields":[],"variants":{},"tokens":[],"dataBound":true,"maxPerPage":1},{"id":"entry_hero_image","name":"Hero image","group":"page-data","allowedRegions":["main"],"pageKinds":["entry"],"purpose":"The entry's hero image.","fields":[{"key":"title","label":"Section label","type":"text","maxLength":60,"note":"Optional. Adds an anchored section heading and a jump chip."}],"variants":{},"tokens":[],"dataBound":true},{"id":"entry_gallery","name":"Photo gallery","group":"page-data","allowedRegions":["main"],"pageKinds":["entry"],"purpose":"The entry's gallery images.","fields":[{"key":"title","label":"Section label","type":"text","maxLength":60,"note":"Optional. Adds an anchored section heading and a jump chip."}],"variants":{},"tokens":[],"dataBound":true},{"id":"entry_accreditations","name":"Accreditation badges","group":"page-data","allowedRegions":["main"],"pageKinds":["entry"],"purpose":"Badges the entry holds.","fields":[{"key":"title","label":"Section label","type":"text","maxLength":60,"note":"Optional. Adds an anchored section heading and a jump chip."}],"variants":{},"tokens":[],"dataBound":true},{"id":"entry_evidence","name":"Evidence","group":"page-data","allowedRegions":["main"],"pageKinds":["entry"],"purpose":"Evidence items for the entry.","fields":[{"key":"title","label":"Section label","type":"text","maxLength":60,"note":"Optional. Adds an anchored section heading and a jump chip."}],"variants":{},"tokens":[],"dataBound":true},{"id":"entry_product_tiles","name":"Product tiles","group":"page-data","allowedRegions":["main"],"pageKinds":["entry"],"purpose":"Product tiles for the entry.","fields":[{"key":"title","label":"Section label","type":"text","maxLength":60,"note":"Optional. Adds an anchored section heading and a jump chip."}],"variants":{},"tokens":[],"dataBound":true},{"id":"entry_links","name":"Links","group":"page-data","allowedRegions":["main"],"pageKinds":["entry"],"purpose":"Prominent links for the entry.","fields":[{"key":"title","label":"Section label","type":"text","maxLength":60,"note":"Optional. Adds an anchored section heading and a jump chip."}],"variants":{},"tokens":[],"dataBound":true},{"id":"entry_categorisation","name":"Categorisation chips","group":"page-data","allowedRegions":["main"],"pageKinds":["entry"],"purpose":"The entry's terms from one categorisation.","fields":[{"key":"title","label":"Section label","type":"text","maxLength":60,"note":"Optional. Adds an anchored section heading and a jump chip."},{"key":"key","label":"Categorisation key","type":"slug","required":true}],"variants":{},"tokens":[],"dataBound":true},{"id":"entry_contact_panel","name":"Contact and address","group":"page-data","allowedRegions":["sidebar"],"pageKinds":["entry"],"purpose":"Website, Contact button, phone, email and address.","fields":[],"variants":{},"tokens":[],"dataBound":true,"maxPerPage":1},{"id":"entry_map_card","name":"Map card","group":"page-data","allowedRegions":["sidebar"],"pageKinds":["entry"],"purpose":"Map showing the entry's location.","fields":[],"variants":{},"tokens":[],"dataBound":true,"maxPerPage":1},{"id":"entry_attributes","name":"Directory attributes","group":"page-data","allowedRegions":["sidebar"],"pageKinds":["entry"],"purpose":"At-a-glance attribute table.","fields":[],"variants":{},"tokens":[],"dataBound":true,"maxPerPage":1},{"id":"entry_tag_chips","name":"Tag chips","group":"page-data","allowedRegions":["sidebar"],"pageKinds":["entry"],"purpose":"Chip lists for multi-select categorisations.","fields":[],"variants":{},"tokens":[],"dataBound":true,"maxPerPage":1}]}$registry$::jsonb $fn$;

comment on function public.block_registry() is
  'The block registry (scripts/block-registry.json) as jsonb. Re-create from node scripts/generate-block-registry.mjs --sql in a new migration when it changes.';


-- ---- 3. Validation ----
create or replace function public.block_err(p_path text, p_message text)
returns jsonb
language sql
immutable
as $$ select jsonb_build_array(jsonb_build_object('path', p_path, 'message', p_message)); $$;

-- requiredWhen expressions are only ever  key=='value'  or  key!='value'.
create or replace function public.block_when(p_expr text, p_ctx jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  m text[];
begin
  if p_expr is null then return false; end if;
  m := regexp_match(p_expr, '^([A-Za-z]+)\s*(==|!=)\s*''([^'']*)''$');
  if m is null then return false; end if;
  if m[2] = '==' then
    return coalesce(p_ctx ->> m[1], '') = m[3];
  end if;
  return coalesce(p_ctx ->> m[1], '') <> m[3];
end;
$$;

create or replace function public.block_object_errors(p_fields jsonb, p_obj jsonb, p_path text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_errs jsonb := '[]'::jsonb;
  v_key text;
  v_f jsonb;
begin
  if p_obj is null or jsonb_typeof(p_obj) <> 'object' then
    return public.block_err(p_path, 'must be an object');
  end if;
  for v_key in select jsonb_object_keys(p_obj) loop
    if not exists (select 1 from jsonb_array_elements(p_fields) f where f ->> 'key' = v_key) then
      v_errs := v_errs || public.block_err(p_path || '.' || v_key, 'is not a field of this block');
    end if;
  end loop;
  for v_f in select value from jsonb_array_elements(p_fields) loop
    v_errs := v_errs || public.block_field_errors(v_f, p_obj -> (v_f ->> 'key'), p_path || '.' || (v_f ->> 'key'), p_obj);
  end loop;
  return v_errs;
end;
$$;

create or replace function public.block_field_errors(p_def jsonb, p_val jsonb, p_path text, p_ctx jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_type text := p_def ->> 'type';
  v_label text := coalesce(p_def ->> 'label', p_def ->> 'key');
  v_req boolean := coalesce((p_def ->> 'required')::boolean, false) or public.block_when(p_def ->> 'requiredWhen', p_ctx);
  v_errs jsonb := '[]'::jsonb;
  v_text text;
  v_n integer;
  v_i integer;
  v_item jsonb;
  v_elem jsonb;
  v_key text;
  v_num numeric;
  v_unsafe constant text := '(<\s*(script|iframe|object|embed|style)\y|javascript:|\son[a-z]+\s*=)';
begin
  if p_val is null or jsonb_typeof(p_val) = 'null' then
    if v_req then
      return public.block_err(p_path, v_label || ' is required');
    end if;
    return '[]'::jsonb;
  end if;

  if v_type in ('text', 'textarea', 'slug', 'tokenRef', 'icon', 'taxonomyRef', 'enum', 'richText', 'richTextBasic') then
    if jsonb_typeof(p_val) <> 'string' then
      return public.block_err(p_path, v_label || ' must be text');
    end if;
    v_text := p_val #>> '{}';
    if v_req and btrim(v_text) = '' then
      return public.block_err(p_path, v_label || ' is required');
    end if;
  end if;

  if v_type in ('text', 'textarea') then
    if p_def ->> 'maxLength' is not null and length(v_text) > (p_def ->> 'maxLength')::int then
      v_errs := v_errs || public.block_err(p_path, v_label || ' must be at most ' || (p_def ->> 'maxLength') || ' characters');
    end if;

  elsif v_type in ('richText', 'richTextBasic') then
    if v_text ~* v_unsafe then
      v_errs := v_errs || public.block_err(p_path, v_label || ' contains markup that is not allowed');
    end if;
    if p_def ->> 'maxLength' is not null and length(regexp_replace(v_text, '<[^>]*>', '', 'g')) > (p_def ->> 'maxLength')::int then
      v_errs := v_errs || public.block_err(p_path, v_label || ' must be at most ' || (p_def ->> 'maxLength') || ' characters');
    end if;

  elsif v_type = 'slug' then
    if v_text !~ '^[a-z][a-z0-9-]{0,59}$' then
      v_errs := v_errs || public.block_err(p_path, v_label || ' must be lowercase letters, numbers and hyphens');
    end if;

  elsif v_type = 'tokenRef' then
    if v_text !~ '^--ds-space-[1-8]$' then
      v_errs := v_errs || public.block_err(p_path, v_label || ' must be a spacing token');
    end if;

  elsif v_type = 'icon' then
    if v_text !~ '^[a-z][a-z0-9-]{0,39}$' then
      v_errs := v_errs || public.block_err(p_path, v_label || ' must be an icon name');
    end if;

  elsif v_type = 'taxonomyRef' then
    if length(v_text) not between 1 and 64 then
      v_errs := v_errs || public.block_err(p_path, v_label || ' must be a term id');
    end if;

  elsif v_type = 'enum' then
    if not (p_def -> 'options') @> jsonb_build_array(p_val) then
      v_errs := v_errs || public.block_err(p_path, v_label || ' is not one of the allowed options');
    end if;

  elsif v_type = 'boolean' then
    if jsonb_typeof(p_val) <> 'boolean' then
      v_errs := v_errs || public.block_err(p_path, v_label || ' must be true or false');
    end if;

  elsif v_type = 'number' then
    if jsonb_typeof(p_val) <> 'number' then
      return public.block_err(p_path, v_label || ' must be a number');
    end if;
    v_num := (p_val #>> '{}')::numeric;
    if p_def ->> 'min' is not null and v_num < (p_def ->> 'min')::numeric then
      v_errs := v_errs || public.block_err(p_path, v_label || ' must be at least ' || (p_def ->> 'min'));
    end if;
    if p_def ->> 'max' is not null and v_num > (p_def ->> 'max')::numeric then
      v_errs := v_errs || public.block_err(p_path, v_label || ' must be at most ' || (p_def ->> 'max'));
    end if;

  elsif v_type = 'multiEnum' then
    if jsonb_typeof(p_val) <> 'array' then
      return public.block_err(p_path, v_label || ' must be a list');
    end if;
    if v_req and jsonb_array_length(p_val) = 0 then
      v_errs := v_errs || public.block_err(p_path, v_label || ' needs at least one choice');
    end if;
    for v_elem in select value from jsonb_array_elements(p_val) loop
      if not (p_def -> 'options') @> jsonb_build_array(v_elem) then
        v_errs := v_errs || public.block_err(p_path, v_label || ' has a choice that is not allowed');
      end if;
    end loop;

  elsif v_type = 'link' then
    if jsonb_typeof(p_val) <> 'object' then
      return public.block_err(p_path, v_label || ' must be a link');
    end if;
    for v_key in select jsonb_object_keys(p_val) loop
      if v_key not in ('label', 'kind', 'target') then
        v_errs := v_errs || public.block_err(p_path || '.' || v_key, 'is not part of a link');
      end if;
    end loop;
    v_text := coalesce(p_val ->> 'target', '');
    if v_text = '' then
      if v_req then
        v_errs := v_errs || public.block_err(p_path, v_label || ' is required');
      end if;
    else
      if p_val ->> 'kind' = 'url' then
        if length(v_text) > 2000 or v_text !~* '^(https?://|mailto:|tel:)[^\s<>"]+$' then
          v_errs := v_errs || public.block_err(p_path, v_label || ' must be a web, email or phone link');
        end if;
      elsif p_val ->> 'kind' = 'anchor' then
        if v_text !~ '^[a-z][a-z0-9-]{0,59}$' then
          v_errs := v_errs || public.block_err(p_path, v_label || ' must be an on-page anchor');
        end if;
      elsif p_val ->> 'kind' = 'entry' then
        if length(v_text) > 64 or v_text !~ '^[A-Za-z0-9_-]+$' then
          v_errs := v_errs || public.block_err(p_path, v_label || ' must point to an entry');
        end if;
      else
        v_errs := v_errs || public.block_err(p_path, v_label || ' needs a kind of url, anchor or entry');
      end if;
    end if;
    if p_val ->> 'label' is not null and length(p_val ->> 'label') > 80 then
      v_errs := v_errs || public.block_err(p_path, v_label || ' label must be at most 80 characters');
    end if;

  elsif v_type = 'image' then
    if jsonb_typeof(p_val) <> 'object' then
      return public.block_err(p_path, v_label || ' must be an image');
    end if;
    for v_key in select jsonb_object_keys(p_val) loop
      if v_key not in ('url', 'alt') then
        v_errs := v_errs || public.block_err(p_path || '.' || v_key, 'is not part of an image');
      end if;
    end loop;
    v_text := coalesce(p_val ->> 'url', '');
    if v_text = '' or length(v_text) > 2000 or v_text !~* '^https?://[^\s<>"]+$' then
      v_errs := v_errs || public.block_err(p_path, v_label || ' needs a web address');
    end if;
    if p_val ->> 'alt' is not null and length(p_val ->> 'alt') > 200 then
      v_errs := v_errs || public.block_err(p_path, v_label || ' alt text must be at most 200 characters');
    end if;
    if coalesce((p_def ->> 'altTextRequired')::boolean, false) and btrim(coalesce(p_val ->> 'alt', '')) = '' then
      v_errs := v_errs || public.block_err(p_path, v_label || ' needs alt text');
    end if;

  elsif v_type = 'list' then
    if jsonb_typeof(p_val) <> 'array' then
      return public.block_err(p_path, v_label || ' must be a list');
    end if;
    v_n := jsonb_array_length(p_val);
    if p_def ->> 'min' is not null and v_n < (p_def ->> 'min')::int then
      v_errs := v_errs || public.block_err(p_path, v_label || ' needs at least ' || (p_def ->> 'min') || ' items');
    end if;
    if p_def ->> 'max' is not null and v_n > (p_def ->> 'max')::int then
      v_errs := v_errs || public.block_err(p_path, v_label || ' can have at most ' || (p_def ->> 'max') || ' items');
    end if;
    for v_i in 0 .. v_n - 1 loop
      v_errs := v_errs || public.block_object_errors(p_def -> 'itemFields', p_val -> v_i, p_path || '[' || v_i || ']');
    end loop;

  elsif v_type = 'textList' then
    if jsonb_typeof(p_val) <> 'array' then
      return public.block_err(p_path, v_label || ' must be a list');
    end if;
    v_n := jsonb_array_length(p_val);
    if p_def ->> 'min' is not null and v_n < (p_def ->> 'min')::int then
      v_errs := v_errs || public.block_err(p_path, v_label || ' needs at least ' || (p_def ->> 'min') || ' items');
    end if;
    if p_def ->> 'max' is not null and v_n > (p_def ->> 'max')::int then
      v_errs := v_errs || public.block_err(p_path, v_label || ' can have at most ' || (p_def ->> 'max') || ' items');
    end if;
    for v_elem in select value from jsonb_array_elements(p_val) loop
      if jsonb_typeof(v_elem) <> 'string' or btrim(v_elem #>> '{}') = '' then
        v_errs := v_errs || public.block_err(p_path, v_label || ' items must be non-empty text');
      elsif p_def ->> 'itemMaxLength' is not null and length(v_elem #>> '{}') > (p_def ->> 'itemMaxLength')::int then
        v_errs := v_errs || public.block_err(p_path, v_label || ' items must be at most ' || (p_def ->> 'itemMaxLength') || ' characters');
      end if;
    end loop;

  elsif v_type = 'table' then
    if jsonb_typeof(p_val) <> 'array' then
      return public.block_err(p_path, v_label || ' must be a grid');
    end if;
    if p_def ->> 'maxRows' is not null and jsonb_array_length(p_val) > (p_def ->> 'maxRows')::int then
      v_errs := v_errs || public.block_err(p_path, v_label || ' can have at most ' || (p_def ->> 'maxRows') || ' rows');
    end if;
    for v_item in select value from jsonb_array_elements(p_val) loop
      if jsonb_typeof(v_item) <> 'array' then
        v_errs := v_errs || public.block_err(p_path, v_label || ' rows must be lists of cells');
      else
        if p_def ->> 'maxColumns' is not null and jsonb_array_length(v_item) > (p_def ->> 'maxColumns')::int then
          v_errs := v_errs || public.block_err(p_path, v_label || ' can have at most ' || (p_def ->> 'maxColumns') || ' columns');
        end if;
        for v_elem in select value from jsonb_array_elements(v_item) loop
          if jsonb_typeof(v_elem) <> 'string' or length(v_elem #>> '{}') > 300 then
            v_errs := v_errs || public.block_err(p_path, v_label || ' cells must be text of at most 300 characters');
          end if;
        end loop;
      end if;
    end loop;

  elsif v_type = 'map' then
    if jsonb_typeof(p_val) <> 'object' then
      return public.block_err(p_path, v_label || ' must be a set of values');
    end if;
    for v_key in select jsonb_object_keys(p_val) loop
      if length(v_key) > 64 or jsonb_typeof(p_val -> v_key) <> 'string' or length(p_val ->> v_key) > 300 then
        v_errs := v_errs || public.block_err(p_path || '.' || left(v_key, 20), 'needs a term id key and text of at most 300 characters');
      end if;
    end loop;

  else
    -- includes recordRef (needs Organisation records, not built yet)
    v_errs := v_errs || public.block_err(p_path, v_label || ' is of a type that is not supported yet');
  end if;

  return v_errs;
end;
$$;

create or replace function public.block_data_errors(
  p_page_kind text, p_region text, p_block_type text, p_data jsonb, p_common jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_def jsonb;
  v_errs jsonb := '[]'::jsonb;
  v_common jsonb := coalesce(p_common, '{}'::jsonb);
  v_vkey text;
  v_variants jsonb;
begin
  select b into v_def from jsonb_array_elements(public.block_registry() -> 'blocks') b where b ->> 'id' = p_block_type;
  if v_def is null then
    return public.block_err('block_type', 'unknown block type');
  end if;
  if v_def ->> 'status' = 'deferred' then
    return public.block_err('block_type', 'this block type is not available yet');
  end if;
  if not (v_def -> 'pageKinds') @> jsonb_build_array(p_page_kind) then
    v_errs := v_errs || public.block_err('block_type', 'this block cannot be used on this kind of page');
  end if;
  if not (v_def -> 'allowedRegions') @> jsonb_build_array(p_region) then
    v_errs := v_errs || public.block_err('region', 'this block cannot go in that region');
  end if;

  if p_data is null then
    v_errs := v_errs || public.block_err('data', 'is required');
  else
    v_errs := v_errs || public.block_object_errors(v_def -> 'fields', p_data, 'data');
  end if;

  if jsonb_typeof(v_common) <> 'object' then
    return v_errs || public.block_err('common', 'must be an object');
  end if;
  v_errs := v_errs || public.block_object_errors(public.block_registry() -> 'commonFields', v_common - 'variants', 'common');

  if v_common ? 'variants' then
    v_variants := v_common -> 'variants';
    if jsonb_typeof(v_variants) <> 'object' then
      v_errs := v_errs || public.block_err('common.variants', 'must be an object');
    else
      for v_vkey in select jsonb_object_keys(v_variants) loop
        if not coalesce(v_def -> 'variants', '{}'::jsonb) ? v_vkey
           or not (v_def -> 'variants' -> v_vkey) @> jsonb_build_array(v_variants -> v_vkey) then
          v_errs := v_errs || public.block_err('common.variants.' || left(v_vkey, 20), 'is not an option of this block');
        end if;
      end loop;
    end if;
  end if;

  return v_errs;
end;
$$;

create or replace function public.assert_block_valid(
  p_page_kind text, p_region text, p_block_type text, p_data jsonb, p_common jsonb
)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  v_errs jsonb := public.block_data_errors(p_page_kind, p_region, p_block_type, p_data, p_common);
begin
  if jsonb_array_length(v_errs) > 0 then
    raise exception 'Invalid block: %', v_errs::text using errcode = '22023';
  end if;
end;
$$;

-- Registry lookups used by the RPCs.
create or replace function public.block_def(p_block_type text)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select b from jsonb_array_elements(public.block_registry() -> 'blocks') b where b ->> 'id' = p_block_type;
$$;

create or replace function public.block_region_allowed(p_page_kind text, p_region text, p_block_type text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(
    (public.block_def(p_block_type) -> 'pageKinds') @> jsonb_build_array(p_page_kind)
    and (public.block_def(p_block_type) -> 'allowedRegions') @> jsonb_build_array(p_region)
    and coalesce(public.block_def(p_block_type) ->> 'status', '') <> 'deferred',
    false);
$$;


-- ---- 4. Context, ordering and bookkeeping helpers ----

-- Resolves the page, the directory and who is calling. Raises when the caller may not touch blocks on this page.
create or replace function public.block_page_context(p_page_kind text, p_page_id text, p_claim_id uuid default null)
returns table (directory_id text, client_id text, is_admin boolean, claim_user_id uuid)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_dir text;
  v_client text;
  v_item text;
  v_claim_user uuid;
  v_admin boolean;
begin
  if p_page_kind = 'entry' then
    select e.directory_id into v_dir from public.directory_entries e where e.id = p_page_id;
  elsif p_page_kind = 'content_page' then
    select c.directory_id into v_dir from public.directory_content_pages c where c.id = p_page_id;
  else
    raise exception 'Unknown page kind';
  end if;
  if v_dir is null then
    raise exception 'Page not found';
  end if;

  select d.client_id into v_client from public.directories d where d.id = v_dir;
  if not public.is_entity_live('directory', v_dir) then
    raise exception 'This directory is archived';
  end if;

  if p_claim_id is not null then
    if p_page_kind <> 'entry' then
      raise exception 'Claims can only edit entry pages';
    end if;
    select r.directory_item_id, r.claim_user_id into v_item, v_claim_user
    from public.require_active_claim_editor(p_claim_id) r;
    if v_item is distinct from p_page_id then
      raise exception 'This claim does not cover that page';
    end if;
    return query select v_dir, v_client, false, v_claim_user;
    return;
  end if;

  v_admin := public.is_directory_admin(v_client);
  if not v_admin and not exists (
    select 1 from public.contacts c where c.user_id = auth.uid() and c.client_id = v_client
  ) then
    raise exception 'Access denied';
  end if;
  return query select v_dir, v_client, v_admin, null::uuid;
end;
$$;

-- Same rank order everywhere: start-pinned blocks, then the rest in order, then end-pinned blocks.
create or replace function public.normalise_block_region(p_page_kind text, p_page_id text, p_region text)
returns void
language sql
security definer
set search_path = public
as $$
  with ranked as (
    select b.id,
           row_number() over (
             order by case
                        when b.lock_position and t.placement = 'start' then 0
                        when b.lock_position and t.placement = 'end' then 2
                        else 1
                      end, b.position, b.created_at, b.id
           ) - 1 as new_pos
    from public.directory_page_blocks b
    left join public.directory_block_templates t on t.id = b.template_id
    where b.region = p_region
      and case when p_page_kind = 'entry' then b.entry_id = p_page_id else b.content_page_id = p_page_id end
  )
  update public.directory_page_blocks b
     set position = r.new_pos
    from ranked r
   where b.id = r.id and b.position <> r.new_pos;
$$;

-- Bumps the page so the incremental publish rebuilds it; stamps claim provenance.
create or replace function public.touch_block_page(p_page_kind text, p_page_id text, p_claim_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_page_kind = 'entry' then
    if p_claim_user_id is not null then
      update public.directory_entries set
        content_managed_by = 'claimed_org',
        content_last_edited_by_claim_user_id = p_claim_user_id,
        content_last_edited_at = now(),
        updated_at = now()
      where id = p_page_id;
    else
      update public.directory_entries set updated_at = now() where id = p_page_id;
    end if;
  else
    update public.directory_content_pages set updated_at = now() where id = p_page_id;
  end if;
end;
$$;

-- The page (kind and id) a block instance sits on.
create or replace function public.block_page_of(p_block_id uuid)
returns table (page_kind text, page_id text)
language sql
stable
security definer
set search_path = public
as $$
  select b.page_kind, coalesce(b.entry_id, b.content_page_id) from public.directory_page_blocks b where b.id = p_block_id;
$$;


-- ---- 5. Page RPCs (admin, page editor, claim user) ----

create or replace function public.get_page_blocks(p_page_kind text, p_page_id text, p_claim_id uuid default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_ctx record;
  v_blocks jsonb;
  v_converted boolean;
begin
  select * into v_ctx from public.block_page_context(p_page_kind, p_page_id, p_claim_id);

  select exists (
    select 1 from public.directory_page_blocks b
    where case when p_page_kind = 'entry' then b.entry_id = p_page_id else b.content_page_id = p_page_id end
  ) into v_converted;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id,
      'region', b.region,
      'position', b.position,
      'block_type', b.block_type,
      'template_id', b.template_id,
      'template_name', t.name,
      'linked', b.data is null,
      'data', coalesce(b.data, t.data),
      'common', b.common,
      'lock_position', b.lock_position,
      'lock_content', b.lock_content,
      'placement', t.placement,
      'can_edit', v_ctx.is_admin or not b.lock_content,
      'can_edit_content', not b.lock_content,
      'can_move', v_ctx.is_admin or not b.lock_position,
      'can_remove', v_ctx.is_admin or not b.lock_position,
      'converted_from', b.converted_from,
      'updated_at', b.updated_at
    ) order by b.region, b.position), '[]'::jsonb)
  into v_blocks
  from public.directory_page_blocks b
  left join public.directory_block_templates t on t.id = b.template_id
  where case when p_page_kind = 'entry' then b.entry_id = p_page_id else b.content_page_id = p_page_id end;

  return jsonb_build_object('converted', v_converted, 'is_admin', v_ctx.is_admin, 'blocks', v_blocks);
end;
$$;

create or replace function public.convert_page_to_blocks(p_page_kind text, p_page_id text, p_claim_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
begin
  select * into v_ctx from public.block_page_context(p_page_kind, p_page_id, p_claim_id);
  if p_page_kind = 'entry' then
    return public.convert_entry_to_blocks(p_page_id);
  end if;
  return public.convert_content_page_to_blocks(p_page_id);
end;
$$;

create or replace function public.add_page_block(
  p_page_kind text,
  p_page_id text,
  p_region text default null,
  p_block_type text default null,
  p_data jsonb default null,
  p_common jsonb default '{}'::jsonb,
  p_index integer default null,
  p_template_id uuid default null,
  p_claim_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_t public.directory_block_templates%rowtype;
  v_type text := p_block_type;
  v_region text := p_region;
  v_data jsonb := p_data;
  v_common jsonb := coalesce(p_common, '{}'::jsonb);
  v_lock_pos boolean := false;
  v_lock_content boolean := false;
  v_max integer;
  v_count integer;
  v_id uuid;
begin
  select * into v_ctx from public.block_page_context(p_page_kind, p_page_id, p_claim_id);

  if p_template_id is not null then
    select * into v_t from public.directory_block_templates
    where id = p_template_id and directory_id = v_ctx.directory_id and page_kind = p_page_kind;
    if not found then
      raise exception 'Block template not found for this page';
    end if;
    v_type := v_t.block_type;
    v_region := v_t.region;
    v_data := null; -- linked: inherits the template
    v_common := v_t.common || v_common;
    v_lock_pos := v_t.lock_position;
    v_lock_content := v_t.lock_content;
    if exists (
      select 1 from public.directory_page_blocks b
      where b.template_id = p_template_id
        and case when p_page_kind = 'entry' then b.entry_id = p_page_id else b.content_page_id = p_page_id end
    ) then
      raise exception 'This page already has that block';
    end if;
    if not public.block_region_allowed(p_page_kind, v_region, v_type) then
      raise exception 'This block cannot go in that region';
    end if;
  else
    if v_type is null or v_region is null then
      raise exception 'block_type and region are required';
    end if;
    perform public.assert_block_valid(p_page_kind, v_region, v_type, v_data, v_common);
  end if;

  v_max := (public.block_def(v_type) ->> 'maxPerPage')::int;
  if v_max is not null then
    select count(*) into v_count from public.directory_page_blocks b
    where b.block_type = v_type
      and case when p_page_kind = 'entry' then b.entry_id = p_page_id else b.content_page_id = p_page_id end;
    if v_count >= v_max then
      raise exception 'A page can have at most % of this block', v_max;
    end if;
  end if;

  if p_index is not null then
    update public.directory_page_blocks b set position = b.position + 1
    where b.region = v_region and b.position >= p_index
      and case when p_page_kind = 'entry' then b.entry_id = p_page_id else b.content_page_id = p_page_id end;
  end if;

  insert into public.directory_page_blocks (
    directory_id, page_kind, entry_id, content_page_id, region, position, block_type,
    template_id, data, common, lock_position, lock_content, updated_by
  ) values (
    v_ctx.directory_id, p_page_kind,
    case when p_page_kind = 'entry' then p_page_id end,
    case when p_page_kind = 'content_page' then p_page_id end,
    v_region, coalesce(p_index, 1000000), v_type,
    p_template_id, v_data, v_common, v_lock_pos, v_lock_content, auth.uid()
  ) returning id into v_id;

  perform public.normalise_block_region(p_page_kind, p_page_id, v_region);
  perform public.touch_block_page(p_page_kind, p_page_id, v_ctx.claim_user_id);
  return v_id;
end;
$$;

create or replace function public.update_page_block(
  p_block_id uuid,
  p_data jsonb default null,
  p_common jsonb default null,
  p_claim_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b public.directory_page_blocks%rowtype;
  v_page_kind text;
  v_page_id text;
  v_ctx record;
  v_new_common jsonb;
begin
  select * into v_b from public.directory_page_blocks where id = p_block_id;
  if not found then
    raise exception 'Block not found';
  end if;
  select page_kind, page_id into v_page_kind, v_page_id from public.block_page_of(p_block_id);
  select * into v_ctx from public.block_page_context(v_page_kind, v_page_id, p_claim_id);

  if v_b.lock_content then
    if not v_ctx.is_admin then
      raise exception 'This block is locked by the directory administrator';
    end if;
    if p_data is not null then
      raise exception 'The content of this block is locked; edit its block template instead';
    end if;
  end if;

  v_new_common := coalesce(p_common, v_b.common);
  perform public.assert_block_valid(v_page_kind, v_b.region, v_b.block_type, coalesce(p_data, v_b.data, '{}'::jsonb), v_new_common);

  -- Setting data detaches a linked block from its template (data becomes the page's own).
  update public.directory_page_blocks
     set data = coalesce(p_data, data),
         common = v_new_common,
         updated_by = auth.uid()
   where id = p_block_id;

  perform public.touch_block_page(v_page_kind, v_page_id, v_ctx.claim_user_id);
end;
$$;

create or replace function public.reset_page_block_to_template(p_block_id uuid, p_claim_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b public.directory_page_blocks%rowtype;
  v_page_kind text;
  v_page_id text;
  v_ctx record;
begin
  select * into v_b from public.directory_page_blocks where id = p_block_id;
  if not found then
    raise exception 'Block not found';
  end if;
  if v_b.template_id is null then
    raise exception 'This block was not made from a template';
  end if;
  select page_kind, page_id into v_page_kind, v_page_id from public.block_page_of(p_block_id);
  select * into v_ctx from public.block_page_context(v_page_kind, v_page_id, p_claim_id);
  if v_b.lock_content and not v_ctx.is_admin then
    raise exception 'This block is locked by the directory administrator';
  end if;

  update public.directory_page_blocks set data = null, updated_by = auth.uid() where id = p_block_id;
  perform public.touch_block_page(v_page_kind, v_page_id, v_ctx.claim_user_id);
end;
$$;

create or replace function public.move_page_block(
  p_block_id uuid,
  p_region text,
  p_index integer,
  p_claim_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b public.directory_page_blocks%rowtype;
  v_page_kind text;
  v_page_id text;
  v_ctx record;
begin
  select * into v_b from public.directory_page_blocks where id = p_block_id;
  if not found then
    raise exception 'Block not found';
  end if;
  select page_kind, page_id into v_page_kind, v_page_id from public.block_page_of(p_block_id);
  select * into v_ctx from public.block_page_context(v_page_kind, v_page_id, p_claim_id);
  if v_b.lock_position and not v_ctx.is_admin then
    raise exception 'This block is locked in position by the directory administrator';
  end if;
  if not public.block_region_allowed(v_page_kind, p_region, v_b.block_type) then
    raise exception 'This block cannot go in that region';
  end if;

  -- Open a gap at the target index, then place the block there; normalisation tidies both regions.
  update public.directory_page_blocks b set position = b.position + 1
  where b.region = p_region and b.position >= p_index and b.id <> p_block_id
    and case when v_page_kind = 'entry' then b.entry_id = v_page_id else b.content_page_id = v_page_id end;
  update public.directory_page_blocks set region = p_region, position = p_index, updated_by = auth.uid() where id = p_block_id;

  perform public.normalise_block_region(v_page_kind, v_page_id, p_region);
  if v_b.region <> p_region then
    perform public.normalise_block_region(v_page_kind, v_page_id, v_b.region);
  end if;
  perform public.touch_block_page(v_page_kind, v_page_id, v_ctx.claim_user_id);
end;
$$;

create or replace function public.remove_page_block(p_block_id uuid, p_claim_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b public.directory_page_blocks%rowtype;
  v_page_kind text;
  v_page_id text;
  v_ctx record;
begin
  select * into v_b from public.directory_page_blocks where id = p_block_id;
  if not found then
    raise exception 'Block not found';
  end if;
  select page_kind, page_id into v_page_kind, v_page_id from public.block_page_of(p_block_id);
  select * into v_ctx from public.block_page_context(v_page_kind, v_page_id, p_claim_id);
  if v_b.lock_position and not v_ctx.is_admin then
    raise exception 'This block is locked in position by the directory administrator';
  end if;

  delete from public.directory_page_blocks where id = p_block_id;
  perform public.normalise_block_region(v_page_kind, v_page_id, v_b.region);
  perform public.touch_block_page(v_page_kind, v_page_id, v_ctx.claim_user_id);
end;
$$;


-- ---- 6. Template RPCs (directory admins only) ----

create or replace function public.require_directory_admin(p_directory_id text)
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_client text;
begin
  select d.client_id into v_client from public.directories d where d.id = p_directory_id;
  if v_client is null then
    raise exception 'Directory not found';
  end if;
  if not public.is_directory_admin(v_client) then
    raise exception 'Access denied';
  end if;
  if not public.is_entity_live('directory', p_directory_id) then
    raise exception 'This directory is archived';
  end if;
  return v_client;
end;
$$;

create or replace function public.save_block_template(
  p_directory_id text,
  p_page_kind text,
  p_name text,
  p_block_type text,
  p_region text,
  p_data jsonb,
  p_common jsonb default '{}'::jsonb,
  p_lock_position boolean default false,
  p_lock_content boolean default false,
  p_placement text default 'end',
  p_auto_add boolean default false,
  p_template_id uuid default null,
  p_relink_detached boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.directory_block_templates%rowtype;
  v_id uuid;
  v_detached integer;
  v_data_changed boolean;
  v_pg record;
begin
  perform public.require_directory_admin(p_directory_id);
  perform public.assert_block_valid(p_page_kind, p_region, p_block_type, p_data, coalesce(p_common, '{}'::jsonb));

  if p_template_id is null then
    insert into public.directory_block_templates (
      directory_id, page_kind, name, block_type, region, data, common,
      lock_position, lock_content, placement, auto_add, created_by
    ) values (
      p_directory_id, p_page_kind, p_name, p_block_type, p_region, p_data, coalesce(p_common, '{}'::jsonb),
      p_lock_position, p_lock_content, p_placement, p_auto_add, auth.uid()
    ) returning id into v_id;
    return v_id;
  end if;

  select * into v_old from public.directory_block_templates where id = p_template_id and directory_id = p_directory_id for update;
  if not found then
    raise exception 'Block template not found';
  end if;
  if (v_old.block_type, v_old.region, v_old.page_kind) is distinct from (p_block_type, p_region, p_page_kind)
     and exists (select 1 from public.directory_page_blocks where template_id = p_template_id) then
    raise exception 'The type, region and page kind of a template in use cannot change';
  end if;

  if p_lock_content and not v_old.lock_content then
    select count(*) into v_detached from public.directory_page_blocks where template_id = p_template_id and data is not null;
    if v_detached > 0 and not p_relink_detached then
      raise exception '% pages have edited this block. Locking its content would discard their changes; confirm to reset them.', v_detached;
    end if;
    update public.directory_page_blocks set data = null where template_id = p_template_id and data is not null;
  end if;

  v_data_changed := v_old.data is distinct from p_data;

  update public.directory_block_templates set
    name = p_name, data = p_data, common = coalesce(p_common, '{}'::jsonb),
    lock_position = p_lock_position, lock_content = p_lock_content,
    placement = p_placement, auto_add = p_auto_add,
    content_version = content_version + case when v_data_changed then 1 else 0 end
  where id = p_template_id;

  -- Locks follow the template for every instance of it.
  update public.directory_page_blocks set lock_position = p_lock_position, lock_content = p_lock_content
  where template_id = p_template_id and (lock_position <> p_lock_position or lock_content <> p_lock_content);

  -- Pages that inherit the changed content need rebuilding; placement or lock changes re-pin their region.
  if v_data_changed then
    update public.directory_entries set updated_at = now()
    where id in (select entry_id from public.directory_page_blocks where template_id = p_template_id and data is null and entry_id is not null);
    update public.directory_content_pages set updated_at = now()
    where id in (select content_page_id from public.directory_page_blocks where template_id = p_template_id and data is null and content_page_id is not null);
  end if;
  if v_old.placement <> p_placement or v_old.lock_position <> p_lock_position then
    for v_pg in
      select distinct b.page_kind, coalesce(b.entry_id, b.content_page_id) as page_id, b.region
      from public.directory_page_blocks b where b.template_id = p_template_id
    loop
      perform public.normalise_block_region(v_pg.page_kind, v_pg.page_id, v_pg.region);
    end loop;
  end if;

  return p_template_id;
end;
$$;

create or replace function public.delete_block_template(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.directory_block_templates%rowtype;
begin
  select * into v_t from public.directory_block_templates where id = p_template_id for update;
  if not found then
    raise exception 'Block template not found';
  end if;
  perform public.require_directory_admin(v_t.directory_id);

  -- Every instance keeps what its page shows today and becomes the page's own.
  update public.directory_page_blocks
     set data = coalesce(data, v_t.data), template_id = null, lock_position = false, lock_content = false
   where template_id = p_template_id;

  delete from public.directory_block_templates where id = p_template_id;
end;
$$;

-- Adds the template to up to p_limit pages that lack it, converting each page first so it keeps today's content.
-- Call repeatedly until remaining = 0. Also re-adds the block on pages where an owner removed it.
create or replace function public.stamp_block_template(p_template_id uuid, p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.directory_block_templates%rowtype;
  v_page text;
  v_stamped integer := 0;
  v_remaining integer;
begin
  select * into v_t from public.directory_block_templates where id = p_template_id;
  if not found then
    raise exception 'Block template not found';
  end if;
  perform public.require_directory_admin(v_t.directory_id);
  if not public.block_region_allowed(v_t.page_kind, v_t.region, v_t.block_type) then
    raise exception 'This template cannot be placed on that kind of page';
  end if;

  for v_page in
    select case when v_t.page_kind = 'entry' then e.id else c.id end
    from (select 1) one
    left join public.directory_entries e on v_t.page_kind = 'entry' and e.directory_id = v_t.directory_id
      and not exists (select 1 from public.directory_page_blocks b where b.template_id = v_t.id and b.entry_id = e.id)
    left join public.directory_content_pages c on v_t.page_kind = 'content_page' and c.directory_id = v_t.directory_id
      and not exists (select 1 from public.directory_page_blocks b where b.template_id = v_t.id and b.content_page_id = c.id)
    where case when v_t.page_kind = 'entry' then e.id else c.id end is not null
    order by 1
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  loop
    if v_t.page_kind = 'entry' then
      perform public.convert_entry_to_blocks(v_page);
    else
      perform public.convert_content_page_to_blocks(v_page);
    end if;

    insert into public.directory_page_blocks (
      directory_id, page_kind, entry_id, content_page_id, region, position, block_type,
      template_id, data, common, lock_position, lock_content, updated_by
    ) values (
      v_t.directory_id, v_t.page_kind,
      case when v_t.page_kind = 'entry' then v_page end,
      case when v_t.page_kind = 'content_page' then v_page end,
      v_t.region, case when v_t.placement = 'start' then -1 else 1000000 end, v_t.block_type,
      v_t.id, null, v_t.common, v_t.lock_position, v_t.lock_content, auth.uid()
    );
    perform public.normalise_block_region(v_t.page_kind, v_page, v_t.region);
    perform public.touch_block_page(v_t.page_kind, v_page, null);
    v_stamped := v_stamped + 1;
  end loop;

  select count(*) into v_remaining from (
    select e.id from public.directory_entries e
    where v_t.page_kind = 'entry' and e.directory_id = v_t.directory_id
      and not exists (select 1 from public.directory_page_blocks b where b.template_id = v_t.id and b.entry_id = e.id)
    union all
    select c.id from public.directory_content_pages c
    where v_t.page_kind = 'content_page' and c.directory_id = v_t.directory_id
      and not exists (select 1 from public.directory_page_blocks b where b.template_id = v_t.id and b.content_page_id = c.id)
  ) r;

  return jsonb_build_object('stamped', v_stamped, 'remaining', v_remaining);
end;
$$;


-- ---- 7. Grants ----
-- Helpers are internal: only the RPCs (security definer) call them.
revoke all on function public.block_registry() from public, anon, authenticated;
revoke all on function public.block_err(text, text) from public, anon, authenticated;
revoke all on function public.block_when(text, jsonb) from public, anon, authenticated;
revoke all on function public.block_object_errors(jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.block_field_errors(jsonb, jsonb, text, jsonb) from public, anon, authenticated;
revoke all on function public.block_data_errors(text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.assert_block_valid(text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.block_def(text) from public, anon, authenticated;
revoke all on function public.block_region_allowed(text, text, text) from public, anon, authenticated;
revoke all on function public.block_page_context(text, text, uuid) from public, anon, authenticated;
revoke all on function public.normalise_block_region(text, text, text) from public, anon, authenticated;
revoke all on function public.touch_block_page(text, text, uuid) from public, anon, authenticated;
revoke all on function public.block_page_of(uuid) from public, anon, authenticated;
revoke all on function public.require_directory_admin(text) from public, anon, authenticated;

revoke all on function public.is_directory_admin(text) from public, anon;
grant execute on function public.is_directory_admin(text) to authenticated;

revoke all on function public.get_page_blocks(text, text, uuid) from public, anon;
revoke all on function public.convert_page_to_blocks(text, text, uuid) from public, anon;
revoke all on function public.add_page_block(text, text, text, text, jsonb, jsonb, integer, uuid, uuid) from public, anon;
revoke all on function public.update_page_block(uuid, jsonb, jsonb, uuid) from public, anon;
revoke all on function public.reset_page_block_to_template(uuid, uuid) from public, anon;
revoke all on function public.move_page_block(uuid, text, integer, uuid) from public, anon;
revoke all on function public.remove_page_block(uuid, uuid) from public, anon;
revoke all on function public.save_block_template(text, text, text, text, text, jsonb, jsonb, boolean, boolean, text, boolean, uuid, boolean) from public, anon;
revoke all on function public.delete_block_template(uuid) from public, anon;
revoke all on function public.stamp_block_template(uuid, integer) from public, anon;
grant execute on function public.get_page_blocks(text, text, uuid) to authenticated;
grant execute on function public.convert_page_to_blocks(text, text, uuid) to authenticated;
grant execute on function public.add_page_block(text, text, text, text, jsonb, jsonb, integer, uuid, uuid) to authenticated;
grant execute on function public.update_page_block(uuid, jsonb, jsonb, uuid) to authenticated;
grant execute on function public.reset_page_block_to_template(uuid, uuid) to authenticated;
grant execute on function public.move_page_block(uuid, text, integer, uuid) to authenticated;
grant execute on function public.remove_page_block(uuid, uuid) to authenticated;
grant execute on function public.save_block_template(text, text, text, text, text, jsonb, jsonb, boolean, boolean, text, boolean, uuid, boolean) to authenticated;
grant execute on function public.delete_block_template(uuid) to authenticated;
grant execute on function public.stamp_block_template(uuid, integer) to authenticated;


-- ------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- Exercises the validator on real inputs, so a logic error fails the push.
-- ------------------------------------------------------------

do $$
declare
  v_ok jsonb := '{"title":"Safe, inclusive sport","body":"<p>Everyone is welcome.</p>","tone":"info"}'::jsonb;
  v_missing text;
begin
  -- valid blocks
  if jsonb_array_length(public.block_data_errors('entry', 'main', 'callout', v_ok, '{}')) <> 0 then
    raise exception 'VERIFY FAILED: a valid callout was rejected: %', public.block_data_errors('entry', 'main', 'callout', v_ok, '{}');
  end if;
  if jsonb_array_length(public.block_data_errors('entry', 'sidebar', 'callout', v_ok, '{"theme":"inverse","spacingAbove":"--ds-space-4","variants":{"icon":"on"}}')) <> 0 then
    raise exception 'VERIFY FAILED: callout with settings and variants was rejected: %', public.block_data_errors('entry', 'sidebar', 'callout', v_ok, '{"theme":"inverse","spacingAbove":"--ds-space-4","variants":{"icon":"on"}}');
  end if;
  if jsonb_array_length(public.block_data_errors('entry', 'hero', 'hero', '{"title":"Badminton","media":"none"}', '{}')) <> 0 then
    raise exception 'VERIFY FAILED: hero with no media was rejected: %', public.block_data_errors('entry', 'hero', 'hero', '{"title":"Badminton","media":"none"}', '{}');
  end if;
  if jsonb_array_length(public.block_data_errors('entry', 'main', 'entry_gallery', '{}', '{}')) <> 0 then
    raise exception 'VERIFY FAILED: entry_gallery with empty data was rejected';
  end if;
  if jsonb_array_length(public.block_data_errors('content_page', 'main', 'cards',
      '{"items":[{"heading":"One"},{"heading":"Two","link":{"kind":"url","target":"https://example.com"}}]}', '{}')) <> 0 then
    raise exception 'VERIFY FAILED: valid cards were rejected: %', public.block_data_errors('content_page', 'main', 'cards',
      '{"items":[{"heading":"One"},{"heading":"Two","link":{"kind":"url","target":"https://example.com"}}]}', '{}');
  end if;

  -- invalid blocks, each must produce at least one error
  select string_agg(t.i::text, ',') into v_missing from (select row_number() over () as i, x.errs from (values
    (public.block_data_errors('entry', 'main', 'no_such_block', '{}', '{}')),
    (public.block_data_errors('entry', 'hero', 'callout', v_ok, '{}')),
    (public.block_data_errors('content_page', 'main', 'claim', '{"title":"x"}', '{}')),
    (public.block_data_errors('entry', 'main', 'contact', '{}', '{}')),
    (public.block_data_errors('entry', 'main', 'callout', v_ok || '{"extra":1}', '{}')),
    (public.block_data_errors('entry', 'main', 'rich', '{"body":"<p>hi</p><script>alert(1)</script>"}', '{}')),
    (public.block_data_errors('entry', 'main', 'rich', '{"body":"<a href=\"javascript:alert(1)\">x</a>"}', '{}')),
    (public.block_data_errors('entry', 'main', 'rich', '{"body":"<img src=x onerror=alert(1)>"}', '{}')),
    (public.block_data_errors('entry', 'hero', 'hero', '{"media":"none"}', '{}')),
    (public.block_data_errors('entry', 'hero', 'hero', '{"title":"x","media":"image"}', '{}')),
    (public.block_data_errors('entry', 'main', 'cards', '{"items":[{"heading":"Only one"}]}', '{}')),
    (public.block_data_errors('entry', 'main', 'cards', '{"items":[{"heading":"a","link":{"kind":"url","target":"javascript:alert(1)"}},{"heading":"b"}]}', '{}')),
    (public.block_data_errors('entry', 'main', 'callout', v_ok, '{"spacingAbove":"12px"}')),
    (public.block_data_errors('entry', 'main', 'callout', v_ok, '{"variants":{"icon":"sideways"}}')),
    (public.block_data_errors('entry', 'main', 'callout', '{"title":"x","tone":"loud"}', '{}')),
    (public.block_data_errors('entry', 'main', 'heading', '{"title":"A heading that is far far far far far too long to be allowed here at all"}', '{}')),
    (public.block_data_errors('entry', 'main', 'entry_categorisation', '{}', '{}')),
    (public.block_data_errors('entry', 'main', 'rich', null, '{}'))
  ) as x(errs)) t where jsonb_array_length(t.errs) = 0;
  if v_missing is not null then
    raise exception 'VERIFY FAILED: these invalid blocks (by position in the list) were accepted: %', v_missing;
  end if;

  -- structure
  if (select count(*) from jsonb_array_elements(public.block_registry() -> 'blocks')) < 25 then
    raise exception 'VERIFY FAILED: block_registry() looks incomplete';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename in ('directory_block_templates', 'directory_page_blocks')) <> 6 then
    raise exception 'VERIFY FAILED: expected 6 policies on the block tables';
  end if;
  if has_function_privilege('authenticated', 'public.block_data_errors(text,text,text,jsonb,jsonb)', 'execute') then
    raise exception 'VERIFY FAILED: validator helpers must not be callable by authenticated';
  end if;
  if has_function_privilege('anon', 'public.add_page_block(text,text,text,text,jsonb,jsonb,integer,uuid,uuid)', 'execute') then
    raise exception 'VERIFY FAILED: add_page_block must not be callable by anon';
  end if;
  if not has_function_privilege('authenticated', 'public.add_page_block(text,text,text,text,jsonb,jsonb,integer,uuid,uuid)', 'execute') then
    raise exception 'VERIFY FAILED: add_page_block must be callable by authenticated';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'directory_page_blocks' and policyname = 'directory_page_blocks_own_client_write' and qual not like '%is_directory_admin%') then
    raise exception 'VERIFY FAILED: block write policy does not use is_directory_admin';
  end if;

  raise notice 'VERIFY PASSED';
end $$;

select 'directory_block_templates' as tbl, count(*) as rows from public.directory_block_templates union all
select 'directory_page_blocks', count(*) from public.directory_page_blocks union all
select 'directory_entries', count(*) from public.directory_entries
order by tbl;
