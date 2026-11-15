// Listing owner login stays on the directory site: icon control, no footer
// text link, and a login page that does not point the visitor at the platform.
//   deno test --allow-read supabase/functions/generate_directory_site/listingLogin_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { buildOwnerLoginPage, siteFooter, siteHeader, type SiteNav } from "./builders.ts";

const nav: SiteNav = {
  homeUrl: "/directories/acme/uk-associations",
  homeLabel: "Home",
  items: [{ id: "about", label: "About", href: "/directories/acme/uk-associations/about", children: [] }],
  claimLoginUrl: "/directories/acme/uk-associations/login",
};

Deno.test("header is an icon-only Listing login control on the directory", () => {
  const html = siteHeader({ directoryName: "UK Associations", tagline: null, homeUrl: nav.homeUrl, nav });
  assertStringIncludes(html, 'aria-label="Listing login"');
  assertStringIncludes(html, 'href="/directories/acme/uk-associations/login"');
  assertStringIncludes(html, "dir-listing-login-bar");
  assert(!html.includes("Manage your listing"));
  assert(!html.includes("maps.layercake-cx.biz/claim/login"));
});

Deno.test("footer does not carry a listing login link", () => {
  const html = siteFooter({ directoryName: "UK Associations", homeUrl: nav.homeUrl, nav });
  assert(!html.includes("Listing login"));
  assert(!html.includes("Listing owner log in"));
  assert(!html.includes("claim_login_click"));
});

Deno.test("login page matches the directory design and stays on-site", () => {
  const html = buildOwnerLoginPage({
    clientSlug: "acme",
    directorySlug: "uk-associations",
    directoryName: "UK Associations",
    theme: {},
    nav,
    accentColour: "#3F4C8A",
    buttonTextColour: "#FFFFFF",
    backgroundColour: "#ECEEFA",
    borderColour: "#CFD4EA",
    contactHref: "/directories/acme/uk-associations/contact",
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "anon",
  });
  assertStringIncludes(html, "Listing owner login");
  assertStringIncludes(html, "Log in with your email");
  assertStringIncludes(html, "claimed a listing yet?");
  assertStringIncludes(html, "Email me a login link");
  assertStringIncludes(html, "Check your email");
  assertStringIncludes(html, "Find your organisation");
  assertStringIncludes(html, "--claim-accent:#3F4C8A");
  assert(!html.includes('href="https://maps.layercake-cx.biz/claim/login"'));
  assert(!html.includes('location.origin + "/claim/login"'));
  assertStringIncludes(html, 'id="owner-login-done"');
  assertStringIncludes(html, "storeReturnSession");
});

Deno.test("listing path stays on the directory", async () => {
  const { listingPath, supabaseConfigFromHtml } = await import("../../../ownerAccount.js");
  assertEquals(listingPath("/login", "betting-and-gaming-council"), "/betting-and-gaming-council");
  assertEquals(
    listingPath("/directories/layercake/uk-associations/login", "betting-and-gaming-council"),
    "/directories/layercake/uk-associations/betting-and-gaming-council",
  );
  assertEquals(
    supabaseConfigFromHtml('var cfg = {"supabaseUrl":"https://example.supabase.co","anonKey":"anon"}'),
    { supabaseUrl: "https://example.supabase.co", anonKey: "anon" },
  );
});
