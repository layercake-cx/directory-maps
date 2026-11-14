import React, { useState } from "react";
import {
  Button, AIButton, Section, SettingRow, Tabs, Field, TextInput, Select, Textarea, Checkbox, CheckboxGroup,
  FieldGrid, Switch, SegmentedControl, RadioCards, ColourField, OptionalColourField, TagPicker, Pill, Callout,
  useToast, EmptyState, ErrorState, Skeleton, Toolbar, BulkBar, DataTable, StatTile, StatGrid, ActionList,
  Dialog, ConfirmDialog, useConfirm, OverflowMenu, SaveBar, SparkIcon, PlusIcon,
} from "../../../components/ui/index.js";

const ROWS = [
  { id: "a", name: "Accountancy bodies", entries: 42, status: "Published" },
  { id: "b", name: "Engineering institutes", entries: 118, status: "Unpublished changes" },
  { id: "c", name: "Trade associations", entries: 0, status: "Draft" },
];
const STATUS_TONE = { Published: "live", "Unpublished changes": "warn", Draft: "neutral" };

/**
 * Review surface for the Discover UI kit: every component in every state, and the regression page afterwards.
 * Staff only (route /admin/ui-kit, not linked from the nav). Mirrors reference/21-in-page-component-library.html.
 */
export default function UiKit() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [sw, setSw] = useState(true);
  const [seg, setSeg] = useState("grid");
  const [card, setCard] = useState("map");
  const [checks, setChecks] = useState(["a"]);
  const [colour, setColour] = useState("#0f5e63");
  const [optColour, setOptColour] = useState(undefined);
  const [tags, setTags] = useState([{ id: "1", name: "Chartered" }, { id: "2", name: "Regulated" }]);
  const [selected, setSelected] = useState(["b"]);
  const [sort, setSort] = useState({ key: "name", dir: "asc" });
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(null);
  const [tab, setTab] = useState("details");
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("not-an-email");
  const [bio, setBio] = useState("A short description");

  const columns = [
    { key: "name", label: "Name", sortable: true },
    { key: "entries", label: "Entries", sortable: true, align: "right" },
    { key: "status", label: "Status", render: (r) => <Pill tone={STATUS_TONE[r.status]}>{r.status}</Pill> },
  ];
  const rowMenu = (r) => [
    { label: "Open", href: "#" },
    { label: "Duplicate", onSelect: () => toast(`Duplicated ${r.name}`) },
    { label: "Delete", danger: true, onSelect: async () => {
      if (await confirm({ title: `Delete ${r.name}?`, body: "This removes the directory and its entries. You can't undo this.", confirmLabel: "Delete directory", tone: "danger" })) toast("Deleted (demo)");
    } },
  ];

  return (
    <div className="uikit">
      <p className="uikit-note">Review page for the Discover UI kit. Every component below comes from <code>src/components/ui/</code>.</p>

      <Section title="Button" description="One primary per view. Labels start with a verb.">
        <div className="uikit-row">
          <Button variant="primary">Publish changes</Button>
          <Button>Cancel</Button>
          <Button variant="ghost">Skip for now</Button>
          <Button variant="danger">Remove</Button>
          <Button variant="danger-solid">Delete directory</Button>
          <Button variant="primary" icon={<PlusIcon />}>New directory</Button>
          <Button size="sm">Small</Button>
          <Button iconOnly aria-label="Add entry"><PlusIcon /></Button>
        </div>
        <div className="uikit-row">
          <Button variant="primary" loading loadingLabel="Saving…">Save</Button>
          <Button variant="primary" disabled disabledReason="Fix the errors above first">Save</Button>
          <Button as="a" href="#top">Link styled as a button</Button>
        </div>
      </Section>

      <Section title="AIButton" description="The spark is the only AI glyph.">
        <div className="uikit-row">
          <AIButton onGenerate={() => new Promise((r) => setTimeout(r, 1200))} />
          <AIButton variant="subtle" compact label="Suggest tags" onGenerate={() => new Promise((r) => setTimeout(r, 1200))} />
          <AIButton disabled disabledReason="Add a web address first" label="Draft with AI" onGenerate={() => {}} />
          <AIButton label="Fails" onGenerate={() => Promise.reject(new Error("We couldn't reach the AI service."))} />
          <span className="uikit-row"><SparkIcon size={16} /><SparkIcon size={12} /><SparkIcon size={20} /></span>
        </div>
      </Section>

      <Section title="Section and SettingRow">
        <Section title="Visitor features" description="Switches save instantly on overview pages." flush as="h3">
          <SettingRow label="Show the contact button" description="Visitors can email an entry." control={<Switch checked={sw} onChange={setSw} />} />
          <SettingRow label="Show the map" description="Needs email settings first." control={<><Pill tone="neutral">Unavailable</Pill><Button variant="ghost" size="sm">Set up email</Button></>} />
        </Section>
        <Section title="Danger zone" tone="danger" description="Always last on the page." as="h3" footer={<Button variant="danger">Delete directory</Button>}>
          <p className="uikit-note">Deleting removes every entry.</p>
        </Section>
      </Section>

      <Section title="Tabs" description="Level-4 record editors only.">
        <Tabs tabs={[{ key: "details", label: "Details" }, { key: "content", label: "Content" }, { key: "seo", label: "SEO" }]} current={tab} onSelect={setTab} />
      </Section>

      <Section title="Fields">
        <FieldGrid>
          <Field label="Name" required hint="Shown at the top of the page."><TextInput defaultValue="Accountancy bodies" /></Field>
          <Field label="Email" error="Enter a full email address, like name@example.org"><TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Sector"><Select options={[{ value: "a", label: "Accountancy" }, { value: "b", label: "Engineering" }]} /></Field>
          <Field label="Disabled"><TextInput disabled defaultValue="Locked" /></Field>
        </FieldGrid>
        <Field label="Description" count={{ value: bio.length, max: 160 }} hint="One or two sentences."><Textarea value={bio} onChange={(e) => setBio(e.target.value)} /></Field>
        <CheckboxGroup legend="Show on cards" options={[{ value: "a", label: "Logo" }, { value: "b", label: "Address", hint: "Needs geocoding" }, { value: "c", label: "Categories" }]} value={checks} onChange={setChecks} />
        <Checkbox label="Single checkbox" defaultChecked />
      </Section>

      <Section title="Choices">
        <div className="uikit-stack">
          <SegmentedControl label="Layout" value={seg} onChange={setSeg} options={[{ value: "grid", label: "Grid" }, { value: "list", label: "List" }, { value: "map", label: "Map" }]} />
          <RadioCards legend="Data approach" value={card} onChange={setCard} options={[
            { value: "map", label: "Build from a map", description: "Reuse pins from an existing map." },
            { value: "csv", label: "Import a CSV", description: "Start from a spreadsheet." },
            { value: "blank", label: "Start blank", description: "Add entries one at a time." },
          ]} />
          <ColourField label="Accent" hint="Buttons and links" value={colour} onChange={setColour} contrast={{ ratio: 7.9 }} />
          <OptionalColourField label="Header" hint="Leave blank to use the accent" value={optColour} fallback="#14191c" onChange={setOptColour} contrast={{ ratio: 3.4 }} />
          <TagPicker items={tags} onRemove={(id) => setTags((t) => t.filter((x) => x.id !== id))} onAdd={() => setTags((t) => [...t, { id: String(Date.now()), name: `Tag ${t.length + 1}` }])} addLabel="Add category" />
        </div>
      </Section>

      <Section title="Status: Pill and Callout">
        <div className="uikit-row">
          <Pill tone="live">Published</Pill><Pill tone="warn">Unpublished changes</Pill><Pill tone="neutral">Draft</Pill>
          <Pill tone="ok">Claimed</Pill><Pill tone="danger">Failed</Pill><Pill tone="info">Running</Pill>
          <Pill tone="ai">AI draft</Pill><Pill tone="neutral" dashed>Coming soon</Pill>
        </div>
        <div className="uikit-stack">
          <Callout tone="info" title="Heads up">Changes go live when you publish.</Callout>
          <Callout tone="ok">Imported 42 entries.</Callout>
          <Callout tone="warn" title="Not geocoded" action={<Button size="sm">Geocode now</Button>}>3 entries have no location.</Callout>
          <Callout tone="danger" title="Import failed">Nothing was changed. Check the file and try again.</Callout>
          <Callout tone="ai">This draft was written by AI. Review it before you save.</Callout>
        </div>
      </Section>

      <Section title="Toolbar, BulkBar and DataTable">
        <Toolbar>
          <Field label="Search"><TextInput placeholder="Search entries" /></Field>
          <Field label="Status"><Select options={[{ value: "", label: "All" }, { value: "p", label: "Published" }]} /></Field>
          <span className="toolbar-spacer" />
          <Button variant="primary" icon={<PlusIcon />}>New directory</Button>
        </Toolbar>
        {selected.length > 0 ? (
          <BulkBar count={selected.length} onClear={() => setSelected([])}>
            <AIButton compact variant="subtle" label="Draft SEO" onGenerate={() => {}} />
            <Button size="sm">Archive</Button>
            <Button size="sm" variant="danger">Delete</Button>
          </BulkBar>
        ) : null}
        <DataTable
          columns={columns} rows={ROWS} rowLink={() => "#"} selectable selected={selected} onSelectedChange={setSelected}
          rowMenu={rowMenu} sort={sort} onSortChange={setSort} caption="Directories"
          pagination={{ page, pageSize: 3, total: 9, onPage: setPage }}
        />
        <DataTable columns={columns} rows={[]} empty={<EmptyState art="encouraging" title="No directories yet" body="Create one to start adding entries." actions={<Button variant="primary">New directory</Button>} />} />
      </Section>

      <Section title="StatTile and ActionList">
        <StatGrid>
          <StatTile label="Entries" value="329" sub="12 added this month" href="#" />
          <StatTile label="Published" value="301" tone="ok" href="#" />
          <StatTile label="Need attention" value="28" tone="warn" href="#" />
          <StatTile label="Visits" value="4,210" />
        </StatGrid>
        <StatGrid compact>
          <StatTile compact label="Geocoded" value="326" tone="ok" />
          <StatTile compact label="Not geocoded" value="3" tone="warn" />
        </StatGrid>
        <ActionList items={[
          { key: "g", count: 3, title: "Entries not geocoded", description: "They won't appear on the map.", verb: "Geocode", tone: "warn", to: "#" },
          { key: "s", count: 18, title: "Entries without SEO text", verb: "Draft with AI", onClick: () => toast("Draft started (demo)") },
          { key: "z", count: 0, title: "Hidden: zero rows are not rendered", verb: "Fix" },
        ]} />
      </Section>

      <Section title="Empty, loading and error">
        <div className="uikit-row">
          <EmptyState art="welcome" title="Welcome" body="Nothing here yet." />
          <EmptyState art="searching" title="No matches" body="Try a different search." />
          <ErrorState title="We couldn't load this" body="Nothing has been lost. Try again." onRetry={() => toast("Retrying (demo)")} />
        </div>
        <Skeleton variant="table" rows={3} />
        <Skeleton variant="tiles" />
        <Skeleton variant="form" rows={2} />
      </Section>

      <Section title="Dialog, ConfirmDialog, OverflowMenu, Toast">
        <div className="uikit-row">
          <Button onClick={() => setDialog("plain")}>Open dialog</Button>
          <Button onClick={() => setDialog("confirm")}>Confirm (neutral)</Button>
          <Button variant="danger" onClick={() => setDialog("danger")}>Confirm (destructive)</Button>
          <Button onClick={async () => toast((await confirm({ title: "Archive 2 entries?", body: "They stop appearing on the site. You can restore them later.", confirmLabel: "Archive entries" })) ? "Archived 2 entries" : "Cancelled")}>useConfirm</Button>
          <OverflowMenu label="More actions" items={[{ label: "Rename", onSelect: () => toast("Rename (demo)") }, { label: "Disabled item", disabled: true }, { label: "Delete", danger: true, onSelect: () => toast("Delete (demo)") }]} />
          <Button onClick={() => toast("Saved")}>Toast</Button>
          <Button onClick={() => toast("Entry archived", { action: { label: "Undo", onClick: () => toast("Restored") } })}>Toast with undo</Button>
        </div>
      </Section>

      <Section title="SaveBar" description="Shown inline here; on pages it sticks to the bottom.">
        <SaveBar dirtyCount={2} saving={saving} savedAt={null} onDiscard={() => {}} onSave={() => { setSaving(true); setTimeout(() => setSaving(false), 1200); }} />
        <SaveBar dirtyCount={0} savedAt={new Date()} onDiscard={() => {}} onSave={() => {}} />
        <SaveBar dirtyCount={1} error="We couldn't save. Your changes are still here." onDiscard={() => {}} onSave={() => {}} />
      </Section>

      {dialog === "plain" ? (
        <Dialog title="Rename directory" onClose={() => setDialog(null)} footer={<><Button onClick={() => setDialog(null)}>Cancel</Button><Button variant="primary" onClick={() => setDialog(null)}>Save name</Button></>}>
          <Field label="Name"><TextInput defaultValue="Accountancy bodies" /></Field>
        </Dialog>
      ) : null}
      {dialog === "confirm" ? (
        <ConfirmDialog title="Publish 3 changes?" message="The live site updates in about a minute." confirmLabel="Publish changes" onConfirm={() => setDialog(null)} onCancel={() => setDialog(null)} />
      ) : null}
      {dialog === "danger" ? (
        <ConfirmDialog danger title="Delete 2 entries?" message="They are removed from the site. You can't undo this." confirmLabel="Delete entries" onConfirm={() => setDialog(null)} onCancel={() => setDialog(null)} />
      ) : null}
    </div>
  );
}
