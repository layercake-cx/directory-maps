-- ============================================================
-- Rollback: 20261127100000_block_pages_preserve_notes
-- Reverses: the notes-preserving converter and the "hidden" visibility option.
-- Refuses while any block uses visibility "hidden" (the older registry would
-- reject it the next time that block is saved).
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'convert_entry_to_blocks') then
    raise exception 'ABORT: convert_entry_to_blocks() does not exist — nothing to roll back';
  end if;
  if exists (select 1 from public.directory_page_blocks where common ->> 'visibility' = 'hidden' limit 1) then
    raise exception 'ABORT: blocks with visibility hidden exist — make them visible or remove them before rolling back';
  end if;
end $$;

create or replace function public.block_registry()
returns jsonb
language sql
immutable
set search_path = public
as $fn$ select $registry${"version":"0.2","status":"phase 2: derived from the Discover pages handoff v0.1, adapted to this codebase","regions":{"hero":{"label":"Hero","width":"full"},"main":{"label":"Main","width":"flexible (~2/3)"},"sidebar":{"label":"Sidebar","width":"min 320px, optional sticky"}},"commonFields":[{"key":"anchorId","label":"Anchor ID","type":"slug"},{"key":"theme","label":"Theme","type":"enum","options":["default","inverse","accent"]},{"key":"spacingAbove","label":"Spacing above","type":"tokenRef","scale":"--ds-space-*"},{"key":"spacingBelow","label":"Spacing below","type":"tokenRef","scale":"--ds-space-*"},{"key":"visibility","label":"Visibility","type":"enum","options":["all","desktop","mobile"],"default":"all"}],"blocks":[{"id":"hero","name":"Hero banner","group":"structured","allowedRegions":["hero"],"purpose":"Introduces the page; first call to action.","fields":[{"key":"title","label":"Title","type":"text","required":true,"maxLength":40,"note":"Renders as the page H1"},{"key":"intro","label":"Intro","type":"textarea","maxLength":160},{"key":"icon","label":"Icon","type":"icon"},{"key":"showBreadcrumb","label":"Show breadcrumb","type":"boolean","default":true,"note":"Breadcrumb built from page hierarchy"},{"key":"media","label":"Background media","type":"enum","options":["image","none"],"default":"image"},{"key":"mediaAsset","label":"Media asset","type":"image","requiredWhen":"media!='none'","altTextRequired":true},{"key":"overlay","label":"Overlay","type":"enum","options":["left-fade","bottom-fade","full","none"],"default":"left-fade"},{"key":"primaryAction","label":"Primary action","type":"link"},{"key":"secondaryAction","label":"Secondary action","type":"link"}],"variants":{"height":["S","M","L"],"align":["left","centre"],"theme":["inverse","default"]},"tokens":["--ds-hero-min-height","--ds-color-inverse-bg","--ds-color-on-inverse","--ds-overlay","--ds-font-display","--ds-text-display","--ds-button-primary-bg"],"slots":[{"key":"tags","accepts":["tags"],"max":1}],"pageKinds":["entry","content_page"],"maxPerPage":1},{"id":"tags","name":"Tag list","group":"structured","allowedRegions":["hero","main"],"purpose":"Shows the entry's taxonomy terms as chips. Editors choose sources, not text.","fields":[{"key":"sources","label":"Sources","type":"multiEnum","options":["category","attributes","region"],"default":["category","attributes"]},{"key":"link","label":"Link behaviour","type":"enum","options":["filtered-listing","none"],"default":"filtered-listing"},{"key":"maxShown","label":"Max shown","type":"number","min":1,"max":12,"default":6,"note":"Overflow collapses to +n"},{"key":"highlight","label":"Highlighted term","type":"taxonomyRef"}],"variants":{"style":["filled","outline"],"size":["S","M"]},"tokens":["--ds-color-category-{slug}","--ds-radius-sm","--ds-text-label","--ds-tracking-label"],"pageKinds":["entry"]},{"id":"stats","name":"Stat list","group":"structured","allowedRegions":["hero","main"],"purpose":"Two to four short, checkable facts.","fields":[{"key":"title","label":"Block title","type":"text"},{"key":"items","label":"Items","type":"list","min":1,"max":4,"itemFields":[{"key":"value","label":"Value","type":"text","required":true,"maxLength":12},{"key":"label","label":"Label","type":"text","maxLength":40}]},{"key":"overlapPrevious","label":"Overlap previous block","type":"boolean","default":false}],"variants":{"style":["card","plain"],"valueColour":["category","ink"]},"tokens":["--ds-color-surface","--ds-shadow-1","--ds-text-stat","--ds-radius-lg"],"pageKinds":["entry","content_page"]},{"id":"cards","name":"Card grid","group":"structured","allowedRegions":["main"],"purpose":"Reasons, options, formats. Reused with different themes.","fields":[{"key":"title","label":"Block title","type":"text"},{"key":"headingLevel","label":"Heading level","type":"enum","options":["h2","h3"],"default":"h2"},{"key":"items","label":"Items","type":"list","min":2,"max":8,"itemFields":[{"key":"icon","label":"Icon","type":"icon"},{"key":"heading","label":"Heading","type":"text","required":true,"maxLength":40},{"key":"body","label":"Body","type":"richTextBasic","maxLength":200},{"key":"link","label":"Link","type":"link"}]},{"key":"columns","label":"Columns","type":"enum","options":["auto","2","3","4"],"default":"auto"}],"variants":{"theme":["default","inverse"],"card":["filled","outline"],"density":["comfortable","compact"]},"tokens":["--ds-color-surface","--ds-color-inverse-bg","--ds-radius-lg","--ds-color-icon-bg","--ds-color-icon","--ds-space-5"],"pageKinds":["entry","content_page"]},{"id":"media","name":"Media and list","group":"structured","allowedRegions":["main"],"purpose":"Image beside a short ordered or unordered list.","fields":[{"key":"title","label":"Block title","type":"text"},{"key":"media","label":"Media","type":"image","altTextRequired":true},{"key":"mediaPosition","label":"Media position","type":"enum","options":["left","right"],"default":"left"},{"key":"listStyle","label":"List style","type":"enum","options":["numbered","bulleted","checklist"],"default":"numbered"},{"key":"items","label":"Items","type":"list","min":1,"max":6,"itemFields":[{"key":"heading","label":"Heading","type":"text","required":true},{"key":"body","label":"Body","type":"text"}]}],"variants":{"mediaTilt":["on","off"]},"tokens":["--ds-radius-lg","--ds-tilt-angle","--ds-marker-bg","--ds-marker-fg"],"pageKinds":["entry","content_page"]},{"id":"attrs","name":"Attribute list","group":"structured","allowedRegions":["sidebar","main"],"purpose":"Explains each of the entry's attributes in its own terms; reads the same taxonomy as Tag list.","fields":[{"key":"title","label":"Block title","type":"text","default":"Is it for me?"},{"key":"source","label":"Source","type":"enum","options":["page-attributes","manual"],"default":"page-attributes"},{"key":"descriptions","label":"Per-attribute descriptions","type":"map","keyType":"taxonomyRef","valueType":"text","note":"Overrides the default description per entry"},{"key":"footerLink","label":"Footer link","type":"link"}],"variants":{"theme":["inverse","default"]},"tokens":["--ds-color-inverse-bg","--ds-color-accent","--ds-color-on-accent","--ds-radius-xl"],"pageKinds":["entry"]},{"id":"actions","name":"Action list","group":"structured","allowedRegions":["sidebar","main"],"purpose":"Linked next steps; the main conversion point.","fields":[{"key":"title","label":"Block title","type":"text","required":true},{"key":"subtitle","label":"Subtitle","type":"text"},{"key":"headerStyle","label":"Header style","type":"enum","options":["accent-band","plain"],"default":"accent-band"},{"key":"items","label":"Items","type":"list","min":1,"max":6,"itemFields":[{"key":"icon","label":"Icon","type":"icon"},{"key":"label","label":"Label","type":"text","required":true},{"key":"sublabel","label":"Sublabel","type":"text"},{"key":"link","label":"Link","type":"link","required":true}]},{"key":"sticky","label":"Sticky in sidebar","type":"boolean","default":false,"note":"Only applies in sidebar region"}],"variants":{"header":["accent","plain"]},"tokens":["--ds-color-accent","--ds-color-on-accent","--ds-shadow-2","--ds-sticky-offset","--ds-color-icon-bg"],"slots":[{"key":"footer","accepts":["chips"],"max":1}],"pageKinds":["entry","content_page"]},{"id":"chips","name":"Chip list","group":"structured","allowedRegions":["sidebar","main"],"purpose":"Short plain-text items (kit lists, formats).","fields":[{"key":"title","label":"Label","type":"text"},{"key":"items","label":"Items","type":"textList","min":1,"max":8,"itemMaxLength":30}],"variants":{"style":["pill","outline"]},"tokens":["--ds-color-subtle-bg","--ds-radius-pill","--ds-text-small"],"pageKinds":["entry","content_page"]},{"id":"contact","name":"Contact block","group":"structured","allowedRegions":["sidebar","main"],"purpose":"Generic organisation card backed by an Organisation record.","fields":[{"key":"title","label":"Block title","type":"text","note":"e.g. Governed by, Partner, Run by"},{"key":"organisation","label":"Organisation","type":"recordRef","recordType":"organisation","required":true},{"key":"fieldsShown","label":"Fields shown","type":"multiEnum","options":["logo","website","email","phone","address","social"],"default":["logo","website"]},{"key":"websiteLabel","label":"Website link label","type":"text","default":"Visit website"}],"variants":{"layout":["compact","full"],"logoSize":["S","M"]},"tokens":["--ds-color-surface","--ds-logo-size","--ds-radius-md","--ds-color-ink-muted","--ds-color-border"],"pageKinds":["entry","content_page"],"status":"deferred","deferredReason":"Needs Organisation records, which do not exist yet."},{"id":"claim","name":"Claim prompt","group":"structured","allowedRegions":["hero","main","sidebar"],"purpose":"Invites the organisation behind an entry to claim it.","fields":[{"key":"title","label":"Heading","type":"text","required":true,"mergeFields":["entry.name","entry.short_name"]},{"key":"body","label":"Body","type":"textarea","maxLength":200,"mergeFields":["entry.name","entry.short_name"]},{"key":"icon","label":"Icon","type":"icon"},{"key":"primaryAction","label":"Primary action","type":"link"},{"key":"secondaryLink","label":"Secondary link","type":"link"},{"key":"actionMode","label":"Action mode","type":"enum","options":["link-out","inline-form"],"default":"link-out"},{"key":"formFields","label":"Form fields","type":"multiEnum","options":["name","email","role","website","message"],"default":["name","email","message"],"requiredWhen":"actionMode=='inline-form'"},{"key":"layout","label":"Layout","type":"enum","options":["auto","banner","stacked"],"default":"auto","note":"auto = banner in hero/main, stacked in sidebar"}],"variants":{"tone":["neutral","accent"],"emphasisEdge":["left","top","none"],"dismissible":["yes","no"]},"tokens":["--ds-color-subtle-bg","--ds-color-callout-edge","--ds-color-ink","--ds-button-primary-bg","--ds-radius-md","--ds-space-4"],"visibilityRule":"entry.claimed == false","pageKinds":["entry"]},{"id":"rich","name":"Rich text","group":"text","allowedRegions":["main"],"purpose":"Paragraphs of editorial copy.","fields":[{"key":"title","label":"Heading","type":"text"},{"key":"body","label":"Body","type":"richText","marks":["bold","italic","link","bulletList","orderedList"]},{"key":"style","label":"Style","type":"enum","options":["normal","lead"],"default":"normal"}],"variants":{},"tokens":["--ds-text-body","--ds-measure","--ds-color-link"],"pageKinds":["entry","content_page"]},{"id":"heading","name":"Heading","group":"text","allowedRegions":["main"],"purpose":"Standalone section heading; creates an anchor.","fields":[{"key":"title","label":"Text","type":"text","required":true,"maxLength":60},{"key":"level","label":"Level","type":"enum","options":["h2","h3","h4"],"default":"h2"},{"key":"eyebrow","label":"Eyebrow","type":"text"}],"variants":{"case":["upper","sentence"]},"tokens":["--ds-font-display","--ds-text-h2","--ds-case-heading"],"pageKinds":["entry","content_page"]},{"id":"list","name":"List","group":"text","allowedRegions":["main"],"purpose":"Plain list without media.","fields":[{"key":"title","label":"Heading","type":"text"},{"key":"items","label":"Items","type":"textList","min":1,"max":20},{"key":"listStyle","label":"Style","type":"enum","options":["bulleted","numbered","checklist"],"default":"bulleted"}],"variants":{"columns":["1","2"]},"tokens":["--ds-marker-bg","--ds-marker-fg","--ds-space-3"],"pageKinds":["entry","content_page"]},{"id":"quote","name":"Quote","group":"text","allowedRegions":["main"],"purpose":"A real, attributed quote.","fields":[{"key":"title","label":"Quote","type":"textarea","required":true,"maxLength":280},{"key":"who","label":"Attribution","type":"text","required":true},{"key":"role","label":"Role or source","type":"text"}],"variants":{"style":["pull","inline"]},"tokens":["--ds-font-display","--ds-color-accent","--ds-text-h3"],"pageKinds":["entry","content_page"]},{"id":"callout","name":"Callout","group":"text","allowedRegions":["main","sidebar"],"purpose":"Boxed notice: tips, warnings, standard statements.","fields":[{"key":"title","label":"Heading","type":"text"},{"key":"body","label":"Body","type":"richTextBasic","maxLength":300},{"key":"tone","label":"Tone","type":"enum","options":["info","tip","warning"],"default":"info"}],"variants":{"icon":["on","off"]},"tokens":["--ds-color-callout-{tone}","--ds-radius-md","--ds-space-4"],"pageKinds":["entry","content_page"]},{"id":"faq","name":"FAQ","group":"text","allowedRegions":["main"],"purpose":"Expandable questions and answers.","fields":[{"key":"title","label":"Heading","type":"text"},{"key":"items","label":"Items","type":"list","min":1,"max":15,"itemFields":[{"key":"question","label":"Question","type":"text","required":true},{"key":"answer","label":"Answer","type":"richTextBasic","required":true}]},{"key":"firstOpen","label":"First item open","type":"boolean","default":false},{"key":"structuredData","label":"Add FAQPage structured data","type":"boolean","default":true}],"variants":{"expand":["one","many"]},"tokens":["--ds-color-border","--ds-text-h3","--ds-motion-fast"],"pageKinds":["entry","content_page"]},{"id":"table","name":"Table","group":"text","allowedRegions":["main"],"purpose":"Simple tabular facts.","fields":[{"key":"title","label":"Caption","type":"text","required":true,"note":"Required for accessibility"},{"key":"rows","label":"Rows","type":"table","maxColumns":6,"maxRows":30},{"key":"headerRow","label":"First row is header","type":"boolean","default":true}],"variants":{"striped":["on","off"]},"tokens":["--ds-color-border","--ds-color-subtle-bg","--ds-text-small"],"pageKinds":["entry","content_page"]},{"id":"divider","name":"Divider","group":"text","allowedRegions":["main"],"purpose":"Visual break between groups of blocks.","fields":[{"key":"style","label":"Style","type":"enum","options":["line","space","diagonal"],"default":"line"}],"variants":{"spacing":["S","M","L"]},"tokens":["--ds-color-border","--ds-space-7"],"pageKinds":["entry","content_page"]},{"id":"entry_hero","name":"Entry header","group":"page-data","allowedRegions":["hero"],"pageKinds":["entry"],"purpose":"Logo tile, name, summary and category chips, as on every entry page today.","fields":[],"variants":{},"tokens":[],"dataBound":true,"maxPerPage":1},{"id":"page_title","name":"Page title","group":"page-data","allowedRegions":["hero"],"pageKinds":["content_page"],"purpose":"Breadcrumb and page title for a content page.","fields":[],"variants":{},"tokens":[],"dataBound":true,"maxPerPage":1},{"id":"entry_hero_image","name":"Hero image","group":"page-data","allowedRegions":["main"],"pageKinds":["entry"],"purpose":"The entry's hero image.","fields":[{"key":"title","label":"Section label","type":"text","maxLength":60,"note":"Optional. Adds an anchored section heading and a jump chip."}],"variants":{},"tokens":[],"dataBound":true},{"id":"entry_gallery","name":"Photo gallery","group":"page-data","allowedRegions":["main"],"pageKinds":["entry"],"purpose":"The entry's gallery images.","fields":[{"key":"title","label":"Section label","type":"text","maxLength":60,"note":"Optional. Adds an anchored section heading and a jump chip."}],"variants":{},"tokens":[],"dataBound":true},{"id":"entry_accreditations","name":"Accreditation badges","group":"page-data","allowedRegions":["main"],"pageKinds":["entry"],"purpose":"Badges the entry holds.","fields":[{"key":"title","label":"Section label","type":"text","maxLength":60,"note":"Optional. Adds an anchored section heading and a jump chip."}],"variants":{},"tokens":[],"dataBound":true},{"id":"entry_evidence","name":"Evidence","group":"page-data","allowedRegions":["main"],"pageKinds":["entry"],"purpose":"Evidence items for the entry.","fields":[{"key":"title","label":"Section label","type":"text","maxLength":60,"note":"Optional. Adds an anchored section heading and a jump chip."}],"variants":{},"tokens":[],"dataBound":true},{"id":"entry_product_tiles","name":"Product tiles","group":"page-data","allowedRegions":["main"],"pageKinds":["entry"],"purpose":"Product tiles for the entry.","fields":[{"key":"title","label":"Section label","type":"text","maxLength":60,"note":"Optional. Adds an anchored section heading and a jump chip."}],"variants":{},"tokens":[],"dataBound":true},{"id":"entry_links","name":"Links","group":"page-data","allowedRegions":["main"],"pageKinds":["entry"],"purpose":"Prominent links for the entry.","fields":[{"key":"title","label":"Section label","type":"text","maxLength":60,"note":"Optional. Adds an anchored section heading and a jump chip."}],"variants":{},"tokens":[],"dataBound":true},{"id":"entry_categorisation","name":"Categorisation chips","group":"page-data","allowedRegions":["main"],"pageKinds":["entry"],"purpose":"The entry's terms from one categorisation.","fields":[{"key":"title","label":"Section label","type":"text","maxLength":60,"note":"Optional. Adds an anchored section heading and a jump chip."},{"key":"key","label":"Categorisation key","type":"slug","required":true}],"variants":{},"tokens":[],"dataBound":true},{"id":"entry_contact_panel","name":"Contact and address","group":"page-data","allowedRegions":["sidebar"],"pageKinds":["entry"],"purpose":"Website, Contact button, phone, email and address.","fields":[],"variants":{},"tokens":[],"dataBound":true,"maxPerPage":1},{"id":"entry_map_card","name":"Map card","group":"page-data","allowedRegions":["sidebar"],"pageKinds":["entry"],"purpose":"Map showing the entry's location.","fields":[],"variants":{},"tokens":[],"dataBound":true,"maxPerPage":1},{"id":"entry_attributes","name":"Directory attributes","group":"page-data","allowedRegions":["sidebar"],"pageKinds":["entry"],"purpose":"At-a-glance attribute table.","fields":[],"variants":{},"tokens":[],"dataBound":true,"maxPerPage":1},{"id":"entry_tag_chips","name":"Tag chips","group":"page-data","allowedRegions":["sidebar"],"pageKinds":["entry"],"purpose":"Chip lists for multi-select categorisations.","fields":[],"variants":{},"tokens":[],"dataBound":true,"maxPerPage":1}]}$registry$::jsonb $fn$;

