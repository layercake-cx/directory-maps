/**
 * Path helpers for map / listing stats (client portal and admin).
 * @param {{ mapId: string, clientId?: string }} opts
 */
export function getMapStatsRoutes({ mapId, clientId }) {
  if (clientId) {
    const base = `/admin/clients/${encodeURIComponent(clientId)}/maps/${encodeURIComponent(mapId)}`;
    return {
      statsBase: `${base}/stats`,
      listingStatsPath: (listingId) =>
        `${base}/stats/listings/${encodeURIComponent(listingId)}`,
      backPath: `/admin/clients/${encodeURIComponent(clientId)}`,
      backLabel: "Customer",
    };
  }

  const base = `/client/maps/${encodeURIComponent(mapId)}`;
  return {
    statsBase: `${base}/stats`,
    listingStatsPath: (listingId) =>
      `${base}/stats/listings/${encodeURIComponent(listingId)}`,
    backPath: "/client",
    backLabel: "My Maps",
  };
}
