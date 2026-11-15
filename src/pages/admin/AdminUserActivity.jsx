import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ADMIN_EVENT_CATEGORY_LABELS,
  ADMIN_EVENT_SUBTYPES_BY_CATEGORY,
} from "../../lib/adminEvents.js";
import { supabase } from "../../lib/supabase";
import AdminLayout from "./AdminLayout.jsx";
import LogsFeaturePanel from "../../components/shell/LogsFeaturePanel.jsx";
import { Button, Callout, EmptyState, Field, PageLayout, Pill, Section, Select, Skeleton, Toolbar } from "../../components/ui/index.js";
import "../../styles/wave-c/ops.css";

const PAGE_SIZE = 200;

function formatUtc(iso) {
  if (!iso) return "—";
  return iso.replace("T", " ").replace(/\.\d{3}Z?$/, "Z");
}

function formatJson(v) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function categoryLabel(category) {
  return ADMIN_EVENT_CATEGORY_LABELS[category] ?? category;
}

export default function AdminUserActivity() {
  const [rows, setRows] = useState([]);
  const [clientsById, setClientsById] = useState({});
  const [mapsById, setMapsById] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState({});

  const [filterType, setFilterType] = useState("");
  const [filterSubtype, setFilterSubtype] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [filterMapId, setFilterMapId] = useState("");

  const [clientOptions, setClientOptions] = useState([]);
  const [mapOptions, setMapOptions] = useState([]);
  const [actorByUserId, setActorByUserId] = useState({});

  const subtypeOptions = useMemo(() => {
    if (!filterType) {
      const all = new Set();
      Object.values(ADMIN_EVENT_SUBTYPES_BY_CATEGORY).forEach((list) => {
        list.forEach((s) => all.add(s));
      });
      return [...all].sort();
    }
    return ADMIN_EVENT_SUBTYPES_BY_CATEGORY[filterType] ?? [];
  }, [filterType]);

  const filteredMapOptions = useMemo(() => {
    if (!filterClientId) return mapOptions;
    return mapOptions.filter((m) => m.client_id === filterClientId);
  }, [mapOptions, filterClientId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: clients, error: ce }, { data: maps, error: me }] = await Promise.all([
        supabase.from("clients").select("id, name").order("name", { ascending: true }),
        supabase.from("maps").select("id, name, client_id").order("name", { ascending: true }),
      ]);
      if (cancelled) return;
      if (ce || me) return;
      setClientOptions(clients ?? []);
      setMapOptions(maps ?? []);
      const cMap = {};
      (clients ?? []).forEach((c) => {
        cMap[c.id] = c;
      });
      const mMap = {};
      (maps ?? []).forEach((m) => {
        mMap[m.id] = m;
      });
      setClientsById(cMap);
      setMapsById(mMap);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      let q = supabase
        .from("admin_events")
        .select(
          "id,occurred_at,event_type,event_category,event_subtype,client_id,map_id,actor_user_id,meta",
        )
        .order("occurred_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (filterType) q = q.eq("event_category", filterType);
      if (filterSubtype) q = q.eq("event_subtype", filterSubtype);
      if (filterClientId) q = q.eq("client_id", filterClientId);
      if (filterMapId) q = q.eq("map_id", filterMapId);

      const { data, error } = await q;
      if (error) throw error;
      const nextRows = data ?? [];
      setRows(nextRows);

      const actorIds = Array.from(
        new Set(
          nextRows
            .map((r) => r.actor_user_id || r?.meta?.actor_user_id || null)
            .filter((v) => typeof v === "string" && v.length > 0)
        )
      );

      if (actorIds.length > 0) {
        const [{ data: contacts }, { data: profiles }] = await Promise.all([
          supabase
            .from("contacts")
            .select("user_id, name, email, is_primary, created_at")
            .in("user_id", actorIds),
          supabase.from("profiles").select("user_id, role").in("user_id", actorIds),
        ]);

        const contactsByUserId = {};
        for (const c of contacts ?? []) {
          const id = c.user_id;
          if (!id) continue;
          const existing = contactsByUserId[id];
          if (!existing) {
            contactsByUserId[id] = c;
            continue;
          }
          const existingScore = (existing.is_primary ? 10 : 0) + (existing.name ? 2 : 0);
          const nextScore = (c.is_primary ? 10 : 0) + (c.name ? 2 : 0);
          if (nextScore > existingScore) contactsByUserId[id] = c;
        }

        const profilesByUserId = {};
        for (const p of profiles ?? []) {
          if (p.user_id) profilesByUserId[p.user_id] = p;
        }

        const actorMap = {};
        for (const id of actorIds) {
          const c = contactsByUserId[id];
          const p = profilesByUserId[id];
          actorMap[id] = {
            label: c?.name || c?.email || id,
            email: c?.email || null,
            role: p?.role || null,
          };
        }
        setActorByUserId(actorMap);
      } else {
        setActorByUserId({});
      }
    } catch (e) {
      setErr(e?.message ?? String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filterType, filterSubtype, filterClientId, filterMapId]);

  useEffect(() => {
    load();
  }, [load]);

  function onTypeChange(value) {
    setFilterType(value);
    setFilterSubtype("");
  }

  function onClientChange(value) {
    setFilterClientId(value);
    if (value && filterMapId) {
      const map = mapsById[filterMapId];
      if (map && map.client_id !== value) setFilterMapId("");
    }
  }

  function toggle(id) {
    setExpanded((s) => ({ ...s, [id]: !s[id] }));
  }

  function clearFilters() {
    setFilterType("");
    setFilterSubtype("");
    setFilterClientId("");
    setFilterMapId("");
  }

  const hasFilters = filterType || filterSubtype || filterClientId || filterMapId;

  return (
    <AdminLayout panel={<LogsFeaturePanel />}>
      <PageLayout
        head={{
          title: "User activity",
          subtitle: (
            <>
              Admin and client-portal actions (newest first, up to {PAGE_SIZE} rows). Apply the{" "}
              <code>admin_events</code> migration if this list is empty or errors.
            </>
          ),
          actions: (
            <Button onClick={load} loading={loading} loadingLabel="Loading…">
              Refresh
            </Button>
          ),
        }}
      >
        <Toolbar>
          <Field label="Type" className="ops-toolbar-field">
            <Select value={filterType} onChange={(e) => onTypeChange(e.target.value)}>
              <option value="">All types</option>
              {Object.entries(ADMIN_EVENT_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Subtype" className="ops-toolbar-field">
            <Select value={filterSubtype} onChange={(e) => setFilterSubtype(e.target.value)}>
              <option value="">All subtypes</option>
              {subtypeOptions.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Client" className="ops-toolbar-field">
            <Select value={filterClientId} onChange={(e) => onClientChange(e.target.value)}>
              <option value="">All clients</option>
              {clientOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.id}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Map" className="ops-toolbar-field">
            <Select value={filterMapId} onChange={(e) => setFilterMapId(e.target.value)}>
              <option value="">All maps</option>
              {filteredMapOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.id}
                </option>
              ))}
            </Select>
          </Field>

          {hasFilters ? <Button onClick={clearFilters}>Clear filters</Button> : null}
        </Toolbar>

        {err ? <Callout tone="danger">{err}</Callout> : null}

        <Section flush>
          {loading && !rows.length ? (
            <Skeleton variant="table" label="Loading events" />
          ) : !rows.length ? (
            <EmptyState art="searching" title="No events match these filters" body="Clear a filter or refresh to check again." />
          ) : (
            <div className="table-wrap">
              <table className="table ops-log-table">
                <caption className="sr-only">User activity</caption>
                <thead>
                  <tr>
                    <th>Time (UTC)</th>
                    <th>Type</th>
                    <th>Subtype</th>
                    <th>Event</th>
                    <th>Client</th>
                    <th>Map</th>
                    <th>Actor</th>
                    <th>
                      <span className="sr-only">Details</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const client = r.client_id ? clientsById[r.client_id] : null;
                    const map = r.map_id ? mapsById[r.map_id] : null;
                    const actorUserId = r.actor_user_id || r?.meta?.actor_user_id || null;
                    const actor = actorUserId ? actorByUserId[actorUserId] : null;
                    return (
                      <React.Fragment key={r.id}>
                        <tr>
                          <td className="ops-nowrap">{formatUtc(r.occurred_at)}</td>
                          <td>
                            <Pill tone="neutral">{categoryLabel(r.event_category)}</Pill>
                          </td>
                          <td>{r.event_subtype || "—"}</td>
                          <td>
                            <code>{r.event_type}</code>
                          </td>
                          <td>
                            {client ? (
                              <Link to={`/admin/clients/${r.client_id}`}>{client.name || r.client_id}</Link>
                            ) : r.client_id ? (
                              r.client_id
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            {map && r.client_id ? (
                              <Link to={`/admin/clients/${r.client_id}/maps/${r.map_id}`}>
                                {map.name || r.map_id}
                              </Link>
                            ) : map ? (
                              map.name || r.map_id
                            ) : r.map_id ? (
                              r.map_id
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="ops-cell-small" title={actorUserId || ""}>
                            {actorUserId ? (
                              <Link to={`/admin/users/${encodeURIComponent(actorUserId)}`}>
                                {actor?.label || `${actorUserId.slice(0, 8)}…`}
                              </Link>
                            ) : (
                              "System"
                            )}
                          </td>
                          <td>
                            <Button size="sm" aria-expanded={!!expanded[r.id]} onClick={() => toggle(r.id)}>
                              {expanded[r.id] ? "Hide" : "Meta"}
                            </Button>
                          </td>
                        </tr>
                        {expanded[r.id] ? (
                          <tr className="ops-detail">
                            <td colSpan={8}>
                              <pre className="ops-pre">{formatJson(r.meta)}</pre>
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </PageLayout>
    </AdminLayout>
  );
}
