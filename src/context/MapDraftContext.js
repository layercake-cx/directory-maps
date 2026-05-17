import { createContext, useContext } from "react";

export const MapDraftContext = createContext({
  hasDraft: false,
  setHasDraft: () => {},
  publishPanelOpen: false,
  setPublishPanelOpen: () => {},
  openPublishRef: { current: null },
  closePublishRef: { current: null },
});

export const useMapDraft = () => useContext(MapDraftContext);
