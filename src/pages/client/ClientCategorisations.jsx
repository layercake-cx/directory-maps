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
    <div className="page-main">
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Categorisations</h2>
        <p style={{ margin: "4px 0 0", opacity: 0.75, fontSize: 13 }}>
          Reusable taxonomies applied across all of your directories.
        </p>
      </div>

      <div className="admin-card">
        <CategorisationsPanel clientId={client?.id} recordEvent={recordEvent} />
      </div>
    </div>
  );
}
