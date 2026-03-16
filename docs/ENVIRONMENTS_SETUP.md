# Test + Live Environments (Step-by-Step)

This guide sets up **two environments** so you can test safely before going live:

- **Test** – for trying changes (preview deployments, test database).
- **Live (Production)** – for real users and real data.

You’ll use **Vercel** for the frontend and **Supabase** for the database. Each will have a “test” and a “live” setup.

---

## Part 1: Supabase (two databases)

### Step 1.1 – Create your **Production** project (if you don’t have one)

1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **New project**.
3. Choose your organization (or create one).
4. Set:
   - **Name:** e.g. `directory-maps-production`
   - **Database password:** choose a strong password and **save it somewhere safe**.
   - **Region:** pick the one closest to your users.
5. Click **Create new project** and wait until it’s ready.

### Step 1.2 – Get Production URL and anon key

1. In the Supabase dashboard, open your **production** project.
2. Go to **Settings** (gear icon in the left sidebar) → **API**.
3. You’ll see:
   - **Project URL** (e.g. `https://xxxxx.supabase.co`) → this is `VITE_SUPABASE_URL`.
   - **Project API keys** → under “anon public”, copy the **anon public** key → this is `VITE_SUPABASE_ANON_KEY`.
4. Save both somewhere (e.g. a secure note). You’ll use them for the **Production** environment in Vercel.

### Step 1.3 – Create your **Test** project

1. In the Supabase dashboard, click **New project** again.
2. Set:
   - **Name:** e.g. `directory-maps-test`
   - **Database password:** another strong password (can be different from production).
   - **Region:** can match production or be the same.
3. Click **Create new project** and wait until it’s ready.

### Step 1.4 – Run migrations on **both** projects

Your app needs tables (e.g. `maps`, `listings`, `clients`). You do this by running the same SQL migrations on both databases.

**Option A – Supabase Dashboard (easiest when you’re new):**

1. Open the **production** project in Supabase.
2. Go to **SQL Editor**.
3. Run each migration file **in this order** (from the `supabase/migrations/` folder in this repo):
   - `20250101000000_create_base_tables.sql` ← **run this first** (creates `clients`, `maps`, `groups`, `listings`)
   - `20250201000000_create_profiles.sql` (creates `profiles` for admin role)
   - `20250202000000_add_listings_geocoded_at.sql` (adds `geocoded_at` to listings; required for CSV import)
   - `20250305000000_create_contacts.sql`
   - `20260306100600_create_map_data_sources.sql`
   - `20260306120000_add_maps_custom_pin_url.sql`
   - `20260311100000_add_maps_cluster_radius.sql`
   - `20260313130000_add_maps_published_config.sql`
   - `20260314100000_add_groups_theme_json.sql`
   - `20260315100000_enable_rls_policies.sql` ← **RLS + policies (required so test matches prod; without this, inserts can be denied)**  
   For each file: open it, copy its contents, paste into the SQL Editor, click **Run**.
4. Repeat the same steps in your **test** project (same migrations, same order).

**Option B – Supabase CLI (when you’re comfortable with the terminal):**

1. Install Supabase CLI: `npm install -g supabase`
2. Log in: `supabase login`
3. Link to **production**: `supabase link --project-ref YOUR_PROD_PROJECT_REF`  
   (Project ref is in Supabase: Project Settings → General → Reference ID.)
4. Push migrations: `supabase db push`
5. Unlink, then link to **test**: `supabase link --project-ref YOUR_TEST_PROJECT_REF`
6. Push again: `supabase db push`

### Step 1.5 – Get Test URL and anon key

1. Open your **test** project in the Supabase dashboard.
2. Go to **Settings** → **API**.
3. Copy the **Project URL** and **anon public** key for the test project.  
   You’ll use these for the **Preview / Test** environment in Vercel.

You now have:

- **Production DB:** URL + anon key (for live).
- **Test DB:** URL + anon key (for test).

---

## Part 2: Vercel (test + live frontend)

### Step 2.1 – Create a Vercel account and install the CLI (optional)

