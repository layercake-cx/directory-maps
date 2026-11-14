import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import AdminLayout from "./AdminLayout.jsx";
import {
  Button, Callout, Checkbox, Field, FieldGrid, Section, Select, SettingsLayout, Skeleton, Textarea, TextInput, useConfirm,
} from "../../components/ui/index.js";
import "../../styles/wave-b/map-pages.css";
import "../../styles/wave-c/maps-users.css";

export default function AdminEditListing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [form, setForm] = useState({
    id: "",
    name: "",
    address: "",
    postcode: "",
    country: "",
    lat: "",
    lng: "",
    website_url: "",
    email: "",
    phone: "",
    logo_url: "",
    notes_html: "",
    allow_html: false,
    group_id: "",
    is_active: true,
    geocode_status: "",
  });

  const isNew = id === "new";

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr("");
        setMsg("");

        const { data: g, error: ge } = await supabase
          .from("groups")
          .select("id,name,sort_order")
          .order("sort_order", { ascending: true });

        if (ge) throw ge;
        setGroups(g ?? []);

        if (isNew) {
          const newId = crypto.randomUUID(); // stored as text
          setForm((f) => ({ ...f, id: newId, is_active: true }));
          setLoading(false);
          return;
        }

        const { data: row, error: le } = await supabase
          .from("listings")
          .select("*")
          .eq("id", id)
          .single();

        if (le) throw le;

        setForm({
          id: row.id ?? "",
          name: row.name ?? "",
          address: row.address ?? "",
          postcode: row.postcode ?? "",
          country: row.country ?? "",
          lat: row.lat ?? "",
          lng: row.lng ?? "",
          website_url: row.website_url ?? "",
          email: row.email ?? "",
          phone: row.phone ?? "",
          logo_url: row.logo_url ?? "",
          notes_html: row.notes_html ?? "",
          allow_html: !!row.allow_html,
          group_id: row.group_id ?? "",
          is_active: !!row.is_active,
          geocode_status: row.geocode_status ?? "",
        });

        setLoading(false);
      } catch (e) {
        setErr(e.message ?? String(e));
        setLoading(false);
      }
    })();
  }, [id, isNew]);

  const groupName = useMemo(
    () => groups.find((g) => g.id === form.group_id)?.name ?? "—",
    [groups, form.group_id]
  );

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    try {
      setSaving(true);
      setErr("");
      setMsg("");

      if (!form.id || !form.name) {
        setErr("ID and Name are required.");
        return;
      }

      const payload = {
        id: form.id,
        name: form.name.trim(),
        address: form.address || null,
        postcode: form.postcode || null,
        country: form.country || null,
        lat: form.lat === "" ? null : Number(form.lat),
        lng: form.lng === "" ? null : Number(form.lng),
        website_url: form.website_url || null,
        email: form.email || null,
        phone: form.phone || null,
        logo_url: form.logo_url || null,
        notes_html: form.notes_html || null,
        allow_html: !!form.allow_html,
        group_id: form.group_id || null,
        is_active: !!form.is_active,
        geocode_status: form.geocode_status || null,
      };

      const { error } = await supabase.from("listings").upsert(payload, { onConflict: "id" });
      if (error) throw error;

      setMsg("Saved.");
      if (isNew) navigate(`/admin/listings/${encodeURIComponent(form.id)}`, { replace: true });
    } catch (e) {
      setErr(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete ${form.name || "this listing"}?`,
      body: "This cannot be undone.",
      confirmLabel: "Delete listing",
      tone: "danger",
    });
    if (!ok) return;

    try {
      setSaving(true);
      setErr("");
      setMsg("");

      const { error } = await supabase.from("listings").delete().eq("id", form.id);
      if (error) throw error;

      navigate("/admin");
    } catch (e) {
      setErr(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  const title = isNew ? "New listing" : "Edit listing";

  if (loading) {
    return (
      <AdminLayout>
        <SettingsLayout head={{ title }}>
          <Skeleton variant="form" rows={4} label="Loading listing" />
        </SettingsLayout>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <SettingsLayout
        head={{
          title,
          subtitle: form.id,
          breadcrumb: [{ label: "Back", to: "/admin" }, { label: title }],
          actions: (
            <>
              {!isNew ? (
                <Button variant="danger" onClick={remove} disabled={saving}>Delete</Button>
              ) : null}
              <Button variant="primary" onClick={save} loading={saving} loadingLabel="Saving…">Save</Button>
            </>
          ),
        }}
      >
        {err ? <Callout tone="danger">{err}</Callout> : null}
        {msg ? <Callout tone="ok">{msg}</Callout> : null}

        <Section title="Core">
          <div className="mp-stack">
            <Field label="Name">
              <TextInput value={form.name} onChange={(e) => setField("name", e.target.value)} />
            </Field>

            <Field label="Group" hint={`Selected: ${groupName}`}>
              <Select value={form.group_id} onChange={(e) => setField("group_id", e.target.value)}>
                <option value="">—</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Checkbox
              label="Active"
              hint="Visible on map"
              checked={form.is_active}
              onChange={(e) => setField("is_active", e.target.checked)}
            />
          </div>
        </Section>

        <Section title="Address">
          <div className="mp-stack">
            <Field label="Address">
              <TextInput value={form.address} onChange={(e) => setField("address", e.target.value)} />
            </Field>
            <FieldGrid>
              <Field label="Postcode">
                <TextInput value={form.postcode} onChange={(e) => setField("postcode", e.target.value)} />
              </Field>
              <Field label="Country">
                <TextInput value={form.country} onChange={(e) => setField("country", e.target.value)} />
              </Field>
              <Field label="Lat">
                <TextInput value={form.lat} onChange={(e) => setField("lat", e.target.value)} />
              </Field>
              <Field label="Lng">
                <TextInput value={form.lng} onChange={(e) => setField("lng", e.target.value)} />
              </Field>
            </FieldGrid>
            <Field label="Geocode status">
              <TextInput
                value={form.geocode_status}
                onChange={(e) => setField("geocode_status", e.target.value)}
                placeholder="ok / zero_results / error / pending"
              />
            </Field>
          </div>
        </Section>

        <Section title="Contact & links">
          <div className="mp-stack">
            <Field label="Website URL">
              <TextInput value={form.website_url} onChange={(e) => setField("website_url", e.target.value)} />
            </Field>
            <FieldGrid>
              <Field label="Email">
                <TextInput value={form.email} onChange={(e) => setField("email", e.target.value)} />
              </Field>
              <Field label="Phone">
                <TextInput value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
              </Field>
            </FieldGrid>
            <Field label="Logo URL">
              <TextInput value={form.logo_url} onChange={(e) => setField("logo_url", e.target.value)} />
            </Field>
            {form.logo_url ? <img className="mu-logo-preview" src={form.logo_url} alt="Logo preview" /> : null}
          </div>
        </Section>

        <Section title="Notes">
          <div className="mp-stack">
            <Field label="Notes (HTML)">
              <Textarea
                className="mu-mono-input"
                value={form.notes_html}
                onChange={(e) => setField("notes_html", e.target.value)}
                rows={8}
              />
            </Field>
            <Checkbox
              label="Allow HTML"
              hint="Render as HTML in listing panel"
              checked={form.allow_html}
              onChange={(e) => setField("allow_html", e.target.checked)}
            />
          </div>
        </Section>
      </SettingsLayout>
    </AdminLayout>
  );
}
