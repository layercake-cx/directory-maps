import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/index.js";
import MapsList from "../../components/maps/MapsList.jsx";

/** `notice` is an optional node (e.g. a Callout) shown under the page heading. */
export default function MapsView({ maps = [], clientSlug, loading, error, notice = null }) {
  const navigate = useNavigate();
  const newMap = <Button variant="primary" onClick={() => navigate("/client/maps/new")}>New map</Button>;

  return (
    <MapsList
      head={{ title: "Maps", subtitle: "Interactive maps your visitors can explore.", actions: newMap }}
      maps={maps}
      clientSlug={clientSlug}
      mapHref={(m) => `/client/maps/${encodeURIComponent(m.id)}`}
      newMapAction={newMap}
      loading={loading}
      error={error}
      notice={notice}
    />
  );
}
