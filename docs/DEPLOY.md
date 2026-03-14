# Deploying to maps.layercake-cx.biz

## Recommended: Vercel

**Why Vercel** for this stack (Vite + React SPA, Supabase backend):

- **Zero config** for Vite: connect the GitHub repo and it detects build settings.
- **Free tier** is generous for a small app; subdomain and SSL included.
- **Env vars** in the dashboard for `VITE_SUPABASE_URL`, `VITE_GOOGLE_MAPS_API_KEY`, etc. (no secrets in repo).
- **Preview deployments** per branch/PR if you want them.
- **Custom domain** and subdomain (e.g. `maps.layercake-cx.biz`) with automatic HTTPS.

### Steps

1. **Sign up / log in** at [vercel.com](https://vercel.com) (GitHub login is easiest).

2. **Import** the repo: New Project → Import Git Repository → `layercake-cx/directory-maps`.

3. **Build settings** (usually auto-detected):
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

4. **Environment variables** (Project → Settings → Environment Variables). Add for Production (and Preview if you use it):
   - `VITE_SUPABASE_URL` – your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` – Supabase anon/public key
   - `VITE_GOOGLE_MAPS_API_KEY` – Google Maps JavaScript API key (embed/map tiles)
   - Optional: `VITE_GOOGLE_API_KEY` – if you use Drive picker (can match Maps key)

5. **Deploy** from the main branch. Note the default `*.vercel.app` URL.

6. **Add custom domain**  
   - Project → Settings → Domains → Add `maps.layercake-cx.biz`.  
   - Vercel will show the required DNS record (usually a CNAME).

7. **DNS** at your domain provider (where `layercake-cx.biz` is managed):
   - Add a **CNAME** record:  
     **Name/host:** `maps`  
     **Target/value:** `cname.vercel-dns.com` (or the exact target Vercel shows).  
   - Save; propagation can take a few minutes. Vercel will issue the SSL cert automatically.

After DNS propagates, `https://maps.layercake-cx.biz` will serve the app. Future pushes to `main` trigger new deployments.

---

## Alternatives

- **Netlify** – Very similar: connect repo, `npm run build`, publish `dist`, add domain and CNAME to Netlify’s target. Good free tier and UI.
- **Cloudflare Pages** – Connect GitHub, same build/publish dir; add custom domain in Cloudflare. Free and fast CDN; env vars in dashboard.
- **GitHub Pages** – Free and simple, but you must handle SPA routing (e.g. redirects or a 404 hack) and configure a custom domain; no server-side env UI (you’d need a build-time step or public env).

For a Supabase-backed SPA with a custom subdomain, **Vercel or Netlify** are the smoothest; Vercel is recommended above for this project.
