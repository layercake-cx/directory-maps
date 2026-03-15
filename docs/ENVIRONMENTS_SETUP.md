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
   - `20250305000000_create_contacts.sql`
   - `20260306100600_create_map_data_sources.sql`
   - `20260306120000_add_maps_custom_pin_url.sql`
   - `20260311100000_add_maps_cluster_radius.sql`
   - `20260313130000_add_maps_published_config.sql`
   - `20260314100000_add_groups_theme_json.sql`  
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

## Part 3: Branch strategy (recommended)

A simple way to keep test and live clear:

1. **`main`** (or `master`)  
   - Only for code that’s ready for live.  
   - Connected to **Production** in Vercel → uses **production** Supabase.

2. **`develop`** (or `staging`)  
   - For testing and day-to-day work.  
   - Deploy this branch on Vercel; it will get **Preview** env → **test** Supabase.

**In Vercel:**

1. **Settings** → **Git**.
2. Set **Production Branch** to `main` (or whatever you use for live).
3. All other branches (e.g. `develop`) will automatically use **Preview** and thus the test env vars.

Workflow:

- Work and push on `develop` → preview URLs use **test** DB.
- When ready, merge `develop` into `main` → production deploy uses **live** DB.

---

## Part 4: Supabase Edge Functions (e.g. contact form email)

If you use Edge Functions (e.g. `send_contact_message`, `geocode_address`), they run in Supabase, not Vercel. You need to deploy them to **each** Supabase project and set secrets per project.

**Test project:**

1. Supabase dashboard → **test** project.
2. **Edge Functions** → deploy your functions (or use CLI: `supabase functions deploy send_contact_message --project-ref YOUR_TEST_REF`).
3. Set secrets (e.g. `RESEND_API_KEY`, `RESEND_FROM`) in **Settings** → **Edge Functions** for the test project.

**Production project:**

1. Same steps in the **production** project: deploy functions, set the same secrets (can be same Resend key, or different if you want).

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

## Quick reference: where things live

| What              | Production / Live      | Test / Preview        |
|-------------------|------------------------|------------------------|
| Frontend          | Vercel Production      | Vercel Preview         |
| Database          | Supabase project “prod”| Supabase project “test”|
| Env vars          | Vercel → Production    | Vercel → Preview       |
| Branch (example)  | `main`                 | `develop`               |

If you hit a step that doesn’t match what you see (e.g. Vercel or Supabase have changed their UI), say which step and we can adjust the guide.
