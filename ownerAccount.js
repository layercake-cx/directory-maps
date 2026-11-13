/** Signed-in state for the directory header's listing icon.
 * Runs in published static pages (injected by middleware) and in the
 * listing editor when that editor is shown inside the directory header.
 * The session is the same localStorage record the magic link stores. */

export const OWNER_ACCOUNT_STYLE = `
/* owner-account */
button.dir-listing-login { padding: 0; border: 0; cursor: pointer; font: inherit; }
.dir-account { position: relative; display: inline-flex; }
.dir-listing-login__avatar {
  width: 32px; height: 32px; border-radius: 999px; background: #fff; color: #1c1917;
  display: flex; align-items: center; justify-content: center; overflow: hidden;
  font-size: 12px; font-weight: 700; letter-spacing: -0.02em; line-height: 1;
}
.dir-listing-login__avatar img { width: 100%; height: 100%; object-fit: contain; display: block; }
.dir-account-menu {
  position: absolute; top: calc(100% + 8px); right: 0; z-index: 40; width: 280px;
  background: #fff; color: #1c1917; border-radius: 12px; box-shadow: 0 12px 32px rgba(0,0,0,.16);
  padding: 8px; text-align: left;
}
.dir-account-menu[hidden] { display: none !important; }
.dir-account-menu__name { font-weight: 700; font-size: 15px; margin: 8px 10px 2px; line-height: 1.3; }
.dir-account-menu__email { font-size: 13px; color: #57534e; margin: 0 10px 8px; line-height: 1.4; }
.dir-account-menu a, .dir-account-menu button {
  display: block; width: 100%; box-sizing: border-box; text-align: left; background: none; border: 0;
  padding: 10px; border-radius: 8px; font: inherit; font-size: 14px; font-weight: 650;
  color: #1c1917; text-decoration: none; cursor: pointer;
}
.dir-account-menu a:hover, .dir-account-menu button:hover { background: #f5f5f4; }
.dir-account-menu hr { border: 0; border-top: 1px solid #e7e5e4; margin: 6px 0; }
@media (max-width: 800px) {
  .dir-account-menu { position: fixed; left: 12px; right: 12px; top: 72px; width: auto; }
}
`;

export function listingPath(pathname, slug) {
  const match = String(pathname || "").match(/^(\/directories\/[^/]+\/[^/]+)/);
  return `${match ? match[1] : ""}/${slug}`;
}

