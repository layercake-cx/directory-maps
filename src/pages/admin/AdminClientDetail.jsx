import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import AdminLayout from "./AdminLayout.jsx";
import CustomerWorkspaceFeaturePanel from "../../components/shell/CustomerWorkspaceFeaturePanel.jsx";
import { createAdminClientUser, deleteAdminClientUser } from "../../lib/adminClientUsers.js";
import MessagingPanel from "../../components/MessagingPanel.jsx";
import IntegrationsPanel from "../../components/integrations/IntegrationsPanel.jsx";
import DomainSettings from "../../components/DomainSettings.jsx";
import { listDirectories } from "../../lib/directories.js";
import DirectoriesDashboard from "../../components/directories/DirectoriesDashboard.jsx";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import CategorisationsPanel from "../../components/directories/CategorisationsPanel.jsx";
import EntitlementsPanel from "../../components/admin/EntitlementsPanel.jsx";
import EntitlementLimitModal from "../../components/admin/EntitlementLimitModal.jsx";
import { fetchClientEntitlements } from "../../lib/entitlements.js";
import {
  Button, Callout, Checkbox, DataTable, Dialog, EmptyState, Field, PageLayout, Pill, Section, SettingRow,
  SettingsLayout, Skeleton, Switch, TextInput,
} from "../../components/ui/index.js";
import "../../styles/wave-c/clients.css";
import { DOMAINS_SUBTITLE } from "../../lib/clientDomains.js";
import { getLimitReachedMessage } from "../../lib/entitlementMessages.js";
import {
  DIRECTORIES_FLAG,
  DIRECTORY_PAGES_FLAG,
  CUSTOM_DOMAIN_FLAG,
  listClientFeatureOverrides,
  setClientFeatureOverride,
  clearClientFeatureOverride,
} from "../../lib/featureFlags.js";

