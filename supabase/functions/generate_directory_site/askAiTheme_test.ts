// Ask AI colour tokens: every preset must give readable text pairs with the
// default (unset) tokens, and the editor's JS mirror must resolve identically
// to the generator. Run: deno test --allow-read supabase/functions/generate_directory_site/askAiTheme_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { resolveAiTokens, resolvedTheme, sanitizeHexColor, type DirectoryTheme } from "./builders.ts";
import { resolveAiTokens as resolveAiTokensJs } from "../../../src/lib/askAiTheme.js";
import { contrastRatio } from "../../../src/lib/colorContrast.js";

// The presets module imports the browser Supabase client, so import a copy of it
// with that one line stubbed out (via a data: URL, which needs no permissions).
async function loadPresets(): Promise<Record<string, DirectoryTheme>> {
  const src = Deno.readTextFileSync(new URL("../../../src/lib/directoryThemePresets.js", import.meta.url));
  const patched = src
    .replace(/^import .*supabase.*$/m, "const supabase = null;")
    .replace(/^export \{ FONT_CATALOG \} from .*$/m, "");
  const mod = await import(`data:text/javascript;base64,${btoa(unescape(encodeURIComponent(patched)))}`);
  return Object.fromEntries(mod.DIRECTORY_THEME_PRESETS.map((p: { key: string; values: DirectoryTheme }) => [p.key, p.values]));
}

const base = (t: DirectoryTheme) => {
  const r = resolvedTheme(t);
  return { primaryColor: r.primaryColor, backgroundColor: r.backgroundColor, inkColor: r.inkColor };
};

Deno.test("default Ask AI text pairs reach 4.5:1 on every preset", async () => {
  const presets = await loadPresets();
  assertEquals(Object.keys(presets).length, 5);
  for (const [key, theme] of Object.entries(presets)) {
    const ai = resolveAiTokens(theme, base(theme));
    const pairs: [string, string, string][] = [
      ["onAccent/accent", ai.onAccent, ai.accent],
      ["tintText/tint", ai.tintText, ai.tint],
      ["userBubbleText/userBubble", ai.userBubbleText, ai.userBubble],
      ["launcherText/launcherBg", ai.launcherText, ai.launcherBg],
    ];
    for (const [name, fg, bg] of pairs) {
      assert((contrastRatio(fg, bg) ?? 0) >= 4.5, `${key}: ${name} is ${contrastRatio(fg, bg)?.toFixed(2)}`);
    }
  }
});

Deno.test("editor mirror resolves the same tokens as the generator", async () => {
  for (const theme of Object.values(await loadPresets()).concat([{ primaryColor: "#2E5A39", aiAccent: "#7a1f3d", aiTint: "#fff0f4" }])) {
    const ts = resolveAiTokens(theme, base(theme));
    const js = resolveAiTokensJs(theme);
    assertEquals(
      { accent: ts.accent, onAccent: ts.onAccent, tint: ts.tint, tintText: ts.tintText, border: ts.border, panelBg: ts.panelBg, userBubble: ts.userBubble, userBubbleText: ts.userBubbleText, launcherBg: ts.launcherBg, launcherText: ts.launcherText },
      { accent: js.aiAccent, onAccent: js.aiOnAccent, tint: js.aiTint, tintText: js.aiTintText, border: js.aiBorder, panelBg: js.aiPanelBg, userBubble: js.aiUserBubble, userBubbleText: js.aiUserBubbleText, launcherBg: js.aiLauncherBg, launcherText: js.aiLauncherText },
    );
  }
});

Deno.test("an invalid Ask AI hex is ignored by the generator", () => {
  const ai = resolveAiTokens({ primaryColor: "#2E5A39", aiAccent: "red; } body { display:none", aiTint: "#abc" }, { primaryColor: "#2E5A39", backgroundColor: "#FAF6EE", inkColor: "#232820" });
  assertEquals(ai.accent, "#2E5A39");
  assert(/^#[0-9a-f]{6}$/i.test(ai.tint));
  assertEquals(sanitizeHexColor("red; }", "#000000"), "#000000");
});
