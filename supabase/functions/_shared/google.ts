function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/**
 * Google's Drive/Sheets APIs return this when the user didn't grant every requested
 * scope on the consent screen (e.g. unchecked "See and download your Google Drive
 * files") — surfacing the raw JSON to a customer is meaningless, so translate it into
 * something actionable. Falls back to the raw body for anything else so real API
 * errors aren't hidden.
 */
export function describeGoogleApiError(label: string, body: unknown): string {
  const bodyError = (body as any)?.error;
  const reason =
    bodyError?.errors?.[0]?.reason ?? bodyError?.details?.[0]?.reason ?? bodyError?.status ?? "";
  const message = String(bodyError?.message ?? "");
  const isScopeError =
    reason === "insufficientPermissions" ||
    reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT" ||
    /insufficient authentication scopes/i.test(message);

  if (isScopeError) {
    return "Google didn't grant every permission this needs. When reconnecting, make sure to allow all requested permissions on Google's consent screen (Drive and Sheets access) rather than unchecking any of them.";
  }
  return `${label}: ${JSON.stringify(body)}`;
}

export function buildGoogleAuthUrl(params: {
  redirectUri: string;
  state: string;
  scopes: string[];
}) {
  const clientId = getEnv("GOOGLE_OAUTH_CLIENT_ID");
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", params.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("scope", params.scopes.join(" "));
  u.searchParams.set("state", params.state);
  return u.toString();
}

export async function exchangeCodeForTokens(params: {
  code: string;
  redirectUri: string;
}) {
  const clientId = getEnv("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = getEnv("GOOGLE_OAUTH_CLIENT_SECRET");

  const body = new URLSearchParams();
  body.set("code", params.code);
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("redirect_uri", params.redirectUri);
  body.set("grant_type", "authorization_code");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Token exchange failed: ${JSON.stringify(json)}`);
  return json as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    scope: string;
    token_type: string;
    id_token?: string;
  };
}

export async function refreshAccessToken(refreshToken: string) {
  const clientId = getEnv("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = getEnv("GOOGLE_OAUTH_CLIENT_SECRET");

  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("refresh_token", refreshToken);
  body.set("grant_type", "refresh_token");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(json)}`);
  return json as {
    access_token: string;
    expires_in: number;
    scope?: string;
    token_type: string;
  };
}

export async function fetchGoogleUserEmail(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Userinfo failed: ${JSON.stringify(json)}`);
  return (json?.email ?? null) as string | null;
}

export async function fetchSpreadsheetMeta(accessToken: string, spreadsheetId: string) {
  const u = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`);
  u.searchParams.set("fields", "sheets(properties(sheetId,title))");
  const res = await fetch(u, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = await res.json();
  if (!res.ok) throw new Error(describeGoogleApiError("Sheets meta failed", json));
  return json as {
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
  };
}

export async function fetchDriveFileAsText(accessToken: string, fileId: string) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const err = await res.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(err); } catch { /* not JSON, e.g. plain-text 404 */ }
    throw new Error(parsed ? describeGoogleApiError("Drive file download failed", parsed) : `Drive file download failed: ${err}`);
  }
  return res.text();
}

export async function fetchSheetValues(accessToken: string, spreadsheetId: string, sheetName: string) {
  const range = `${sheetName}!A:Z`;
  const u = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
  );
  u.searchParams.set("majorDimension", "ROWS");
  const res = await fetch(u, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = await res.json();
  if (!res.ok) throw new Error(describeGoogleApiError("Sheets values failed", json));
  return json as { values?: string[][] };
}

