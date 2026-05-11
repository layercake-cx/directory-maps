import React, { useEffect, useState, useCallback, useRef } from "react";
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { signOut } from "../../lib/auth";
import BrandLogo from "../../components/BrandLogo.jsx";
import { ClientProvider } from "../../context/ClientContext.jsx";
import { getClientAndContact } from "../../lib/getClientAndContact.js";
import { useAuth } from "../../hooks/useAuth.js";
import "../admin/admin.css";

const CLIENT_NAV = [
  { label: "My Maps", path: "/client" },
  { label: "Team", path: "/client/team" },
];

export default function ClientLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const pathname = location.pathname || "/";
  const { isAdmin, roleLoading, signupProvisionError, clearSignupProvisionError, provisionVersion } = useAuth();
  const kickedUnlinkedRef = useRef(false);
  const [showVerifiedBanner, setShowVerifiedBanner] = useState(false);

  useEffect(() => {
    if (searchParams.get("verified") === "1") {
      setShowVerifiedBanner(true);
      searchParams.delete("verified");
      setSearchParams(searchParams, { replace: true });
      const t = setTimeout(() => setShowVerifiedBanner(false), 8000);
      return () => clearTimeout(t);
    }
  }, []);

  const [client, setClient] = useState(null);
  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErr("");
      const { client: c, contact: ct } = await getClientAndContact();
      setClient(c);
      setContact(ct);
    } catch (e) {
      setErr(e?.message ?? String(e));
      setClient(null);
      setContact(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, provisionVersion]);

  useEffect(() => {
    if (loading || roleLoading) return;
    // Wait until at least one provisioning cycle has completed before deciding
    // the user is unlinked — provisioning may still be creating the client.
    if (provisionVersion === 0) return;
    if (isAdmin) return;
    if (client !== null) return;
    if (signupProvisionError) return;
    if (err) return;
    if (kickedUnlinkedRef.current) return;
    kickedUnlinkedRef.current = true;
    signOut()
      .catch(() => {})
      .finally(() => {
        navigate("/login?unlinked=1", { replace: true });
      });
  }, [loading, roleLoading, provisionVersion, isAdmin, client, signupProvisionError, err, navigate]);

  function handleSignOut() {
    signOut().catch(() => {});
  }

  if (loading || roleLoading) {
    return (
      <div className="page-main">
        <p>Loading…</p>
      </div>
    );
  }

  if (err) {
    return (
      <div className="page-main">
        <div className="admin-card" style={{ maxWidth: 560 }}>
          <p>{err}</p>
        </div>
      </div>
    );
  }

  if (client === null) {
    if (signupProvisionError) {
      return (
        <div className="page-main">
          <div className="admin-card" style={{ maxWidth: 560 }}>
            <h2 style={{ marginTop: 0 }}>Could not finish signup</h2>
            <p>{signupProvisionError}</p>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button type="button" className="btn btn-primary" onClick={() => clearSignupProvisionError()}>
                Dismiss
              </button>
              <button type="button" className="btn" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      );
    }
    if (isAdmin) {
      return (
        <div className="page-main">
          <div className="admin-card" style={{ maxWidth: 560 }}>
            <h2 style={{ marginTop: 0 }}>Admin account</h2>
            <p>You're signed in as an admin. Client accounts are not created for admin users.</p>
            <p>
              Use the <a href="#/admin/clients">Admin area</a> to manage clients and maps, or sign out and sign in with a
              client account to use the client portal.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <a href="#/admin/clients" className="btn btn-primary">
                Go to Admin
              </a>
              <button type="button" className="btn" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="page-main">
        <div className="admin-card" style={{ maxWidth: 560 }}>
          <h2 style={{ marginTop: 0 }}>No organisation linked</h2>
          <p>
            Your account is not linked to an organisation yet. Complete email sign-up from the link we sent you, or
            contact support.
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <a href="#/signup" className="btn btn-primary">
              Sign up with email
            </a>
            <button type="button" className="btn" onClick={handleSignOut}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const canManageUsers = contact?.is_primary || contact?.can_manage_users;
  const navItems = CLIENT_NAV.filter((item) => (item.path === "/client/team" ? canManageUsers : true));

  const isMapDetailRoute = pathname.startsWith("/client/maps/");

  return (
    <ClientProvider client={client} contact={contact} loading={loading} error={err} refetch={load}>
      <>
        {showVerifiedBanner && (
          <div
            style={{
              background: "#ecfdf5",
              color: "#065f46",
              padding: "12px 20px",
              fontSize: 14,
              fontWeight: 500,
              textAlign: "center",
              borderBottom: "1px solid #a7f3d0",
            }}
          >
            Email verified successfully — your account is ready to go.
          </div>
        )}
        <nav className="client-nav" aria-label="Client sections">
          <div className="client-nav__inner">
            {navItems.map(({ label, path }) => {
              const isActive =
                path === "/client"
                  ? pathname === "/client" ||
                    pathname === "/client/" ||
                    (pathname.startsWith("/client/") && !pathname.startsWith("/client/team"))
                  : pathname === path || pathname.startsWith(path + "/");
              return (
                <Link
                  key={path}
                  to={path}
                  className={`client-nav__link ${isActive ? "client-nav__link--active" : ""}`}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>

        {isMapDetailRoute ? <Outlet /> : <div className="page-main"><Outlet /></div>}
      </>
    </ClientProvider>
  );
}
