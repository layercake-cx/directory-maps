import { useContext } from "react";
import { ClientContext } from "../context/clientContext.js";

export function useClient() {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error("useClient must be used within ClientLayout");
  return ctx;
}
