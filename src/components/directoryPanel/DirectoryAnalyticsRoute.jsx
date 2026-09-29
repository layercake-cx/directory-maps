import React from "react";

/**
 * Insights › Analytics (new). A real visitor-engagement dashboard doesn't exist anywhere in the
 * codebase yet — see BACKLOG.md "Insights › Analytics for a directory" (size L). Do not confuse
 * this with DirectoryAnalyticsPanel (GA4/GTM tracking config), correctly placed at Settings ›
 * Integrations instead.
 */
export default function DirectoryAnalyticsRoute() {
  return (
    <div className="admin-card">
      <p style={{ margin: 0 }}>Visitor analytics for this directory aren't built yet.</p>
      <p style={{ margin: "8px 0 0", fontSize: 13, opacity: 0.6 }}>
        Engagement events are already recorded (map_engagement_events, listing enquiries) — a
        dashboard surfacing them is planned. See BACKLOG.md.
      </p>
    </div>
  );
}