1. Go to [vercel.com](https://vercel.com) and sign up (e.g. with GitHub).
2. (Optional) To deploy from your computer:  
   `npm install -g vercel`  
   Then run `vercel login` and follow the prompts.

### Step 2.2 – Create the project and connect Git

1. In the Vercel dashboard, click **Add New…** → **Project**.
2. **Import** your `directory-maps` repo (connect GitHub/GitLab/Bitbucket if asked).
3. Configure the project:
   - **Framework Preset:** Vite (Vercel usually detects it).
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
4. **Do not** add Environment Variables yet; click **Deploy** so the project is created (the first deploy may fail; that’s OK).

### Step 2.3 – Add environments in Vercel

Vercel gives you two built-in environment types:

- **Production** – used when you deploy from your main branch (e.g. `main`).
- **Preview** – used for every other branch and for “preview” deployments (this will be your **test** environment).

You’ll set different env vars for each so that:

- **Production** uses the **production** Supabase URL and anon key.
- **Preview** uses the **test** Supabase URL and anon key.

### Step 2.4 – Set Production environment variables

1. In Vercel, open your project.
2. Go to **Settings** → **Environment Variables**.
3. Add each variable below. For each one, select **Production** only (uncheck Preview and Development for now).

| Name                     | Value                    | Environment  |
|--------------------------|--------------------------|--------------|
| `VITE_SUPABASE_URL`      | Your **production** URL  | Production   |
| `VITE_SUPABASE_ANON_KEY` | Your **production** key  | Production   |
| `VITE_GOOGLE_MAPS_API_KEY` | Your Google Maps API key | Production   |

4. Click **Save** for each.

### Step 2.5 – Set Preview (test) environment variables

1. In the same **Environment Variables** page, add the same variable **names** again, but this time:
   - Use your **test** Supabase URL and **test** anon key.
   - Select **Preview** only (and optionally **Development** if you want local dev to use test DB via Vercel CLI).

| Name                     | Value                 | Environment |
|--------------------------|----------------------|-------------|
| `VITE_SUPABASE_URL`      | Your **test** URL    | Preview     |
| `VITE_SUPABASE_ANON_KEY` | Your **test** anon   | Preview     |
| `VITE_GOOGLE_MAPS_API_KEY` | Same Google key is OK | Preview   |

2. Save each.

Result:

- Deploys from `main` (production) → use **Production** env → **production** database.
- Deploys from other branches or “Preview” → use **Preview** env → **test** database.

### Step 2.6 – Redeploy so env vars are applied

1. Go to **Deployments**.
2. Open the **⋯** menu on the latest deployment → **Redeploy**.
3. Check **Use existing Build Cache** if you want, then confirm.  
   Or push a small commit to your production branch to trigger a new deploy.

Your **Production** deployment will now use the production database; any **Preview** deployment will use the test database.

---

## Part 2.7 – Local development: you need a .env file

**Vercel does not inject env vars when you run the app on your machine.** When you run `npm run dev` (or `vite`), only **files in your project root** are read:

| File                 | When it’s loaded        | Typical use                          |
|----------------------|-------------------------|--------------------------------------|
| `.env`               | Always                  | Shared defaults (can be committed)   |
| `.env.local`         | Always (overrides .env)  | **Your local secrets** (gitignored)   |
| `.env.development`   | When running `vite`     | Optional; dev-only defaults          |
| `.env.production`    | When running `vite build`| Optional; build-only defaults        |

You do **not** need `.env.development` or `.env.production` for the app to work. You only need **one** of:

- **`.env`** in the project root with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (and `VITE_GOOGLE_MAPS_API_KEY`), or  
- **`.env.local`** in the project root with the same variables.

If the app says “Supabase is not configured”, it means **none** of those files (in the directory you’re running the app from) contain both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Fix by:

1. Creating `.env` or `.env.local` in the **project root** (same folder as `package.json`).
2. Adding at least:
   - `VITE_SUPABASE_URL=https://your-project.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=your-anon-key`
3. Restarting the dev server (`npm run dev`).

**If .env.local says “created by Vercel”**  
That usually means you ran `vercel env pull` at some point. That command creates (or overwrites) `.env.local` with the env vars from **one** Vercel environment (e.g. Preview or Production). So:

- Your **local** app always uses whatever is in `.env` / `.env.local` right now.
- Your **deployed** app uses whatever you set in Vercel → Settings → Environment Variables for that deployment (Production vs Preview).

So you have two separate places to configure:

| Where the app runs | Where the vars come from |
|--------------------|---------------------------|
| On your machine (`npm run dev`) | `.env` or `.env.local` in project root |
| Vercel Production deployment   | Vercel → Environment Variables → **Production** |
| Vercel Preview deployment      | Vercel → Environment Variables → **Preview** |

For multiple environments to be “fully configured”:

1. **Local:** Keep a `.env` or `.env.local` with at least test (or production) Supabase URL and key so local dev works.
2. **Vercel Production:** Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (and others) for **Production**.
3. **Vercel Preview:** Set the same variable **names** for **Preview**, with your **test** Supabase URL and key.

You don’t need a separate `.env.development` unless you want different values when running `vite` vs `vite build`; one `.env` or `.env.local` is enough for local.

---

## Part 3: Branch strategy (recommended)

A simple way to keep test and live clear:

1. **`main`** (or `master`)  
   - Only for code that’s ready for live.  
   - Connected to **Production** in Vercel → uses **production** Supabase.

2. **`develop`** (or `staging`)  
   - For testing and day-to-day work.  
   - Deploy this branch on Vercel; it will get **Preview** env → **test** Supabase.

**In Vercel:**

1. Open your project, then go to **Settings** (top tab).
2. In the left sidebar, click **Environments** (under “Project” or “General”).
3. Find the **Production** environment and click it (or look for **Branch Tracking** / **Production Branch**).
4. Set the production branch to `main` (or whatever you use for live), then **Save**.
5. All other branches (e.g. `develop`) will then use **Preview** and get the Preview env vars.

If you don’t see “Environments”: look for **Git** in the sidebar, or **Deployments** → configure which branch is Production. The exact label can be “Production Branch”, “Branch for Production”, or under “Branch Tracking”.

Workflow:

- Work and push on `develop` → preview URLs use **test** DB.
- When ready, merge `develop` into `main` → production deploy uses **live** DB.

---

## Part 4: Supabase Edge Functions (e.g. contact form email, geocoding)

If you use Edge Functions (e.g. `send_contact_message`, `geocode_address`), they run in Supabase, not Vercel. You need to deploy them to **each** Supabase project and set secrets per project.

**Test project:**

1. Supabase dashboard → **test** project.
2. **Edge Functions** → deploy your functions (or use CLI: `supabase functions deploy FUNCTION_NAME --project-ref YOUR_TEST_REF`).
3. Set secrets in **Settings** → **Edge Functions** for the test project (e.g. `RESEND_API_KEY`, `RESEND_FROM` for contact form; see **Geocoding** below).

**Production project:**

1. Same steps in the **production** project: deploy functions, set the same secrets (can be same keys, or different if you want).

---

### Geocoding (CSV import “Geocode rows missing lat/lng”)

The app calls the **`geocode_address`** Edge Function when you import CSV with “Geocode rows missing lat/lng” checked. For it to work on **test** (and prod):

1. **Deploy the function** to that Supabase project. From your repo (with Supabase CLI linked to the project):
   ```bash
   supabase functions deploy geocode_address --no-verify-jwt
   ```
   Use `--no-verify-jwt` so the browser can call it without sending a JWT (the app doesn’t pass auth headers to this function).

2. **Set the Google API key** as a secret for that project:
   - Dashboard → **Edge Functions** → **Secrets** (or **Settings** → **Edge Functions**).
   - Add: **`GOOGLE_GEOCODING_API_KEY`** = your Google Maps Geocoding API key (or the same key you use for maps).  
   The function also accepts **`GOOGLE_MAPS_API_KEY`** if you prefer that name.

3. **Repeat for the other project** (deploy `geocode_address` and set the secret in prod if you use geocoding there).

If the key is missing or the function isn’t deployed, geocoding during import will fail (rows stay without lat/lng). See `scripts/test-geocode.md` for a curl test.

---

## Checklist

- [ ] Supabase: Production project created, URL + anon key saved.
- [ ] Supabase: Test project created, URL + anon key saved.
- [ ] Migrations run on **both** projects (same schema).
- [ ] Vercel: Project created and connected to Git.
- [ ] Vercel: Production env vars set (production Supabase + Google key).
- [ ] Vercel: Preview env vars set (test Supabase + Google key).
- [ ] Production branch (e.g. `main`) set in Vercel.
- [ ] One deploy from `main` (production) and one from `develop` (or another branch) to verify test vs live.
- [ ] (If used) Edge Functions deployed and secrets set in both Supabase projects.

---

## Creating an admin user (e.g. for Preview / test DB)

The app treats a user as **admin** only if they have a row in the **`profiles`** table with `role = 'admin'`. Auth (email/password) is handled by Supabase; the profile row is what grants admin access.

Do this in your **test** Supabase project so you can sign in to the admin area on your Preview deployment.

### 1. Ensure the `profiles` table exists

Run the migration that creates it (if you haven’t already):

- **`20250201000000_create_profiles.sql`**

So your migration order includes:  
`20250101000000_create_base_tables.sql` → … → `20250201000000_create_profiles.sql` → `20250305000000_create_contacts.sql` → (rest as before).

### 2. Create a user in the test project

1. Open your **test** Supabase project in the dashboard.
2. Go to **Authentication** → **Users**.
3. Click **Add user** → **Create new user**.
4. Enter an **email** and **password** (e.g. a test admin email you’ll use only for preview).
5. Click **Create user**.
6. In the users list, click the user you just created and copy their **User UID** (the UUID). You’ll need it in the next step.

### 3. Give that user the admin role

1. In the same (test) project, go to **SQL Editor**.
2. Run (replace `YOUR_USER_UID` with the UUID you copied):

```sql
insert into public.profiles (user_id, role)
values ('YOUR_USER_UID', 'admin')
on conflict (user_id) do update set role = 'admin';
```

3. Run the query.

### 4. Sign in on Preview

1. Open your **Preview** app URL (from Vercel, e.g. the deployment for the `develop` branch).
2. Go to the admin sign-in page (e.g. `/#/admin` or your app’s admin route).
3. Sign in with the **email and password** you created in step 2.

You should now have admin access on Preview using the test database. Repeat the same steps in your **production** Supabase project if you need to create or fix an admin user there (using a different email for production).

---

## CSV import “runs” but no records in the database

If the CSV import finishes (or shows “Imported X rows”) but **no rows appear** in the test DB:

1. **Run the RLS migration so test matches prod**  
   If tables in test show as **unrestricted** (RLS off) but prod has RLS enabled with policies, run **`20260315100000_enable_rls_policies.sql`** on your **test** project (after all other migrations). It enables RLS and adds policies so **authenticated** users can insert/update/delete; then CSV import should persist rows.

2. **Run the geocoded_at migration if needed**  
   The import writes a `geocoded_at` column when “Geocode rows missing lat/lng” is on. If that column doesn’t exist, the upsert can fail. Run this migration on your **test** Supabase project (in the same order as in the migration list above):
   - **`20250202000000_add_listings_geocoded_at.sql`**
   Then try the import again.

3. **Check the error message**  
   If the upsert fails, the UI shows the error in red under the import buttons. Look for messages like “column … does not exist” or “permission denied” and fix the schema or RLS.

3. **Confirm you’re looking at the test DB**  
   Preview uses the **test** Supabase project. In the Supabase dashboard, open the project that’s wired to your Preview env vars and check the `listings` table there.

---

## Geocoding not working during CSV import?

If “Geocode rows missing lat/lng” runs but rows stay without coordinates (or you get errors):

1. **Deploy the Edge Function** to the Supabase project used by that environment (test or prod):  
   `supabase functions deploy geocode_address --no-verify-jwt`
2. **Set the secret** in that project: **Edge Functions** → **Secrets** → add **`GOOGLE_GEOCODING_API_KEY`** (or **`GOOGLE_MAPS_API_KEY`**) with your Google Geocoding/Maps API key.
3. Test with: `curl -X POST "YOUR_SUPABASE_URL/functions/v1/geocode_address" -H "Content-Type: application/json" -d '{"address":"London, UK"}'` — you should get JSON with `ok: true` and `lat`/`lng`. See `scripts/test-geocode.md` for more.

---

## Changes not showing on Vercel develop / Preview?

If you’ve pushed to `develop` (or another non‑production branch) but the deployed preview doesn’t show your latest changes:

1. **Confirm the branch and push**
   - Run: `git branch` (you should be on `develop` or the branch you expect).
   - Run: `git status` (no uncommitted changes, or commit and push them).
   - Run: `git push origin develop` (or your branch name). Ensure the push succeeds.

2. **Confirm Vercel is building that branch**
   - In Vercel: open the project → **Deployments**.
   - Find the latest deployment for **your branch** (e.g. `develop`). Check that it’s the most recent and that the **commit message / SHA** matches your latest push.
   - If there is no deployment for that branch, Vercel may not be set to build it: **Settings** → **Git** → ensure the repo is connected and “Preview” deployments are enabled for your branch.

3. **Open the right URL**
   - **Production** = the main project URL (e.g. `your-app.vercel.app`) and uses the **production** branch (e.g. `main`).
   - **Preview / develop** = a per-branch or per-commit URL. In **Deployments**, click the deployment for `develop` and use the URL Vercel shows (e.g. `your-app-git-develop-xxx.vercel.app` or a “Preview” link). Do not rely on the main production URL to show develop changes.

4. **Trigger a new deploy**
   - In Vercel → **Deployments** → find the latest `develop` deployment → **⋯** → **Redeploy** (optional: clear build cache).
   - Or push an empty commit to force a new build:  
     `git commit --allow-empty -m "chore: trigger preview deploy" && git push origin develop`

5. **Check the build**
   - In the deployment’s build log, confirm the build **succeeded**. If it failed, fix the reported errors (e.g. missing env vars, build script) and push again.

6. **Cache / CDN**
   - Hard refresh the preview URL (e.g. Ctrl+Shift+R or Cmd+Shift+R) or try in an incognito window in case the browser or CDN is serving an old version.

---

## Quick reference: where things live

| What              | Local (npm run dev)    | Production / Live      | Test / Preview        |
|-------------------|------------------------|------------------------|------------------------|
| Frontend          | Your machine           | Vercel Production      | Vercel Preview         |
| Database          | Whichever you put in .env | Supabase “prod”    | Supabase “test”        |
| Env vars          | `.env` or `.env.local` in project root | Vercel → Production | Vercel → Preview       |
| Branch (example)  | —                      | `main`                 | `develop`              |

If you hit a step that doesn’t match what you see (e.g. Vercel or Supabase have changed their UI), say which step and we can adjust the guide.
