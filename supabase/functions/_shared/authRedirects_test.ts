import { assertEquals } from "jsr:@std/assert@1";
import { directoryLoginAllowPattern, directoryLoginRedirectUrl, mergeRedirectAllowList, resolveClaimLoginRedirect } from "./authRedirects.ts";

Deno.test("directory login redirect is the hostname's /login", () => {
  assertEquals(directoryLoginRedirectUrl("UK-Associations.com"), "https://uk-associations.com/login");
  assertEquals(directoryLoginAllowPattern("UK-Associations.com"), "https://uk-associations.com/**");
});

Deno.test("localhost sign-in stays on localhost; a live app uses the directory domain", () => {
  assertEquals(
    resolveClaimLoginRedirect("http://localhost:5173/claim/login", "uk-associations.com"),
    "http://localhost:5173/claim/login",
  );
  assertEquals(
    resolveClaimLoginRedirect("https://maps.layercake-cx.biz/claim/login", "uk-associations.com"),
    "https://uk-associations.com/login",
  );
  assertEquals(
    resolveClaimLoginRedirect("https://maps.layercake-cx.biz/claim/login", ""),
    "https://maps.layercake-cx.biz/claim/login",
  );
});

Deno.test("allow list add is idempotent and remove only drops that url", () => {
  const start = "https://maps.layercake-cx.biz/claim/login,http://localhost:5173/**";
  const added = mergeRedirectAllowList(start, "https://uk-associations.com/login", true);
  assertEquals(added.changed, true);
  assertEquals(added.value, `${start},https://uk-associations.com/login`);
  const again = mergeRedirectAllowList(added.value, "https://uk-associations.com/login/", true);
  assertEquals(again.changed, false);
  const removed = mergeRedirectAllowList(added.value, "https://uk-associations.com/login", false);
  assertEquals(removed.changed, true);
  assertEquals(removed.value, start);
});