export default function AdminClientDetail() {
  const { clientId, tab } = useParams();
  const navigate = useNavigate();

  const [client, setClient] = useState(null);
  const [primaryContact, setPrimaryContact] = useState(null);
  const [contactsList, setContactsList] = useState([]);
  const [maps, setMaps] = useState([]);
  const [directories, setDirectories] = useState([]);
  const [maxMapsLimit, setMaxMapsLimit] = useState(null);
  const [mapLimitModalOpen, setMapLimitModalOpen] = useState(false);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [subscriptionActiveOverride, setSubscriptionActiveOverride] = useState(false);
  const [directoriesFlagEnabled, setDirectoriesFlagEnabled] = useState(false);
  const [directoryPagesFlagEnabled, setDirectoryPagesFlagEnabled] = useState(false);
  const [directoryPagesFlagSaving, setDirectoryPagesFlagSaving] = useState(false);
  const [customDomainFlagEnabled, setCustomDomainFlagEnabled] = useState(false);
  const [customDomainFlagSaving, setCustomDomainFlagSaving] = useState(false);
  const [flagSaving, setFlagSaving] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addCanManageMaps, setAddCanManageMaps] = useState(false);
  const [addCanManageUsers, setAddCanManageUsers] = useState(false);
  const [adding, setAdding] = useState(false);

  // Route-driven (Phase 3): the URL is the source of truth, not local state — see App.jsx's
  // /admin/clients/:clientId/:tab route. The bare clientId URL is the "maps" default.
  const activeTab = tab || "maps";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [usersWarning, setUsersWarning] = useState("");
  const [contactToDelete, setContactToDelete] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingContact, setDeletingContact] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setErr("");

      const [
        { data: c, error: ce },
        { data: m, error: me },
        { data: contactsData },
        { data: allContacts },
        dirs,
        flagOverrides,
        entitlements,
      ] = await Promise.all([
        supabase
          .from("clients")
          .select("id,name,slug,subscription_active_override,created_at,updated_at")
          .eq("id", clientId)
          .single(),
        supabase
          .from("maps")
          .select("id,name,slug,default_lat,default_lng,default_zoom,show_list_panel,enable_clustering")
          .eq("client_id", clientId)
          .order("name", { ascending: true }),
        supabase
          .from("contacts")
          .select("id, client_id, email, name, is_primary")
          .eq("client_id", clientId)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(1),
        supabase
          .from("contacts")
          .select("id, client_id, user_id, email, name, is_primary, can_manage_maps, can_manage_users")
          .eq("client_id", clientId)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: true }),
        // Optional: must not fail the maps/customer load (e.g. feature-flag
        // tables exist on staging only; a directories embed error must not
        // wipe the Maps tab).
        listDirectories(clientId).catch(() => []),
        listClientFeatureOverrides(clientId).catch(() => []),
        fetchClientEntitlements(clientId).catch(() => ({})),
      ]);

      if (ce) throw ce;
      if (me) throw me;

      setClient(c);
      setMaps(m ?? []);
      setContactsList(allContacts ?? []);
      setDirectories(dirs ?? []);
      setMaxMapsLimit(entitlements?.max_maps?.limit ?? null);

      const primary = contactsData?.[0] ?? null;
      setPrimaryContact(primary);
      setName(c?.name ?? "");
      setSlug(c?.slug ?? "");
      setSubscriptionActiveOverride(!!c?.subscription_active_override);
      setDirectoriesFlagEnabled(
        (flagOverrides ?? []).some((o) => o.flag_key === DIRECTORIES_FLAG && o.enabled === true)
      );
      setDirectoryPagesFlagEnabled(
        (flagOverrides ?? []).some((o) => o.flag_key === DIRECTORY_PAGES_FLAG && o.enabled === true)
      );
      setCustomDomainFlagEnabled(
        (flagOverrides ?? []).some((o) => o.flag_key === CUSTOM_DOMAIN_FLAG && o.enabled === true)
      );
      setContactName(primary?.name ?? "");
      setContactEmail(primary?.email ?? "");
    } catch (e) {
      setErr(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [clientId]);

  async function handleSave(e) {
    e.preventDefault();
    setErr("");
    const cleanName = name.trim();
    const cleanSlug = slug.trim();
    const email = contactEmail.trim();
    const contactNameTrimmed = contactName.trim();
    if (!cleanName) return setErr("Customer name is required.");
    if (!cleanSlug) return setErr("Slug is required.");
    if (!email) return setErr("Primary contact email is required.");

    try {
      setSaving(true);

      const { error: clientError } = await supabase
        .from("clients")
        .update({
          name: cleanName,
          slug: cleanSlug,
          subscription_active_override: subscriptionActiveOverride,
          updated_at: new Date().toISOString(),
        })
        .eq("id", clientId);

      if (clientError) throw clientError;

      if (primaryContact) {
        const { error: contactError } = await supabase
          .from("contacts")
          .update({
            email,
            name: contactNameTrimmed || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", primaryContact.id);

        if (contactError) throw contactError;
      } else {
        const { error: contactError } = await supabase.from("contacts").insert({
          client_id: clientId,
          email,
          name: contactNameTrimmed || null,
          is_primary: true,
        });
        if (contactError) throw contactError;
      }

      await load();
    } catch (e) {
      setErr(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddUser(e) {
    e.preventDefault();
    const email = addEmail.trim();
    const nameVal = addName.trim();
    if (!email) {
      setErr("Email is required.");
      return;
    }
    if (!nameVal) {
      setErr("Name is required.");
      return;
    }
    setErr("");
    setNotice("");
    setUsersWarning("");
    setAdding(true);
    try {
      const result = await createAdminClientUser({
        clientId,
        email,
        name: nameVal,
        canManageMaps: addCanManageMaps,
        canManageUsers: addCanManageUsers,
      });
      setNotice(`Invitation sent to ${email}. The user will appear after they create their password and accept.`);
      setAddEmail("");
      setAddName("");
      setAddCanManageMaps(false);
      setAddCanManageUsers(false);
      await load();
    } catch (e) {
      setNotice("");
      setErr(e?.message ?? String(e));
    } finally {
      setAdding(false);
    }
  }

  async function updateContactPermissions(contactId, can_manage_maps, can_manage_users) {
    setErr("");
    setUsersWarning("");
    try {
      const { error } = await supabase
        .from("contacts")
        .update({ can_manage_maps, can_manage_users, updated_at: new Date().toISOString() })
        .eq("id", contactId)
        .eq("client_id", clientId);
      if (error) throw error;
      setContactsList((prev) =>
        prev.map((c) => (c.id === contactId ? { ...c, can_manage_maps, can_manage_users } : c))
      );
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
  }

  async function confirmDeleteContact() {
    if (!contactToDelete || deleteConfirmText.trim().toLowerCase() !== "delete") return;
    setErr("");
    setUsersWarning("");
    setDeletingContact(true);
    try {
      await deleteAdminClientUser({
        clientId,
        contactId: contactToDelete.id,
      });
      setContactToDelete(null);
      setDeleteConfirmText("");
      await load();
    } catch (e) {
      const raw = e?.message ?? String(e);
      const assoc = e?.associatedClients;
      if (Array.isArray(assoc) && assoc.length > 0) {
        const names = assoc.map((c) => c.name || c.id).join(", ");
        setUsersWarning(`This user is associated with another client and cannot be deleted. Associated clients: ${names}.`);
      } else {
        setErr(raw);
      }
    } finally {
      setDeletingContact(false);
    }
  }

  const recordEvent = (eventType, meta) => {
    recordAdminEvent(supabase, { eventType, meta, source: "admin_dashboard", clientId });
  };

  async function handleToggleDirectoriesFlag(next) {
    setFlagSaving(true);
    setErr("");
    setNotice("");
    try {
      if (next) {
        await setClientFeatureOverride(clientId, DIRECTORIES_FLAG, true);
      } else {
        await clearClientFeatureOverride(clientId, DIRECTORIES_FLAG);
      }
      setDirectoriesFlagEnabled(next);
      recordEvent("ops_feature_flag_changed", {
        actor_admin_scope: "platform_admin",
        client_id: clientId,
        flag: DIRECTORIES_FLAG,
        enabled: next,
        source: "admin_client_detail",
      });
      setNotice(
        next
          ? "Directories enabled for this customer."
          : "Directories reset to the default (hidden for this customer)."
      );
    } catch (e) {
      setErr(e.message ?? String(e));
    } finally {
      setFlagSaving(false);
    }
  }

  async function handleToggleDirectoryPagesFlag(next) {
    setDirectoryPagesFlagSaving(true);
    setErr("");
    setNotice("");
    try {
      if (next) {
        await setClientFeatureOverride(clientId, DIRECTORY_PAGES_FLAG, true);
      } else {
        await clearClientFeatureOverride(clientId, DIRECTORY_PAGES_FLAG);
      }
      setDirectoryPagesFlagEnabled(next);
      recordEvent("ops_feature_flag_changed", {
        actor_admin_scope: "platform_admin",
        client_id: clientId,
        flag: DIRECTORY_PAGES_FLAG,
        enabled: next,
        source: "admin_client_detail",
      });
      setNotice(
        next
          ? "Directory pages enabled for this customer."
          : "Directory pages reset to the default (hidden for this customer)."
      );
    } catch (e) {
      setErr(e.message ?? String(e));
    } finally {
      setDirectoryPagesFlagSaving(false);
    }
  }

  async function handleToggleCustomDomainFlag(next) {
    setCustomDomainFlagSaving(true);
    setErr("");
    setNotice("");
    try {
      if (next) {
        await setClientFeatureOverride(clientId, CUSTOM_DOMAIN_FLAG, true);
      } else {
        await clearClientFeatureOverride(clientId, CUSTOM_DOMAIN_FLAG);
      }
      setCustomDomainFlagEnabled(next);
      recordEvent("ops_feature_flag_changed", {
        actor_admin_scope: "platform_admin",
        client_id: clientId,
        flag: CUSTOM_DOMAIN_FLAG,
        enabled: next,
        source: "admin_client_detail",
      });
      setNotice(
        next
          ? "Custom domains enabled for this customer."
          : "Custom domains reset to the default (hidden for this customer)."
      );
    } catch (e) {
      setErr(e.message ?? String(e));
    } finally {
      setCustomDomainFlagSaving(false);
    }
  }

  const clientBase = `/admin/clients/${encodeURIComponent(clientId)}`;
  const showTopError = err && activeTab !== "details" && activeTab !== "users";
  const topError = showTopError ? <Callout tone="danger">{err}</Callout> : null;

  function handleNewMap() {
    const atMapLimit = maxMapsLimit != null && maps.length >= maxMapsLimit;
    if (atMapLimit) {
      recordEvent("entitlements_limit_blocked", { feature_key: "max_maps", source: "admin_client_detail" });
      setMapLimitModalOpen(true);
      return;
    }
    navigate(`${clientBase}/maps/new`);
  }

  const mapColumns = [
    {
      key: "name",
      label: "Map",
      render: (m) => (
        <>
          {m.name}
          <span className="wc-cell-sub">{m.id}</span>
        </>
      ),
    },
    { key: "slug", label: "Slug" },
    {
      key: "defaults",
      label: "Defaults",
      render: (m) => (
        <span className="wc-muted">
          {Number(m.default_lat).toFixed(4)}, {Number(m.default_lng).toFixed(4)} · z{m.default_zoom}
        </span>
      ),
    },
    {
      key: "options",
      label: "Options",
      render: (m) => (
        <span className="wc-pills">
          <Pill>{m.show_list_panel ? "List on" : "List off"}</Pill>
          <Pill>{m.enable_clustering ? "Cluster on" : "Cluster off"}</Pill>
        </span>
      ),
    },
  ];

  const userColumns = [
    { key: "email", label: "Email" },
    { key: "name", label: "Name", render: (c) => c.name || "—" },
    { key: "primary", label: "Primary", render: (c) => (c.is_primary ? "Yes" : "—") },
    {
      key: "can_manage_maps",
      label: "Manage maps",
      render: (c) =>
        c.is_primary ? (
          <Pill>Yes (primary)</Pill>
        ) : (
          <Checkbox
            label={c.can_manage_maps ? "Yes" : "No"}
            aria-label={`Manage maps for ${c.email}`}
            checked={!!c.can_manage_maps}
            onChange={(e) => updateContactPermissions(c.id, e.target.checked, c.can_manage_users)}
          />
        ),
    },
    {
      key: "can_manage_users",
      label: "Manage users",
      render: (c) =>
        c.is_primary ? (
          <Pill>Yes (primary)</Pill>
        ) : (
          <Checkbox
            label={c.can_manage_users ? "Yes" : "No"}
            aria-label={`Manage users for ${c.email}`}
            checked={!!c.can_manage_users}
            onChange={(e) => updateContactPermissions(c.id, c.can_manage_maps, e.target.checked)}
          />
        ),
    },
    {
      key: "has_login",
      label: "Has login",
      render: (c) => (c.user_id ? "Yes" : <Pill tone="warn">Pending</Pill>),
    },
  ];

  const detailsToggles = [
    {
      key: "directories",
      label: "Directories & Categories",
      description: "Show the Directories and Categories sections in this customer's portal. Saved immediately.",
      checked: directoriesFlagEnabled,
      disabled: flagSaving,
      onChange: handleToggleDirectoriesFlag,
    },
    {
      key: "directory-pages",
      label: "Directory pages",
      description:
        "Generate crawlable directory + listing pages for this customer's published maps. Also requires the Directory pages entitlement (Entitlements tab). Saved immediately.",
      checked: directoryPagesFlagEnabled,
      disabled: directoryPagesFlagSaving,
      onChange: handleToggleDirectoryPagesFlag,
    },
    {
      key: "custom-domains",
      label: "Custom domains",
      description:
        "Show the Domains section in this customer's portal, letting them add and verify their own domain. Also requires the Custom domain entitlement (Entitlements tab). Saved immediately.",
      checked: customDomainFlagEnabled,
      disabled: customDomainFlagSaving,
      onChange: handleToggleCustomDomainFlag,
    },
  ];

  function closeDeleteDialog() {
    setContactToDelete(null);
    setDeleteConfirmText("");
  }

  return (
    <AdminLayout panel={<CustomerWorkspaceFeaturePanel clientId={clientId} clientName={client?.name} />}>
      {loading ? (
        <PageLayout head={{ title: "Customer" }}>
          <Skeleton variant="table" label="Loading customer" />
        </PageLayout>
      ) : (
        <>
          {activeTab === "maps" && (
            <PageLayout
              head={{
                title: "Maps",
                subtitle: "Interactive maps for this customer.",
                actions: (
                  <Button variant="primary" onClick={handleNewMap}>
                    New map
                  </Button>
                ),
              }}
            >
              <div className="wc-stack">
                {topError}
                <Section flush>
                  <DataTable
                    caption="Maps"
                    columns={mapColumns}
                    rows={maps}
                    getRowId={(m) => m.id}
                    getRowLabel={(m) => m.name}
                    rowLink={(m) => `${clientBase}/maps/${encodeURIComponent(m.id)}`}
                    empty={err ? null : <EmptyState art="none" title="No maps yet for this customer" />}
                  />
                </Section>
              </div>
            </PageLayout>
          )}

          {activeTab === "directories" && (
            <>
              {topError}
              <DirectoriesDashboard
                clientId={clientId}
                canManage
                basePath={`${clientBase}/directories`}
                newHref={`${clientBase}/directories/new`}
              />
            </>
          )}

          {activeTab === "categorisations" && (
            <PageLayout head={{ title: "Categories", subtitle: "Reusable taxonomies applied across all of your directories." }}>
              {topError}
              <CategorisationsPanel clientId={clientId} recordEvent={recordEvent} />
            </PageLayout>
          )}

          {activeTab === "entitlements" && (
            <PageLayout head={{ title: "Entitlements", subtitle: "Plan, feature access and limits for this customer." }}>
              {topError}
              <Section>
                <EntitlementsPanel clientId={clientId} recordEvent={recordEvent} />
              </Section>
            </PageLayout>
          )}

          {activeTab === "details" && (
            <SettingsLayout head={{ title: "Customer details", subtitle: `ID: ${client?.id ?? "—"}` }}>
              {err ? <Callout tone="danger">{err}</Callout> : null}
              {notice ? <Callout tone="ok">{notice}</Callout> : null}

              <form onSubmit={handleSave} className="wc-form-stack">
                <Section title="Customer">
                  <Field label="Customer name">
                    <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. IoIC" />
                  </Field>
                  <Field label="Slug">
                    <TextInput value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="e.g. ioic" />
                  </Field>
                </Section>

                <Section
                  title="Billing"
                  description="Enable for customers who pay by invoice. They get publish and embed access without a Stripe subscription record."
                >
                  <Checkbox
                    label="Pays by invoice"
                    hint="Treat as an active paying customer (subscription override)"
                    checked={subscriptionActiveOverride}
                    onChange={(e) => setSubscriptionActiveOverride(e.target.checked)}
                  />
                </Section>

                <Section
                  title="Feature access (beta)"
                  description="Pre-release in-development features to this customer. Admins and @layercake-cx.biz users always see beta features; these toggles let specific customers in early."
                  flush
                >
                  {detailsToggles.map((t) => (
                    <SettingRow
                      key={t.key}
                      label={t.label}
                      description={t.description}
                      control={<Switch checked={t.checked} disabled={t.disabled} onChange={t.onChange} />}
                    />
                  ))}
                </Section>

                <Section
                  title="Primary contact"
                  description="The primary contact is edited here. To add more users or set permissions, use the Users tab."
                  footer={
                    <Button type="submit" variant="primary" loading={saving} loadingLabel="Saving…">
                      Save changes
                    </Button>
                  }
                >
                  <Field label="Contact name">
                    <TextInput value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="e.g. Jane Smith" />
                  </Field>
                  <Field label="Contact email">
                    <TextInput
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="e.g. jane@example.com"
                      required
                    />
                  </Field>
                </Section>
              </form>
            </SettingsLayout>
          )}

          {activeTab === "users" && (
            <PageLayout head={{ title: "Users", subtitle: "People who can sign in to this customer's workspace." }}>
              <div className="wc-stack">
                {err ? <Callout tone="danger">{err}</Callout> : null}
                {notice ? <Callout tone="info">{notice}</Callout> : null}
                {usersWarning ? <Callout tone="warn">{usersWarning}</Callout> : null}

                <Section title="Add user">
                  <form onSubmit={handleAddUser} className="wc-form">
                    <Field label="Email">
                      <TextInput type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="Email" />
                    </Field>
                    <Field label="Name">
                      <TextInput value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Name" required />
                    </Field>
                    <div className="wc-checks">
                      <Checkbox label="Manage maps" checked={addCanManageMaps} onChange={(e) => setAddCanManageMaps(e.target.checked)} />
                      <Checkbox label="Manage users" checked={addCanManageUsers} onChange={(e) => setAddCanManageUsers(e.target.checked)} />
                    </div>
                    <div className="wc-actions">
                      <Button type="submit" variant="primary" loading={adding} loadingLabel="Adding…">
                        Add user
                      </Button>
                    </div>
                  </form>
                </Section>

                <Section title="Users" flush>
                  <DataTable
                    caption="Users"
                    columns={userColumns}
                    rows={contactsList}
                    getRowId={(c) => c.id}
                    getRowLabel={(c) => c.email}
                    rowLink={(c) => `${clientBase}/contacts/${encodeURIComponent(c.id)}`}
                    rowMenu={(c) => [
                      { label: "Edit user", onSelect: () => navigate(`${clientBase}/contacts/${encodeURIComponent(c.id)}`) },
                      {
                        label: "Delete user",
                        danger: true,
                        onSelect: () => {
                          setContactToDelete({ id: c.id, email: c.email, name: c.name });
                          setDeleteConfirmText("");
                        },
                      },
                    ]}
                    empty={
                      <EmptyState
                        art="none"
                        title="No users yet"
                        body="Add one above or set the primary contact in Customer details."
                      />
                    }
                  />
                </Section>
              </div>
            </PageLayout>
          )}

          {activeTab === "messaging" && (
            <>
              {topError}
              <MessagingPanel clientId={clientId} clientName={client?.name} eventSource="admin_dashboard" />
            </>
          )}

          {activeTab === "domains" && (
            <PageLayout head={{ title: "Domains", subtitle: DOMAINS_SUBTITLE }}>
              {topError}
              <DomainSettings clientId={clientId} clientName={client?.name} eventSource="admin_dashboard" />
            </PageLayout>
          )}

          {activeTab === "integrations" && (
            <>
              {topError}
              <IntegrationsPanel clientId={clientId} clientName={client?.name} eventSource="admin_dashboard" />
            </>
          )}
        </>
      )}

      {contactToDelete ? (
        <Dialog
          title="Delete user"
          onClose={() => {
            if (!deletingContact) closeDeleteDialog();
          }}
          footer={
            <>
              <Button onClick={closeDeleteDialog} disabled={deletingContact}>
                Cancel
              </Button>
              <Button
                variant="danger-solid"
                onClick={confirmDeleteContact}
                disabled={deleteConfirmText.trim().toLowerCase() !== "delete"}
                loading={deletingContact}
                loadingLabel="Deleting…"
              >
                Delete user
              </Button>
            </>
          }
        >
          <p>
            Are you sure you want to remove &quot;{contactToDelete.name || contactToDelete.email}&quot; from this customer?
            This cannot be undone.
          </p>
          <Field label="Type delete to confirm" hint="Type delete below to confirm.">
            <TextInput
              data-autofocus
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="delete"
              autoComplete="off"
            />
          </Field>
        </Dialog>
      ) : null}
      <EntitlementLimitModal
        open={mapLimitModalOpen}
        onClose={() => setMapLimitModalOpen(false)}
        message={getLimitReachedMessage("max_maps", maps.length, maxMapsLimit)}
      />
    </AdminLayout>
  );
}
