import { invokeEdgeFunction } from "./edgeFunctionFetch.js";

/**
 * Intent-based AI search over a map's listings. Returns the matching listing
 * ids (already validated server-side against the map's real listing set —
 * never trust this as anything other than a plain id list).
 * @param {{ mapId: string, query: string }} opts
 * @returns {Promise<{ listingIds: string[], disabled?: boolean }>}
 */
export async function searchListingsByIntent({ mapId, query }) {
  return invokeEdgeFunction("search_listings_by_intent", { mapId, query });
}
