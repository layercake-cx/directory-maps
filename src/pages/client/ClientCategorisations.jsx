import React, { useCallback } from "react";
import { useClient } from "../../hooks/useClient.js";
import { recordAdminEvent } from "../../lib/adminEvents.js";
import { supabase } from "../../lib/supabase";
import { PageLayout, Section } from "../../components/ui/index.js";
import CategorisationsPanel from "../../components/directories/CategorisationsPanel.jsx";

export default function ClientCategorisations() {
  const { client } = useClient();

  const recordEvent = useCallback((eventType, meta) => {
    recordAdminEvent(supabase, { eventType, meta, source: "client_portal", clientId: client?.id ?? null });
  }, [client?.id]);

  return (
    <PageLayout
      head={{
        title: "Categories",
        subtitle: "Reusable taxonomies applied across all of your directories.",
      }}
    >
      <Section>
        <CategorisationsPanel clientId={client?.id} recordEvent={recordEvent} />
      </Section>
    </PageLayout>
  );
}
