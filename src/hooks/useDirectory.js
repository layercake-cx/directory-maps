import { useContext } from "react";
import { DirectoryContext } from "../context/directoryContext.js";

export function useDirectory() {
  const ctx = useContext(DirectoryContext);
  if (!ctx) throw new Error("useDirectory must be used within a DirectoryProvider");
  return ctx;
}
