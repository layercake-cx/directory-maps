import React from "react";
import { ClientContext } from "./clientContext.js";

export function ClientProvider({ client, contact, loading, error, refetch, children }) {
  const value = { client, contact, loading, error, refetch };
  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
}
