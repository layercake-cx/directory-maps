import { useEffect, useState } from "react";
import { mountOwnerAccount } from "../../../ownerAccount.js";
import { isDirectoryCustomHost } from "../../lib/directoryHost.js";

/**
 * On a directory's own domain, claim pages sit inside that site's header,
 * footer and theme. The Layercake marketing chrome stays on the platform host.
 */
export default function DirectorySiteFrame({ children }) {
  const custom = isDirectoryCustomHost();
  const [chrome, setChrome] = useState(null);

  useEffect(() => {
    if (!custom) return;
    let cancelled = false;
    fetch("/", { headers: { Accept: "text/html" } })
      .then((res) => (res.ok ? res.text() : ""))
      .then((html) => {
        if (cancelled || !html) return;
        const doc = new DOMParser().parseFromString(html, "text/html");
        doc.querySelectorAll('link[rel="stylesheet"]').forEach((node) => {
          const href = node.getAttribute("href");
          if (!href) return;
          const url = new URL(href, `${window.location.origin}/`).href;
          if (document.querySelector(`link[data-dir-theme="1"][href="${url}"]`)) return;
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = url;
          link.setAttribute("data-dir-theme", "1");
          document.head.appendChild(link);
        });
        setChrome({
          header: doc.querySelector("header.dir-site-header")?.outerHTML || "",
          footer: doc.querySelector("footer")?.outerHTML || "",
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [custom]);

  useEffect(() => {
    if (!custom || !chrome?.header) return;
    mountOwnerAccount({
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL || "",
      anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
    });
  }, [custom, chrome]);

  if (!custom) return children;

  return (
    <div className="dir-page">
      <div className="dir-page-banner" aria-hidden="true" />
      {chrome?.header ? <div dangerouslySetInnerHTML={{ __html: chrome.header }} /> : null}
      <div className="wrap" style={{ paddingTop: 24, paddingBottom: 48 }}>{children}</div>
      {chrome?.footer ? <div dangerouslySetInnerHTML={{ __html: chrome.footer }} /> : null}
    </div>
  );
}