export function mountOwnerAccount(config) {
  function initials(name, email) {
    const source = String(name || email || "?").trim();
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
  }
  function readSession() {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
        const session = JSON.parse(localStorage.getItem(key) || "null");
        if (!session?.access_token) continue;
        if (session.expires_at && session.expires_at * 1000 < Date.now()) continue;
        let email = session.user?.email || "";
        if (!email) {
          try {
            let part = session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
            while (part.length % 4) part += "=";
            email = JSON.parse(atob(part)).email || "";
          } catch { /* unsigned or unreadable token */ }
        }
        return { key, session, email };
      }
    } catch { /* private mode */ }
    return null;
  }
  function showLoginSignedIn(email, editHref) {
    const request = document.getElementById("owner-login-request");
    if (!request) return;
    const sent = document.getElementById("owner-login-sent");
    if (sent) sent.hidden = true;
    request.hidden = true;
    let done = document.getElementById("owner-login-done");
    if (!done && request.parentNode) {
      done = document.createElement("div");
      done.id = "owner-login-done";
      done.innerHTML = '<h1 class="dir-owner-login__title">You\u2019re signed in</h1><p class="dir-owner-login__lead">You\u2019re signed in as <strong id="owner-login-done-email"></strong>. You can update your organisation\u2019s listing from here.</p><div class="dir-owner-login__grid" style="grid-template-columns:minmax(0,480px);justify-content:center;"><section class="dir-owner-login__card"><h2>Your listing</h2><p>Open the listing editor to change the description, contact details and logo. It stays on this website.</p><a class="dir-owner-login__submit" href="/claim/login" style="text-align:center;text-decoration:none;">Edit your listing</a></section></div>';
      request.parentNode.insertBefore(done, request);
    }
    if (!done) return;
    done.hidden = false;
    const emailEl = document.getElementById("owner-login-done-email");
    if (emailEl) emailEl.textContent = email || "";
    const edit = done.querySelector("a");
    if (edit && editHref) edit.setAttribute("href", editHref);
  }
  const supabaseUrl = String(config?.supabaseUrl || "").replace(/\/$/, "");
  const anonKey = String(config?.anonKey || "");
  const found = readSession();
  if (!found) return;
  const controls = Array.from(document.querySelectorAll("a.dir-listing-login"));
  const menus = [];

  function closeAll(except) {
    menus.forEach((menu) => {
      if (menu === except) return;
      menu.hidden = true;
      const button = menu.parentNode?.querySelector("button");
      if (button) button.setAttribute("aria-expanded", "false");
    });
  }

  controls.forEach((anchor) => {
    if (anchor.closest(".dir-account")) return;
    const wrap = document.createElement("span");
    wrap.className = "dir-account";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dir-listing-login";
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "Account menu");
    const face = document.createElement("span");
    face.className = "dir-listing-login__face";
    const avatar = document.createElement("span");
    avatar.className = "dir-listing-login__avatar";
    avatar.textContent = initials("", found.email);
    face.appendChild(avatar);
    button.appendChild(face);
    const menu = document.createElement("div");
    menu.className = "dir-account-menu";
    menu.setAttribute("role", "menu");
    menu.hidden = true;
    const nameEl = document.createElement("div");
    nameEl.className = "dir-account-menu__name";
    nameEl.textContent = "Your listing";
    const emailEl = document.createElement("div");
    emailEl.className = "dir-account-menu__email";
    emailEl.textContent = found.email ? `Signed in as ${found.email}` : "Signed in";
    const edit = document.createElement("a");
    edit.href = "/claim/login";
    edit.setAttribute("role", "menuitem");
    edit.textContent = "Edit my listing";
    const view = document.createElement("a");
    view.href = "/";
    view.hidden = true;
    view.setAttribute("role", "menuitem");
    view.textContent = "View public listing";
    const rule = document.createElement("hr");
    const signOut = document.createElement("button");
    signOut.type = "button";
    signOut.setAttribute("role", "menuitem");
    signOut.textContent = "Sign out";
    signOut.addEventListener("click", () => {
      const token = found.session.access_token;
      try { localStorage.removeItem(found.key); } catch { /* ignore */ }
      const done = () => location.reload();
      if (!supabaseUrl || !anonKey) { done(); return; }
      fetch(`${supabaseUrl}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      }).then(done, done);
    });
    menu.append(nameEl, emailEl, edit, view, rule, signOut);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const open = menu.hidden;
      closeAll(menu);
      menu.hidden = !open;
      button.setAttribute("aria-expanded", open ? "true" : "false");
    });
    wrap.append(button, menu);
    anchor.replaceWith(wrap);
    menus.push(menu);
  });

  if (!document.documentElement.dataset.ownerAccount) {
    document.documentElement.dataset.ownerAccount = "1";
    document.addEventListener("click", () => closeAll(null));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeAll(null);
    });
  }

  showLoginSignedIn(found.email, "/claim/login");
  if (!supabaseUrl || !anonKey || !menus.length && !document.getElementById("owner-login-request")) return;

  fetch(`${supabaseUrl}/rest/v1/rpc/get_my_claim_context`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${found.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  })
    .then((res) => (res.ok ? res.json() : []))
    .then(async (claims) => {
      const rows = Array.isArray(claims) ? claims.filter((row) => row?.claim_id) : [];
      if (!rows.length) return;
      const first = rows[0];
      let slug = "";
      let logo = "";
      try {
        const entry = await fetch(
          `${supabaseUrl}/rest/v1/directory_entries?id=eq.${encodeURIComponent(first.directory_item_id)}&select=slug,logo_url`,
          { headers: { apikey: anonKey } },
        ).then((res) => (res.ok ? res.json() : []));
        slug = entry?.[0]?.slug || "";
        logo = entry?.[0]?.logo_url || "";
      } catch { /* name and edit link still work */ }
      const label = first.entry_name || "Your listing";
      const editHref = rows.length === 1 ? `/claim/manage/${first.claim_id}` : "/claim/login";
      const pathMatch = String(location.pathname || "").match(/^(\/directories\/[^/]+\/[^/]+)/);
      const viewHref = slug ? `${pathMatch ? pathMatch[1] : ""}/${slug}` : "";
      document.querySelectorAll(".dir-listing-login__avatar").forEach((avatar) => {
        avatar.textContent = "";
        if (logo) {
          const img = document.createElement("img");
          img.alt = "";
          img.src = logo;
          avatar.appendChild(img);
        } else {
          avatar.textContent = initials(label, found.email);
        }
      });
      document.querySelectorAll(".dir-listing-login").forEach((button) => {
        if (button.tagName === "BUTTON") button.setAttribute("aria-label", `Account menu for ${label}`);
      });
      document.querySelectorAll(".dir-account-menu__name").forEach((node) => {
        node.textContent = rows.length === 1 ? label : "Your listings";
      });
      document.querySelectorAll(".dir-account-menu").forEach((menu) => {
        const edit = menu.querySelector("a");
        if (!edit) return;
        if (rows.length === 1) {
          edit.href = editHref;
          edit.textContent = "Edit my listing";
        } else {
          edit.remove();
          rows.forEach((row) => {
            const link = document.createElement("a");
            link.href = `/claim/manage/${row.claim_id}`;
            link.setAttribute("role", "menuitem");
            link.textContent = `Edit ${row.entry_name || "listing"}`;
            menu.insertBefore(link, menu.querySelector("hr"));
          });
        }
        const view = Array.from(menu.querySelectorAll("a")).find((node) => node.textContent === "View public listing");
        if (view) {
          if (rows.length === 1 && viewHref) {
            view.hidden = false;
            view.href = viewHref;
          } else {
            view.remove();
          }
        }
      });
      showLoginSignedIn(found.email, editHref);
    })
    .catch(() => {});
}

export function supabaseConfigFromHtml(html) {
  const source = String(html || "");
  const urlFromCfg = source.match(/"supabaseUrl":"(https:\/\/[^"]+)"/);
  const keyFromCfg = source.match(/"anonKey":"([^"]+)"/);
  if (urlFromCfg && keyFromCfg) return { supabaseUrl: urlFromCfg[1], anonKey: keyFromCfg[1] };
  const rest = source.match(/REST_URL = "(https:\/\/[^"]+?)\/rest\/v1\//);
  const anon = source.match(/ANON_KEY = "([^"]*)"/);
  if (rest && anon) return { supabaseUrl: rest[1], anonKey: anon[1] };
  return { supabaseUrl: "", anonKey: "" };
}

export function ownerAccountScriptTag(config) {
  return `<script id="owner-account-script">(${mountOwnerAccount.toString()})(${JSON.stringify({
    supabaseUrl: config?.supabaseUrl || "",
    anonKey: config?.anonKey || "",
  })})</script>`;
}
