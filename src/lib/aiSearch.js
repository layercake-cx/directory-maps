import { invokeEdgeFunction } from "./edgeFunctionFetch.js";

/**
 * Intent-based AI search over a map's listings — a small multi-turn chat.
 * Send the full conversation each call (stateless server); the last message
 * must be role "user". Returns the matching listing ids for that turn
 * (already validated server-side against the map's real listing set — never
 * trust this as anything other than a plain id list) plus a short
 * conversational reply to show the visitor.
 * @param {{ mapId: string, messages: Array<{ role: "user" | "assistant", content: string }> }} opts
 * @returns {Promise<{ listingIds: string[], responseText?: string, disabled?: boolean }>}
 */
export async function searchListingsByIntent({ mapId, messages }) {
  return invokeEdgeFunction("search_listings_by_intent", { mapId, messages });
}
