import { useContext, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { DirectoryContext } from "../../context/directoryContext.js";
import { resolveRouteGroup, MOCK } from "./mockResponses.js";

/**
 * Derives "what the user is looking at" from the route plus data the layout already loaded (directory name,
 * organisation name). No fetches. Returns { group, params, base, chip, welcome, pageLabel, thing }.
 */
export default function useAssistantContext({ orgName, context }) {
  const { pathname } = useLocation();
  const directory = useContext(DirectoryContext)?.directory;
  return useMemo(() => {
    const { group, params, base, pageLabel: resolvedLabel } = resolveRouteGroup(pathname);
    const pageLabel = resolvedLabel || group.pageLabel;
    const inDirectory = group.id.startsWith("directory-") && directory?.name;
    const where = context === "platform" && group.id === "platform"
      ? "Platform"
      : inDirectory ? directory.name : orgName || "Your workspace";
    const chip = `${where} › ${pageLabel}`;
    const thing = inDirectory ? directory.name : group.id === "platform" ? "the platform" : orgName || "your workspace";
    const welcome = (group.welcome || "What can I help with?").replace("{directory}", directory?.name || "this directory");
    return { group, params, base, chip, welcome, pageLabel, thing };
  }, [pathname, directory?.name, orgName, context]);
}

export { MOCK };
