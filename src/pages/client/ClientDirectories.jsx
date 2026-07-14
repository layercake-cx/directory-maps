import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useClient } from "../../hooks/useClient.js";
import { canManageOrg } from "../../lib/clientAuth.js";
import { listDirectories } from "../../lib/directories.js";

export default function ClientDirectories() {
  const { client, contact } = useClient();
  const [directories, setDirectories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const canManage = canManageOrg(contact);

  useEffect(() => {
    if (!client?.id) return;
    (async () => {
      try {
        setLoading(true);
        setErr("");
        setDirectories(await listDirectories(client.id));
      } catch (e) {
        setErr(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [client?.id]);

  return (
    <div className="page-main">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Directories</h2>
          <p style={{ margin: "4px 0 0", opacity: 0.75, fontSize: 13 }}>
            Browsable, publishable lists of entries — separate from your maps.
          </p>
        </div>
        {canManage && (
          <Link className="btn btn-primary" to="/client/directories/new">
            New directory
          </Link>
        )}
      </div>

      {err && <p style={{ color: "#b91c1c" }}>{err}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : directories.length === 0 ? (
        <div className="admin-card">
          <p style={{ margin: 0 }}>No directories yet.</p>
          {canManage && (
            <Link className="btn btn-primary" to="/client/directories/new" style={{ marginTop: 12, display: "inline-block" }}>
              Create your first directory
            </Link>
          )}
        </div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Directory</th>
              <th>Slug</th>
              <th>Entries</th>
            </tr>
          </thead>
          <tbody>
            {directories.map((d) => (
              <tr key={d.id}>
                <td>
                  <Link to={`/client/directories/${encodeURIComponent(d.id)}`}>{d.name}</Link>
                </td>
                <td>{d.slug}</td>
                <td>{d.directory_entries?.[0]?.count ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