create or replace function public.convert_entry_to_blocks(p_entry_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.directory_entries%rowtype;
  v_layout jsonb;
  v_source text := 'entry_template';
  v_el jsonb;
  v_ord bigint;
  v_type text;
  v_new_type text;
  v_data jsonb;
  v_pos integer := 0;
  v_count integer := 0;
  v_body text;
  v_implicit constant jsonb := '[{"type":"hero"},{"type":"heading"},{"type":"address_map"},{"type":"contact_details"},{"type":"accreditations"},{"type":"notes_html"},{"type":"gallery"},{"type":"evidence"},{"type":"product_tiles"},{"type":"links"}]'::jsonb;
begin
  select * into v_entry from public.directory_entries where id = p_entry_id;
  if not found then
    raise exception 'entry % not found', p_entry_id;
  end if;

  -- Idempotent: a page that already has instances is left alone.
  if exists (select 1 from public.directory_page_blocks where entry_id = p_entry_id) then
    return 0;
  end if;

  -- 1. template targeting one of the entry's category terms
  select t.layout_json into v_layout
  from public.entry_templates t
  join public.entry_category_terms ect on ect.term_id = t.applies_to_term_id and ect.entry_id = p_entry_id
  join public.category_terms ct on ct.id = t.applies_to_term_id
  where t.directory_id = v_entry.directory_id
  order by ct.sort_order, ct.id
  limit 1;

  -- 2. template targeting the entry's group
  if v_layout is null and v_entry.directory_group_id is not null then
    select t.layout_json into v_layout
    from public.entry_templates t
    where t.directory_id = v_entry.directory_id and t.applies_to_group_id = v_entry.directory_group_id
    limit 1;
  end if;

  -- 3. the directory default
  if v_layout is null then
    select t.layout_json into v_layout
    from public.entry_templates t
    where t.directory_id = v_entry.directory_id and t.is_default
    limit 1;
  end if;

  -- 4. implicit pre-DIR-E6 order (also when entry_templates has rows but none apply)
  if v_layout is null then
    v_layout := v_implicit;
    v_source := 'implicit_layout';
  end if;

  -- Hero region
  insert into public.directory_page_blocks (directory_id, page_kind, entry_id, region, position, block_type, data, converted_from)
  values (v_entry.directory_id, 'entry', p_entry_id, 'hero', 0, 'entry_hero', '{}'::jsonb, 'fixed_chrome');
  v_count := v_count + 1;

  -- Main region, in layout order
  for v_el, v_ord in select value, ordinality from jsonb_array_elements(v_layout) with ordinality loop
    v_type := v_el->>'type';
    if coalesce((v_el->>'hidden')::boolean, false) then
      continue;
    end if;
    v_data := case when coalesce(v_el->>'label', '') <> '' then jsonb_build_object('title', v_el->>'label') else '{}'::jsonb end;

    if v_type = 'notes_html' then
      -- Only if there is content; the body is stored the way the page
      -- renders it (plain text is escaped into a paragraph, as builders.ts does).
      if v_entry.notes_html is null or trim(v_entry.notes_html) = '' then
        continue;
      end if;
      v_body := case
        when v_entry.allow_html then v_entry.notes_html
        else '<p>' || replace(replace(replace(v_entry.notes_html, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</p>'
      end;
      v_new_type := 'rich';
      v_data := v_data || jsonb_build_object('body', v_body, 'style', 'normal');
    elsif v_type = 'hero' then v_new_type := 'entry_hero_image';
    elsif v_type = 'gallery' then v_new_type := 'entry_gallery';
    elsif v_type = 'accreditations' then v_new_type := 'entry_accreditations';
    elsif v_type = 'evidence' then v_new_type := 'entry_evidence';
    elsif v_type = 'product_tiles' then v_new_type := 'entry_product_tiles';
    elsif v_type = 'links' then v_new_type := 'entry_links';
    elsif v_type = 'categorisation' then
      v_new_type := 'entry_categorisation';
      v_data := v_data || jsonb_build_object('key', v_el->>'key');
    else
      -- logo / heading / address_map / contact_details (no-ops today) and
      -- any unknown type: nothing to carry over.
      continue;
    end if;

    v_pos := v_pos + 1;
    insert into public.directory_page_blocks (directory_id, page_kind, entry_id, region, position, block_type, data, converted_from)
    values (
      v_entry.directory_id, 'entry', p_entry_id, 'main', v_pos, v_new_type, v_data,
      case when v_type = 'notes_html' then 'notes_html' else v_source end
    );
    v_count := v_count + 1;
  end loop;

  -- Sidebar region: the fixed panels, in today's order
  insert into public.directory_page_blocks (directory_id, page_kind, entry_id, region, position, block_type, data, converted_from)
  select v_entry.directory_id, 'entry', p_entry_id, 'sidebar', s.ord, s.btype, '{}'::jsonb, 'fixed_chrome'
  from (values (1, 'entry_contact_panel'), (2, 'entry_map_card'), (3, 'entry_attributes'), (4, 'entry_tag_chips')) as s(ord, btype);
  v_count := v_count + 4;

  return v_count;
end;
$$;

revoke all on function public.convert_entry_to_blocks(text) from public, anon, authenticated;
grant execute on function public.convert_entry_to_blocks(text) to service_role;
revoke all on function public.block_registry() from public, anon, authenticated;

do $$
begin
  if pg_get_functiondef('public.convert_entry_to_blocks(text)'::regprocedure) like '%v_notes_done%' then
    raise exception 'ROLLBACK VERIFY FAILED: the converter still preserves notes';
  end if;
  raise notice 'ROLLBACK VERIFY PASSED';
end $$;
