import { DIRECTORIES_FLAG, CUSTOM_DOMAIN_FLAG, INTEGRATIONS_FLAG } from "../lib/featureFlags.js";
import { canManageOrg } from "../lib/clientAuth.js";

/**
 * Client + platform rail config, ported from docs/design/admin-shell/nav.config.json and
 * corrected against src/App.jsx's real routes (see plan doc for the differences from the
 * pack's own JSON — e.g. "My maps" points at /client, not the pack's aspirational /client/maps).
 *
 * `permissionCheck(contact)` is a Phase-1 addition not in the pack's schema: it bridges the
 * existing canManageOrg/canManageMaps checks that ClientLayout already enforced today. Staff
 * always bypass it (see Rail.jsx) — an admin isn't subject to a customer's own permission model.
 *
 * `staffRoute(clientId)` (Phase 3): when staff are viewing a specific customer's workspace
 * (`/admin/clients/:clientId/...`, rendered in this same client-context shell — see
 * AdminLayout.jsx), these resolve to that customer's equivalent admin route (each of
 * `AdminClientDetail`'s route-driven tabs, per Phase 3) instead of the real client portal's
 * `/client/...` routes.
 */
export const CLIENT_RAIL = [
  { id: "home", label: "Home", icon: "home", route: "/client", staffRoute: (clientId) => `/admin/clients/${clientId}` },
  { id: "maps", label: "My maps", icon: "map", route: "/client/maps", staffRoute: (clientId) => `/admin/clients/${clientId}/maps` },
  {
    id: "directories",
    label: "Directories",
    icon: "book",
    route: "/client/directories",
    flag: DIRECTORIES_FLAG,
    staffRoute: (clientId) => `/admin/clients/${clientId}/directories`,
  },
  {
    id: "categorisations",
    label: "Categories",
    icon: "tag",
    route: "/client/categorisations",
    flag: DIRECTORIES_FLAG,
    permissionCheck: (contact) => canManageOrg(contact),
    staffRoute: (clientId) => `/admin/clients/${clientId}/categorisations`,
  },
  {
    id: "team",
    label: "Team",
    icon: "users",
    route: "/client/team",
    permissionCheck: (contact) => canManageOrg(contact),
    staffRoute: (clientId) => `/admin/clients/${clientId}/users`,
  },
  {
    id: "messaging",
    label: "Messaging",
    icon: "mail",
    route: "/client/email",
    permissionCheck: (contact) => contact?.is_primary || contact?.can_manage_maps,
    staffRoute: (clientId) => `/admin/clients/${clientId}/messaging`,
  },
  {
    id: "domains",
    label: "Domains",
    icon: "globe",
    route: "/client/domains",
    flag: CUSTOM_DOMAIN_FLAG,
    permissionCheck: (contact) => contact?.is_primary || contact?.can_manage_maps,
    staffRoute: (clientId) => `/admin/clients/${clientId}/domains`,
  },
  {
    id: "integrations",
    label: "Integrations",
    icon: "plug",
    route: "/client/integrations",
    flag: INTEGRATIONS_FLAG,
    permissionCheck: (contact) => contact?.is_primary || contact?.can_manage_maps,
    staffRoute: (clientId) => `/admin/clients/${clientId}/integrations`,
  },
  {
    id: "customer-account",
    label: "Customer account",
    icon: "id-card",
    position: "bottom",
    staffOnly: true,
    route: "/admin/clients",
    staffRoute: (clientId) => `/admin/clients/${clientId}/details`,
  },
];

export const PLATFORM_RAIL = [
  { id: "customers", label: "Customers", icon: "building", route: "/admin/clients" },
  { id: "all-maps", label: "All maps", icon: "map", route: "/admin/maps" },
  { id: "all-directories", label: "All directories", icon: "book", route: "/admin/directories" },
  { id: "admin-users", label: "Admin users", icon: "user-cog", route: "/admin/users" },
  { id: "leads", label: "Leads", icon: "inbox", route: "/admin/leads" },
  { id: "logs", label: "Logs", icon: "file", route: "/admin/user-activity" },
  { id: "deployments", label: "Deployments", icon: "upload", route: "/admin/deployments" },
];

export const NAV_CONFIG = {
  client: { rail: CLIENT_RAIL },
  platform: { rail: PLATFORM_RAIL },
};

/**
 * Directory feature panel groups (Phase 2), per docs/design/admin-shell/INFORMATION_ARCHITECTURE.md §6.
 * A function, not a static array — `basePath` is per-directory and per-context (client vs admin
 * prefix), unlike the two rails above which are fixed.
 *
 * Gating here reproduces the *exact* permission matrix ClientDirectoryEntries.jsx enforced before
 * this phase (see the Phase 2 plan doc's permission table) — most items are `canManage`-only
 * because their whole outer tab was hidden from non-managers today; Entries/Categories/General/
 * SEO/Search/Integrations/Publishing stay visible to any user with access, same as today's
 * Settings tab was (each panel keeps its own internal `disabled={!canManage}` for read-only vs.
 * editable — this config only controls whether the *route* is reachable at all).
 */
export function getDirectoryPanelGroups({ basePath, canManage, entriesCount }) {
  return [
    { label: null, items: [{ id: "overview", label: "Overview", route: basePath }] },
    {
      label: "Content",
      items: [
        { id: "entries", label: "Entries", route: `${basePath}/entries`, count: entriesCount },
        ...(canManage ? [{ id: "pages", label: "Pages", route: `${basePath}/pages` }] : []),
        { id: "categories", label: "Categories", route: `${basePath}/categories` },
        ...(canManage ? [{ id: "accreditations", label: "Accreditations", route: `${basePath}/accreditations` }] : []),
        ...(canManage ? [{ id: "ai-enrichment", label: "AI enrichment", route: `${basePath}/ai-enrichment` }] : []),
      ],
    },
    {
      label: "Experience",
      items: [
        ...(canManage ? [{ id: "design", label: "Design", route: `${basePath}/design` }] : []),
        { id: "search", label: "Search & Discovery", route: `${basePath}/search` },
      ],
    },
    {
      label: "Engagement",
      items: [
        ...(canManage ? [{ id: "claims", label: "Claims", route: `${basePath}/claims` }] : []),
      ],
    },
    { label: "Insights", items: [{ id: "analytics", label: "Analytics", route: `${basePath}/analytics` }] },
    {
      label: "Settings",
      items: [
        { id: "general", label: "General", route: `${basePath}/settings` },
        { id: "seo", label: "SEO", route: `${basePath}/seo` },
        { id: "publishing", label: "Publishing", route: `${basePath}/publishing` },
        ...(canManage ? [{ id: "domain", label: "Domain", route: `${basePath}/domain` }] : []),
        { id: "integrations", label: "Integrations", route: `${basePath}/integrations` },
        ...(canManage ? [{ id: "email-sending", label: "Emails", route: `${basePath}/email-sending` }] : []),
      ],
    },
  ];
}
