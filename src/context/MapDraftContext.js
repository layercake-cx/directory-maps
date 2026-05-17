import { createContext, useContext } from "react";

export const MapDraftContext = createContext({
  hasDraft: false,
  setHasDraft: () => {},
  openPublishRef: { current: null },
});

export const useMapDraft = () => useContext(MapDraftContext);
