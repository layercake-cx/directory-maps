# Test the geocode_address Edge Function

The Supabase **gateway** verifies JWTs by default. So you must deploy with **JWT verification disabled** for this function, or every request returns 401 before your code runs.

## 1. Deploy with JWT verification off

```bash
supabase functions deploy geocode_address --no-verify-jwt
```

Redeploy with this flag whenever you change the function.

## 2. Test with curl (no auth)

Replace `YOUR_SUPABASE_URL` with your project URL (e.g. `https://abcdefgh.supabase.co`).

```bash
curl -s -X POST \
  "YOUR_SUPABASE_URL/functions/v1/geocode_address" \
  -H "Content-Type: application/json" \
  -d '{"address":"London, UK"}' \
  | jq .
```

**Expected (success):** `{"ok":true,"status":"OK","lat":51.5073219,"lng":-0.1276474}`

**If you get 401:** You didn’t deploy with `--no-verify-jwt`, or you’re using the wrong project URL.

## 3. Test in browser (optional)

Open DevTools → Console on your app and run (use your real `VITE_SUPABASE_URL`):

```javascript
const url = "YOUR_SUPABASE_URL/functions/v1/geocode_address";
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ address: "London, UK" }),
});
console.log(res.status, await res.json());
```

You should see `200` and the lat/lng object.
