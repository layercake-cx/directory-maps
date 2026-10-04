import React, { useCallback } from "react";
import { useClient } from "../../hooks/useClient.js";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import { supabase } from "../../lib/supabase";
import CategorisationsPanel from "../../components/directories/CategorisationsPanel.jsx";

export default function ClientCategorisations() {
  const { client } = useClient();

  const recordEvent = useCallback((eventType, meta) => {
    recordAdminEvent(supabase, { eventType, meta, source: "client_portal", clientId: client?.id ?? null });
  }, [client?.id]);

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Categories</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--shell-text-muted)" }}>
            Reusable taxonomies applied across all of your directories.
          </p>
        </div>
      </div>

      <div className="card card-pad">
        <CategorisationsPanel clientId={client?.id} recordEvent={recordEvent} />
      </div>
    </div>
  );
}
