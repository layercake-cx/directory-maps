import React from "react";
import "../../styles/wave-b/map-data.css";

const PREVIEW_COLUMNS = ["name", "postcode", "country", "lat", "lng", "group_name"];

/**
 * First rows of a parsed CSV, shown before importing. Shared by the client and admin map Data pages.
 * @param {{ rows: Record<string, string>[] }} props
 */
export default function CsvPreviewTable({ rows }) {
  if (!rows?.length) return null;
  return (
    <div>
      <p className="md-preview-title">Preview — first {rows.length} rows</p>
      <div className="table-wrap">
        <table className="table md-preview-table">
          <caption className="sr-only">First rows of the CSV file</caption>
          <thead>
            <tr>{PREVIEW_COLUMNS.map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td>
                <td>{r.postcode}</td>
                <td>{r.country}</td>
                <td>{r.lat || "—"}</td>
                <td>{r.lng || "—"}</td>
                <td>{r.group_name || r.group || r.category || r["group name"] || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
