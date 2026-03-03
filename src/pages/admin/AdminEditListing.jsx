import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";

export default function AdminEditListing() {
  const { id } = useParams();
  const navigate = useNavigate();

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
    const ok = window.confirm("Delete this listing? This cannot be undone.");
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

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0 }}>{isNew ? "New listing" : "Edit listing"}</h1>
          <div style={{ fontSize: 12, opacity: 0.75 }}>{form.id}</div>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link to="/admin">Back</Link>
          {!isNew ? (
            <button onClick={remove} disabled={saving} style={{ padding: "10px 14px" }}>
              Delete
            </button>
          ) : null}
          <button onClick={save} disabled={saving} style={{ padding: "10px 14px" }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {err ? <p style={{ marginTop: 12 }}>{err}</p> : null}
      {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}

      <Section title="Core">
        <Field label="Name">
          <input value={form.name} onChange={(e) => setField("name", e.target.value)} style={inputStyle} />
        </Field>

        <Field label="Group">
          <select value={form.group_id} onChange={(e) => setField("group_id", e.target.value)} style={inputStyle}>
            <option value="">—</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>Selected: {groupName}</div>
        </Field>

        <Field label="Active">
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setField("is_active", e.target.checked)}
            />
            Visible on map
          </label>
        </Field>
      </Section>

      <Section title="Address">
        <Field label="Address">
          <input value={form.address} onChange={(e) => setField("address", e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Postcode">
          <input value={form.postcode} onChange={(e) => setField("postcode", e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Country">
          <input value={form.country} onChange={(e) => setField("country", e.target.value)} style={inputStyle} />
        </Field>

        <div style={{ display: "flex", gap: 12 }}>
          <Field label="Lat">
            <input value={form.lat} onChange={(e) => setField("lat", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Lng">
            <input value={form.lng} onChange={(e) => setField("lng", e.target.value)} style={inputStyle} />
          </Field>
        </div>

        <Field label="Geocode status">
          <input
            value={form.geocode_status}
            onChange={(e) => setField("geocode_status", e.target.value)}
            style={inputStyle}
            placeholder="ok / zero_results / error / pending"
          />
        </Field>
      </Section>

      <Section title="Contact & links">
        <Field label="Website URL">
          <input
            value={form.website_url}
            onChange={(e) => setField("website_url", e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Email">
          <input value={form.email} onChange={(e) => setField("email", e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Phone">
          <input value={form.phone} onChange={(e) => setField("phone", e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Logo URL">
          <input value={form.logo_url} onChange={(e) => setField("logo_url", e.target.value)} style={inputStyle} />
          {form.logo_url ? (
            <div style={{ marginTop: 10 }}>
              <img
                src={form.logo_url}
                alt="logo preview"
                style={{ maxWidth: 240, maxHeight: 120, border: "1px solid #ddd", borderRadius: 8 }}
              />
            </div>
          ) : null}
        </Field>
      </Section>

      <Section title="Notes">
        <Field label="Notes (HTML)">
          <textarea
            value={form.notes_html}
            onChange={(e) => setField("notes_html", e.target.value)}
            rows={8}
            style={{ ...inputStyle, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
          />
        </Field>

        <Field label="Allow HTML">
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={form.allow_html}
              onChange={(e) => setField("allow_html", e.target.checked)}
            />
            Render as HTML in listing panel
          </label>
        </Field>
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid #eee" }}>
      <h2 style={{ margin: "0 0 12px 0", fontSize: 18 }}>{title}</h2>
      <div style={{ display: "grid", gap: 14 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 13, marginBottom: 6, opacity: 0.8 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "1px solid #ddd",
};