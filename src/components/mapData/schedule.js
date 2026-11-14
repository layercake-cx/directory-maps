// Sync schedule helpers shared by the map Data pages (client and admin). Moved verbatim from ClientMapData.jsx.

export function parseSchedule(raw) {
  if (!raw || raw === "manual") return { freq: "manual", time: "02:00" };
  // Legacy values (nightly / hourly) — migrated to daily:02:00 in DB
  if (raw === "nightly" || raw === "hourly") return { freq: "daily", time: "02:00" };
  if (raw.startsWith("daily:")) {
    const hh = (raw.slice(6).split(":")[0] || "02").padStart(2, "0");
    return { freq: "daily", time: `${hh}:00` };
  }
  return { freq: "manual", time: "02:00" };
}

export function buildScheduleValue(freq, time) {
  if (freq === "manual") return null;
  // Cron dispatch matches on the hour, so snap to HH:00
  const hh = String((time || "02:00").split(":")[0]).padStart(2, "0");
  return `daily:${hh}:00`;
}

// Dropdown options: stored as UTC HH:00, displayed in the user's local time.
export const SCHEDULE_HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => {
  const d = new Date();
  d.setUTCHours(h, 0, 0, 0);
  return {
    value: `${String(h).padStart(2, "0")}:00`,
    label: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    sort: d.getHours() * 60 + d.getMinutes(),
  };
}).sort((a, b) => a.sort - b.sort);

function localScheduleLabel(utcTime) {
  return SCHEDULE_HOUR_OPTIONS.find((o) => o.value === utcTime)?.label ?? `${utcTime} UTC`;
}

export function describeSchedule(freq, time) {
  if (freq === "manual") return "No automatic sync — run manually";
  return `Syncs daily at ${localScheduleLabel(time || "02:00")} (your local time)`;
}
