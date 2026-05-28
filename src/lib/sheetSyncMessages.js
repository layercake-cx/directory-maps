/**
 * Turn sync_sheet_listings response into user-facing messages.
 * @param {unknown} data
 * @param {string} mapId
 */
export function formatSheetSyncResult(data, mapId) {
  const results = data?.results ?? [];
  const result = results.find((r) => r.map_id === mapId) ?? results[0];

  if (!result) {
    return {
      type: "error",
      message:
        "No sync ran for this map. Connect Google Drive, choose a spreadsheet or CSV in Drive, then sync again.",
    };
  }

  if (result.ok === false) {
    return { type: "error", message: result.error || "Sync failed." };
  }

  const rows = Number(result.rows) || 0;
  const warnings = Array.isArray(result.warnings) ? result.warnings.filter(Boolean) : [];

  if (rows === 0) {
    const parts = warnings.length
      ? [...warnings]
      : ["No listings were imported."];
    if (result.dataRowCount != null) {
      parts.push(`The file has ${result.dataRowCount} data row(s) below the header.`);
    }
    if (result.headers?.length) {
      parts.push(`Columns found: ${result.headers.join(", ")}.`);
    }
    parts.push(
      "Required header columns are id and name (lowercase). Each data row needs a name. For a file on your computer, use the Spreadsheet / CSV tab instead of Google Drive sync.",
    );
    return { type: "warning", message: parts.join(" "), rows: 0 };
  }

  let message = `Synced ${rows} listing${rows === 1 ? "" : "s"}.`;
  if (result.skippedNoName > 0) {
    message += ` ${result.skippedNoName} row(s) were skipped (empty name).`;
  }
  if (warnings.length) {
    return { type: "warning", message: `${message} ${warnings.join(" ")}`, rows };
  }
  return { type: "success", message, rows };
}
