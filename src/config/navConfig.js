import { DIRECTORIES_FLAG, CUSTOM_DOMAIN_FLAG } from "../lib/featureFlags.js";
import { canManageOrg } from "../lib/clientAuth.js";

/**
 * Client + platform rail config, ported from docs/design/admin-shell/nav.config.json and
 * corrected against src/App.jsx's real routes (see plan doc for the differences from the
 * pack's own JSON — e.g. "My maps" points at /client, not the pack's aspirational /client/maps).
 *
 * `permissionCheck(contact)` is a Phase-1 addition not in the pack's schema: it bridges the
 * existing canManageOrg/canManageMaps checks that ClientLayout already enforced today.
 */
export const CLIENT_RAIL = [
  { id: "home", label: "Home", icon: "home", route: "/client" },
  { id: "maps", label: "My maps", icon: "map", route: "/client" },
  { id: "directories", label: "Directories", icon: "book", route: "/client/directories", flag: DIRECTORIES_FLAG },
  {
    id: "categorisations",
    label: "Categorisations",
    icon: "tag",
    route: "/client/categorisations",
    flag: DIRECTORIES_FLAG,
    permissionCheck: (contact) => canManageOrg(contact),
  },
  { id: "team", label: "Team", icon: "users", route: "/client/team", permissionCheck: (contact) => canManageOrg(contact) },
  {
    id: "messaging",
    label: "Messaging",
    icon: "mail",
    route: "/client/email",
    permissionCheck: (contact) => contact?.is_primary || contact?.can_manage_maps,
  },
  {
    id: "domains",
    label: "Domains",
    icon: "globe",
    route: "/client/domains",
    flag: CUSTOM_DOMAIN_FLAG,
    permissionCheck: (contact) => contact?.is_primary || contact?.can_manage_maps,
  },
  {
    id: "customer-account",
    label: "Customer account",
    icon: "id-card",
    position: "bottom",
    staffOnly: true,
    // Phase 3 wires this to the client currently being viewed; Phase 1 has no such
    // concept yet in the client-portal shell (see plan's BACKLOG entry).
    route: "/admin/clients",
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
