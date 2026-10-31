// Ask AI sidebar for published directory sites (replaces the "Help me choose"
// dialogue). Three pieces, all consumed by builders.ts:
//   - ASK_AI_STYLE: CSS appended to the shared theme.css
//   - askAiPanelMarkup() / askAiFloatingMarkup(): the docked <aside>, launcher, mobile bar
//   - buildAskAiScript(): JS that runs INSIDE buildFilterAndSearchScript's IIFE,
//     so it shares apply(), rows, active, resultEntryIds etc. with keyword search.
//
// Colours come from the --ai-* custom properties resolved at publish time
// (resolveAiTokens in builders.ts); every use falls back to the theme's own
// tokens so a stale theme.css still renders.
//
// NOTE: buildAskAiScript() returns a TS template literal — inside it, never use
// a backtick or "${", and write JS backslashes doubled (e.g. '\\u201c').

const SPARKLE_MAIN = `<path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z"/>`;
const SPARKLE_SMALL = `<path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>`;

const ICON_PATHS: Record<string, string> = {
  sparkle: SPARKLE_MAIN,
  sparkleBig: SPARKLE_MAIN + SPARKLE_SMALL,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  expand: `<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>`,
  collapse: `<path d="M20 10h-6V4M4 14h6v6M14 10l7-7M3 21l7-7"/>`,
  minimise: `<path d="M5 12h14"/>`,
  close: `<path d="M6 6l12 12M18 6L6 18"/>`,
  send: `<path d="M12 19V5M5 12l7-7 7 7"/>`,
  stop: `<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>`,
  up: `<path d="M7 11v9H4v-9zM7 11l4-8c1.5 0 2.5 1 2.5 2.5V9h5.2a2 2 0 0 1 2 2.3l-1.1 7A2 2 0 0 1 17.6 20H7"/>`,
  down: `<g transform="rotate(180 12 12)"><path d="M7 11v9H4v-9zM7 11l4-8c1.5 0 2.5 1 2.5 2.5V9h5.2a2 2 0 0 1 2 2.3l-1.1 7A2 2 0 0 1 17.6 20H7"/></g>`,
  copy: `<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>`,
  search: `<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>`,
};

function svg(name: string, size: number): string {
  const body = name === "sparkle" && size > 14 ? ICON_PATHS.sparkleBig : ICON_PATHS[name];
  return `<svg class="dir-ai-svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function askAiIcon(name: string, size: number): string {
  return svg(name, size);
}

export const ASK_AI_STYLE = `
  /* ---- Ask AI sidebar ---- */
  .dir-ai-svg { flex: none; }
  .dir-ai-btn { flex: none; display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 16px; border-radius: 12px; border: 1px solid var(--ai-border, var(--line)); background: var(--ai-tint, var(--surface-2)); color: var(--ai-tint-text, var(--primary)); font: inherit; font-weight: 600; cursor: pointer; }
  .dir-ai-btn:hover { border-color: var(--ai-accent, var(--primary)); }
  .dir-ai-btn[aria-pressed="true"] { background: var(--ai-accent, var(--primary)); color: var(--ai-on-accent, #fff); border-color: var(--ai-accent, var(--primary)); }
  .dir-ai-helper { max-width: 880px; margin: 14px auto 0; font-size: 14px; line-height: 1.5; color: var(--muted); }
  .dir-ai-helper[hidden] { display: none; }
  .dir-ai-link { background: none; border: 0; padding: 0; min-height: 24px; font: inherit; font-weight: 700; color: var(--ai-tint-text, var(--primary)); text-decoration: underline; cursor: pointer; }
  .dir-ai-e3 { position: relative; display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px; border-radius: 99px; border: 1px solid var(--ai-border, var(--line)); background: var(--ai-tint, var(--surface-2)); color: var(--ai-tint-text, var(--primary)); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
  .dir-ai-e3::after { content: ""; position: absolute; inset: -4px 0; }
  .dir-ai-e3[hidden] { display: none; }
  .dir-ai-e3--static { cursor: default; background: transparent; border-style: dashed; }
  .dir-ai-pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 4px 3px 12px; border-radius: 99px; background: var(--ai-accent, var(--primary)); color: var(--ai-on-accent, #fff); font-size: 13px; font-weight: 600; }
  .dir-ai-pill[hidden] { display: none; }
  .dir-ai-pill button { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 50%; background: rgba(255,255,255,.2); color: inherit; font: inherit; line-height: 1; cursor: pointer; }
  .dir-ai-pill button::after { content: ""; position: absolute; inset: -9px; }
  .dir-ai-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

  .dir-ai-shell { display: flex; align-items: flex-start; width: 100%; }
  .dir-ai-main { flex: 1 1 0; min-width: 0; }
  body.dir-ai-open .dir-ai-shell { min-height: 100vh; }
  .dir-ai-panel { flex: none; width: 0; overflow: hidden; position: sticky; top: 0; height: calc(100vh - var(--ai-offset, 0px)); height: calc(100dvh - var(--ai-offset, 0px)); visibility: hidden; background: var(--surface); color: var(--ink); border-left: 1px solid var(--line); z-index: 31; transition: width .2s ease-out, visibility 0s linear .2s; }
  .dir-ai-panel--open { width: var(--ai-w, 400px); visibility: visible; transition: width .2s ease-out, visibility 0s; }
  .dir-ai-panel--wide { --ai-w: min(720px, 50vw); }
  .dir-ai-panel--instant, .dir-ai-panel--instant.dir-ai-panel--open { transition: none; }
  .dir-ai-inner { width: var(--ai-w, 400px); height: 100%; display: flex; flex-direction: column; }
  body.dir-ai-open .dir-content-row { flex-wrap: wrap; }
  body.dir-ai-open .dir-results { flex: 999 1 420px; }
  body.dir-ai-open .dir-map-pane { flex: 1 1 240px; }

  .dir-ai-head { display: flex; align-items: center; gap: 10px; padding: 12px 12px 12px 16px; background: var(--surface); border-bottom: 1px solid var(--line); }
  .dir-ai-avatar { flex: none; width: 34px; height: 34px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; background: var(--ai-accent, var(--primary)); color: var(--ai-on-accent, #fff); }
  .dir-ai-title { flex: 1; min-width: 0; }
  .dir-ai-title h2 { margin: 0; font-family: var(--font-heading); font-size: 17px; line-height: 1.2; }
  .dir-ai-title p { margin: 2px 0 0; font-size: 12px; line-height: 1.3; color: var(--muted); }
  .dir-ai-tools { display: flex; gap: 0; }
  .dir-ai-tool { width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 10px; background: transparent; color: var(--muted); cursor: pointer; }
  .dir-ai-tool:hover { background: var(--ai-tint, var(--surface-2)); color: var(--ai-tint-text, var(--primary)); }
  .dir-ai-tool[hidden] { display: none; }
  .dir-ai-ctx { display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: var(--ai-tint, var(--surface-2)); color: var(--ai-tint-text, var(--primary)); font-size: 13px; line-height: 1.4; border-bottom: 1px solid var(--ai-border, var(--line)); }
  .dir-ai-ctx[hidden], .dir-ai-confirm[hidden], .dir-ai-chips[hidden] { display: none; }
  .dir-ai-ctx > span { flex: 1; min-width: 0; }
  .dir-ai-ctx button { flex: none; min-height: 32px; padding: 0 4px; border: 0; background: none; color: inherit; font: inherit; font-weight: 700; text-decoration: underline; cursor: pointer; }
  .dir-ai-confirm { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; padding: 10px 16px; background: var(--surface-2); border-bottom: 1px solid var(--line); font-size: 13px; }
  .dir-ai-confirm span { flex: 1 1 160px; }
  .dir-ai-confirm button { min-height: 36px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: inherit; font-weight: 600; cursor: pointer; }
  .dir-ai-confirm button[data-ai-act="confirm-yes"] { background: var(--ai-accent, var(--primary)); color: var(--ai-on-accent, #fff); border-color: transparent; }

  .dir-ai-log { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 16px; background: var(--ai-panel-bg, var(--bg)); }
  .dir-ai-msg { display: flex; gap: 10px; font-size: 14.5px; line-height: 1.55; }
  .dir-ai-msg__av { flex: none; width: 26px; height: 26px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: var(--ai-tint, var(--surface-2)); color: var(--ai-tint-text, var(--primary)); }
  .dir-ai-msg__body { flex: 1; min-width: 0; }
  .dir-ai-msg__body p { margin: 0 0 8px; }
  .dir-ai-msg__body p:last-child { margin-bottom: 0; }
  .dir-ai-msg--u { justify-content: flex-end; }
  .dir-ai-bubble { max-width: 85%; padding: 10px 14px; border-radius: 16px 16px 4px 16px; background: var(--ai-user-bubble, var(--primary)); color: var(--ai-user-bubble-text, #fff); white-space: pre-wrap; overflow-wrap: anywhere; }
  .dir-ai-sys { align-self: center; max-width: 90%; text-align: center; font-size: 12.5px; line-height: 1.4; color: var(--muted); }
  .dir-ai-qr { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; }
  .dir-ai-chip { min-height: 40px; padding: 0 14px; border-radius: 99px; border: 1px solid var(--ai-border, var(--line)); background: var(--surface); color: var(--ai-tint-text, var(--primary)); font: inherit; font-size: 14px; cursor: pointer; }
  .dir-ai-chip:hover:not(:disabled) { background: var(--ai-tint, var(--surface-2)); }
  .dir-ai-chip:disabled { opacity: .5; cursor: default; }
  .dir-ai-chip--picked { background: var(--ai-tint, var(--surface-2)); border-color: var(--ai-accent, var(--primary)); font-weight: 700; }
  .dir-ai-cards { display: grid; gap: 10px; margin: 10px 0; }
  .dir-ai-card { padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
  .dir-ai-card strong { display: block; font-size: 14.5px; }
  .dir-ai-card p { margin: 4px 0 10px; font-size: 13px; line-height: 1.5; color: var(--muted); }
  .dir-ai-card__acts { display: flex; flex-wrap: wrap; gap: 8px; }
  .dir-ai-card__acts a, .dir-ai-card__acts button { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 14px; border-radius: 10px; font: inherit; font-size: 13.5px; font-weight: 600; text-decoration: none; cursor: pointer; }
  .dir-ai-card__view { background: var(--ai-accent, var(--primary)); color: var(--ai-on-accent, #fff); border: 1px solid transparent; }
  .dir-ai-card__map { background: var(--surface); color: var(--ai-tint-text, var(--primary)); border: 1px solid var(--ai-border, var(--line)); }
  .dir-ai-based { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 8px 0 0; font-size: 12px; color: var(--muted); }
  .dir-ai-tag { padding: 2px 8px; border-radius: 99px; background: var(--surface-2); color: var(--muted); }
  .dir-ai-acts { display: flex; gap: 2px; margin-top: 6px; }
  .dir-ai-acts button { width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--muted); cursor: pointer; }
  .dir-ai-acts button:hover, .dir-ai-acts button[aria-pressed="true"] { background: var(--ai-tint, var(--surface-2)); color: var(--ai-tint-text, var(--primary)); }
  .dir-ai-retry { min-height: 40px; padding: 0 14px; border-radius: 99px; border: 1px solid var(--ai-border, var(--line)); background: var(--surface); color: var(--ai-tint-text, var(--primary)); font: inherit; font-weight: 600; cursor: pointer; }
  .dir-ai-typing { display: flex; gap: 10px; align-items: center; }
  .dir-ai-dots { display: inline-flex; gap: 4px; }
  .dir-ai-dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--ai-tint-text, var(--primary)); opacity: .35; animation: dir-ai-blink 1.2s infinite ease-in-out; }
  .dir-ai-dots i:nth-child(2) { animation-delay: .2s; }
  .dir-ai-dots i:nth-child(3) { animation-delay: .4s; }
  @keyframes dir-ai-blink { 0%, 80%, 100% { opacity: .25; } 40% { opacity: 1; } }
  .dir-ai-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .dir-ai-chips { display: flex; gap: 8px; padding: 10px 16px 0; overflow-x: auto; flex-wrap: nowrap; background: var(--surface); }
  .dir-ai-chips .dir-ai-chip { flex: none; white-space: nowrap; }
  .dir-ai-form { display: flex; align-items: flex-end; gap: 8px; margin: 12px 16px 0; padding: 6px 6px 6px 12px; border: 1px solid var(--ai-border, var(--line)); border-radius: 16px; background: var(--surface); }
  .dir-ai-form:focus-within { border-color: var(--ai-accent, var(--primary)); box-shadow: 0 0 0 3px var(--ai-tint, var(--surface-2)); }
  .dir-ai-form textarea { flex: 1; min-width: 0; min-height: 44px; max-height: 152px; resize: none; padding: 10px 0; border: 0; outline: 0; background: transparent; color: var(--ink); font: inherit; font-size: 15px; line-height: 22px; }
  .dir-ai-send { flex: none; width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 12px; background: var(--ai-accent, var(--primary)); color: var(--ai-on-accent, #fff); cursor: pointer; }
  .dir-ai-send:disabled { opacity: .4; cursor: default; }
  .dir-ai-foot { margin: 0; padding: 8px 16px 12px; font-size: 12px; line-height: 1.4; color: var(--muted); background: var(--surface); }

  .dir-ai-launcher { position: fixed; right: 24px; bottom: 24px; z-index: 40; display: inline-flex; align-items: center; gap: 8px; min-height: 48px; padding: 0 20px; border: 0; border-radius: 99px; background: var(--ai-launcher-bg, var(--primary)); color: var(--ai-launcher-text, #fff); font: inherit; font-weight: 700; box-shadow: 0 10px 30px -8px rgba(0,0,0,.35); cursor: pointer; }
  .dir-ai-launcher[hidden] { display: none; }
  .dir-ai-dot { position: absolute; top: 6px; right: 8px; width: 11px; height: 11px; border-radius: 50%; background: #e11d48; border: 2px solid #fff; }
  .dir-ai-dot[hidden] { display: none; }
  .dir-ai-bar { display: none; }

  .dir-row__why { display: flex; gap: 8px; align-items: flex-start; background: var(--ai-tint, var(--surface-2)); color: var(--ai-tint-text, var(--ink)); }
  .dir-row__why[hidden] { display: none; }
  .dir-row__why .dir-ai-svg { margin-top: 2px; }

  @media (max-width: 899px) {
    .dir-ai-panel { position: fixed; inset: 0; width: 100%; height: 100%; border-left: 0; z-index: 60; transform: translateY(100%); transition: transform .25s ease-out, visibility 0s linear .25s; }
    .dir-ai-panel--open { width: 100%; transform: translateY(0); transition: transform .25s ease-out, visibility 0s; }
    .dir-ai-inner { width: 100%; }
    body.dir-ai-lock { overflow: hidden; }
    .dir-ai-bar:not([hidden]) { position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 40; display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 0 16px; border: 0; border-radius: 16px; background: var(--ai-launcher-bg, var(--primary)); color: var(--ai-launcher-text, #fff); font: inherit; text-align: left; box-shadow: 0 10px 30px -8px rgba(0,0,0,.35); cursor: pointer; }
    .dir-ai-bar strong { flex: none; }
    .dir-ai-bar span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: .85; font-size: 13px; }
    .dir-ai-launcher { right: 16px; bottom: 16px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .dir-ai-panel, .dir-ai-panel--open { transition: none; }
    .dir-ai-dots i { animation: none; opacity: .7; }
  }
`;

function toolButton(act: string, label: string, icon: string, extra = ""): string {
  return `<button type="button" class="dir-ai-tool" data-ai-act="${act}" aria-label="${label}"${extra}>${svg(icon, 18)}</button>`;
}

export function askAiPanelMarkup(opts: { total: number; nounMany: string }): string {
  const { total, nounMany } = opts;
  return `<aside id="dir-ai-panel" class="dir-ai-panel" aria-label="Ask AI">
  <div class="dir-ai-inner">
    <header class="dir-ai-head">
      <span class="dir-ai-avatar" aria-hidden="true">${svg("sparkle", 18)}</span>
      <div class="dir-ai-title"><h2>Ask AI</h2><p id="dir-ai-sub">Searches the ${total} ${nounMany} in this directory</p></div>
      <div class="dir-ai-tools">
        ${toolButton("new", "New conversation", "plus")}
        ${toolButton("expand", "Expand", "expand", ' aria-pressed="false"')}
        ${toolButton("min", "Minimise", "minimise")}
        ${toolButton("close", "Close", "close")}
      </div>
    </header>
    <div class="dir-ai-confirm" id="dir-ai-confirm" hidden>
      <span>Start over? This will clear the AI picks.</span>
      <button type="button" data-ai-act="confirm-yes">Start over</button>
      <button type="button" data-ai-act="confirm-no">Cancel</button>
    </div>
    <div class="dir-ai-ctx" id="dir-ai-ctx" hidden>
      ${svg("search", 14)}<span id="dir-ai-ctx-text"></span>
      <button type="button" id="dir-ai-ctx-all" data-ai-act="all"></button>
    </div>
    <div class="dir-ai-log" id="dir-ai-log" role="log" aria-live="polite" aria-relevant="additions"></div>
    <div class="dir-ai-chips" id="dir-ai-chips" hidden></div>
    <form class="dir-ai-form" id="dir-ai-form">
      <textarea id="dir-ai-input" rows="2" aria-label="Message to Ask AI"></textarea>
      <button type="submit" class="dir-ai-send" id="dir-ai-send" aria-label="Send" disabled>${svg("send", 20)}</button>
    </form>
    <p class="dir-ai-foot" id="dir-ai-foot">AI only suggests ${nounMany} listed here. Check details on each entry.</p>
  </div>
</aside>`;
}

export function askAiFloatingMarkup(): string {
  return `<button type="button" class="dir-ai-launcher" id="dir-ai-launcher" data-ai-open="E4" hidden>${svg("sparkle", 18)}<span id="dir-ai-launcher-label">Ask AI</span><i class="dir-ai-dot" id="dir-ai-dot" hidden></i></button>
<button type="button" class="dir-ai-bar" id="dir-ai-bar" data-ai-open="E4" hidden>${svg("sparkle", 18)}<strong>Ask AI</strong><span id="dir-ai-bar-text"></span></button>`;
}

export function buildAskAiScript(cfg: { hasMap: boolean }): string {
  const icons = JSON.stringify(ICON_PATHS).replace(/<\//g, "<\\/");
  return `
  // ===================== Ask AI sidebar =====================
  var HAS_MAP = ${cfg.hasMap ? "true" : "false"};
  var NOUN_ONE = 'entry';
  var NOUN_MANY = 'entries';
  var AI_ICONS = ${icons};
  var AI_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  var AI_PLACEHOLDER_FRESH = 'e.g. I\\u2019m a newly qualified nurse looking for CPD near Leeds';
  var aiStorageKey = AI_SEARCH_DIRECTORY_ID ? ('dm-ask-ai:' + AI_SEARCH_DIRECTORY_ID) : null;

  var aiShell = document.getElementById('dir-ai-shell');
  var aiPanel = document.getElementById('dir-ai-panel');
  var aiLog = document.getElementById('dir-ai-log');
  var aiForm = document.getElementById('dir-ai-form');
  var aiInput = document.getElementById('dir-ai-input');
  var aiSendBtn = document.getElementById('dir-ai-send');
  var aiChipsEl = document.getElementById('dir-ai-chips');
  var aiCtxEl = document.getElementById('dir-ai-ctx');
  var aiCtxText = document.getElementById('dir-ai-ctx-text');
  var aiCtxAll = document.getElementById('dir-ai-ctx-all');
  var aiFootEl = document.getElementById('dir-ai-foot');
  var aiConfirmEl = document.getElementById('dir-ai-confirm');
  var aiLauncher = document.getElementById('dir-ai-launcher');
  var aiLauncherLabel = document.getElementById('dir-ai-launcher-label');
  var aiDot = document.getElementById('dir-ai-dot');
  var aiBar = document.getElementById('dir-ai-bar');
  var aiBarText = document.getElementById('dir-ai-bar-text');
  var aiE1 = document.getElementById('dir-ai-e1');
  var aiE2 = document.getElementById('dir-ai-e2');
  var aiE3 = document.getElementById('dir-ai-e3');
  var aiE3Static = document.getElementById('dir-ai-e3-static');
  var aiPill = document.getElementById('dir-ai-pill');
  var aiShowAll = document.getElementById('dir-ai-showall');
  var aiLive = document.getElementById('dir-ai-live');
  var aiFootDefault = aiFootEl ? aiFootEl.textContent : '';

  var aiThread = [];
  var aiScoped = false;
  var aiScopeQuery = '';
  var aiBusy = false;
  var aiController = null;
  var aiUserStopped = false;
  var aiSnap = null;
  var aiUi = { open: false, min: false, exp: false };
  var aiUnread = false;
  var aiRendered = 0;
  var aiLastSig = null;
  var aiPastSearch = false;
  var aiOpener = null;
  var aiCooldownUntil = 0;
  var aiCooldownTimer = null;
  var aiCtxTimer = null;
  var aiPicksSig = '';
  var aiRowById = {};
  var aiTermIndex = {};
  rows.forEach(function (r) { aiRowById[r.getAttribute('data-entry-id')] = r; });
  CATS.forEach(function (cat) { cat.terms.forEach(function (t) { aiTermIndex[t.id] = { label: t.label, cat: cat }; }); });

  function aiSvg(name, size) {
    var body = (name === 'sparkle' && size > 14) ? AI_ICONS.sparkleBig : AI_ICONS[name];
    return '<svg class="dir-ai-svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }
  function aiEl(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function aiPlural(n) { return n === 1 ? NOUN_ONE : NOUN_MANY; }
  function aiCountWord(n) { return n < AI_WORDS.length ? AI_WORDS[n] : String(n); }
  function aiLq(s) { return '\\u201c' + s + '\\u201d'; }
  function aiIsMobile() { return !!(window.matchMedia && window.matchMedia('(max-width: 899px)').matches); }
  function aiReduced() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function aiRecord(name, meta) { if (window.dmRecordEngagement) window.dmRecordEngagement(name, { meta: meta || {} }); }
  function aiRowName(id) { var r = aiRowById[id]; var h = r ? r.querySelector('h3') : null; return h ? h.textContent : ''; }
  function aiAnnounce(text) {
    if (!aiLive) return;
    aiLive.textContent = '';
    setTimeout(function () { aiLive.textContent = text; }, 30);
  }

  // ---------- persistence ----------
  function aiPersist() {
    if (!aiStorageKey) return;
    try {
      sessionStorage.setItem(aiStorageKey, JSON.stringify({
        v: 2, thread: aiThread, messages: aiMessages, picks: resultEntryIds, reasons: aiReasons, basedOn: aiBasedOn,
        scoped: aiScoped, candidateIds: aiCandidateIds, scopeQuery: aiScopeQuery, sig: aiLastSig, ui: aiUi
      }));
    } catch (err) {}
  }
  function aiRestore() {
    if (!aiStorageKey) return;
    try {
      var raw = sessionStorage.getItem(aiStorageKey);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (!d || d.v !== 2) return;
      if (Array.isArray(d.thread)) aiThread = d.thread;
      if (Array.isArray(d.messages)) aiMessages = d.messages;
      if (Array.isArray(d.picks)) resultEntryIds = d.picks;
      if (d.reasons && typeof d.reasons === 'object') aiReasons = d.reasons;
      if (Array.isArray(d.basedOn)) aiBasedOn = d.basedOn;
      aiScoped = !!d.scoped && Array.isArray(d.candidateIds);
      aiCandidateIds = aiScoped ? d.candidateIds : null;
      aiScopeQuery = typeof d.scopeQuery === 'string' ? d.scopeQuery : '';
      aiLastSig = typeof d.sig === 'string' ? d.sig : null;
      if (d.ui && typeof d.ui === 'object') aiUi = { open: !!d.ui.open, min: !!d.ui.min, exp: !!d.ui.exp };
    } catch (err) {}
  }

  // ---------- search context ----------
  function aiFilterLabels() {
    var out = [];
    Object.keys(active).forEach(function (catId) {
      var cat = catById(catId);
      if (!cat) return;
      (active[catId] || []).forEach(function (tid) {
        var t = termById(cat, tid);
        if (t) out.push(cat.field_type === 'boolean' ? cat.label : t.label);
      });
    });
    if (LOCATION_SEARCH && distanceLabel && distanceOrigin) out.push('within ' + distanceMiles + ' miles of ' + distanceLabel);
    return out;
  }
  function aiHasContext() {
    var q = input ? input.value.trim() : '';
    if (q) return true;
    if (LOCATION_SEARCH && distanceLabel) return true;
    return Object.keys(active).some(function (k) { return (active[k] || []).length > 0; });
  }
  function aiContext() {
    var q = input ? input.value.trim() : '';
    var filters = aiFilterLabels();
    var ids = matchingIdsIgnoringAi();
    return { q: q, filters: filters, ids: ids, n: ids.length, has: !!(q || filters.length) };
  }
  function aiSig() {
    return (input ? input.value.trim() : '') + '|' + JSON.stringify(active) + '|' + (distanceLabel || '') + '|' + distanceMiles;
  }
  function aiTopTerms(ids, o) {
    var counts = {};
    ids.forEach(function (id) {
      var r = aiRowById[id];
      if (!r) return;
      rowTermIds(r).forEach(function (tid) { counts[tid] = (counts[tid] || 0) + 1; });
    });
    var out = [];
    Object.keys(counts).forEach(function (tid) {
      var ti = aiTermIndex[tid];
      if (!ti || ti.cat.field_type === 'boolean') return;
      if (o.cat && ti.cat.id !== o.cat.id) return;
      if (o.splitOnly && counts[tid] >= ids.length) return;
      if (o.skipActive && (active[ti.cat.id] || []).indexOf(tid) !== -1) return;
      out.push({ label: ti.label, n: counts[tid] });
    });
    out.sort(function (a, b) { return (b.n - a.n) || (a.label < b.label ? -1 : 1); });
    return out.slice(0, o.limit);
  }
  function aiSectorCat() {
    for (var i = 0; i < CATS.length; i++) {
      if (/sector|industry/i.test(CATS[i].label) && CATS[i].field_type !== 'boolean') return CATS[i];
    }
    return null;
  }
  function aiSplitChips(ids) {
    var cat = aiSectorCat();
    var a = cat ? aiTopTerms(ids, { cat: cat, splitOnly: true, skipActive: true, limit: 3 }) : [];
    if (a.length >= 2) return a;
    var b = aiTopTerms(ids, { splitOnly: true, skipActive: true, limit: 3 });
    return b.length >= 2 ? b : [];
  }

  // ---------- opening message (client-side, no LLM call) ----------
  function aiChipItems(labels, withOther) {
    var items = labels.map(function (l) { return { label: l }; });
    if (withOther) items.push({ label: 'Something else', other: true });
    return items;
  }
  function aiGreeting(prefix) {
    var b = [];
    b.push({ k: 'p', text: (prefix ? prefix + ' ' : '') + 'Hi. Tell me a bit about what you need and I\\u2019ll find the ' + NOUN_MANY + ' that fit, then show them in the list' + (HAS_MAP ? ' and on the map' : '') + '.' });
    b.push({ k: 'q', text: 'What are you looking for?' });
    b.push({ k: 'chips', items: aiChipItems(['Support for me', 'Support for my business', 'I\\u2019m not sure yet'], false) });
    var sec = aiSectorCat();
    if (sec) {
      var allIds = rows.map(function (r) { return r.getAttribute('data-entry-id'); });
      var top = aiTopTerms(allIds, { cat: sec, limit: 5 });
      if (top.length) {
        b.push({ k: 'q', text: 'What\\u2019s your profession or industry?' });
        b.push({ k: 'chips', items: aiChipItems(top.map(function (t) { return t.label; }), true) });
      }
    }
    return b;
  }
  function aiBuildOpening(ctx) {
    var blocks = [];
    var sentence = ctx.q ? aiLq(ctx.q) : 'those filters';
    if (ctx.has && ctx.n === 0) {
      blocks.push({ k: 'p', text: ctx.q
        ? 'I couldn\\u2019t find anything matching ' + aiLq(ctx.q) + ' as a keyword. Tell me what you\\u2019re after and I\\u2019ll look across all ' + totalCount + '.'
        : 'I couldn\\u2019t find anything with those filters. Tell me what you\\u2019re after and I\\u2019ll look across all ' + totalCount + '.' });
    } else if (ctx.has && ctx.n === 1) {
      blocks = aiGreeting('There\\u2019s one match for ' + sentence + '. If that isn\\u2019t it, I can help you look more widely.');
    } else if (ctx.has && ctx.n >= 2) {
      var intro;
      if (ctx.q && ctx.filters.length) intro = 'I see you\\u2019ve searched for ' + aiLq(ctx.q) + ' with ' + ctx.filters.join(', ') + '. That matches ' + ctx.n + ' ' + NOUN_MANY + '.';
      else if (ctx.q) intro = 'I see you\\u2019ve searched for ' + aiLq(ctx.q) + '. That matches ' + ctx.n + ' ' + NOUN_MANY + '.';
      else intro = 'I see you\\u2019re looking at ' + ctx.filters.join(', ') + '. That\\u2019s ' + ctx.n + ' ' + NOUN_MANY + '.';
      blocks.push({ k: 'p', text: intro });
      var split = aiSplitChips(ctx.ids);
      if (split.length) {
        blocks.push({ k: 'q', text: 'Which of these is closest to what you need?' });
        blocks.push({ k: 'chips', items: aiChipItems(split.map(function (t) { return t.label; }), true) });
      }
      blocks.push({ k: 'q', text: 'And is this for you, or for your organisation?' });
      blocks.push({ k: 'chips', items: aiChipItems(['For me', 'For my organisation'], false) });
    } else {
      blocks = aiGreeting('');
    }
    return { t: 'a', blocks: blocks };
  }
  function aiPlain(item) {
    if (item.t === 'r') return item.text + ' ' + (item.ids || []).map(aiRowName).join('; ');
    return (item.blocks || []).filter(function (b) { return b.k !== 'chips'; }).map(function (b) { return b.text; }).join(' ');
  }
  function aiStartConversation() {
    var ctx = aiContext();
    aiScoped = ctx.has && ctx.n >= 2 && ctx.n < totalCount;
    aiCandidateIds = aiScoped ? ctx.ids : null;
    aiScopeQuery = aiScoped ? ctx.q : '';
    var opening = aiBuildOpening(ctx);
    aiThread = [opening];
    aiMessages = [{ role: 'assistant', content: aiPlain(opening) }];
    aiLastSig = aiSig();
    aiPersist();
  }

  // ---------- rendering ----------
  function aiAvatar() {
    var av = aiEl('span', 'dir-ai-msg__av');
    av.innerHTML = aiSvg('sparkle', 14);
    return av;
  }
  function aiRenderItem(item, idx) {
    var wrap;
    if (item.t === 'u') {
      wrap = aiEl('div', 'dir-ai-msg dir-ai-msg--u');
      wrap.appendChild(aiEl('div', 'dir-ai-bubble', item.text));
      return wrap;
    }
    if (item.t === 's') return aiEl('div', 'dir-ai-sys', item.text);
    wrap = aiEl('div', 'dir-ai-msg');
    wrap.appendChild(aiAvatar());
    var body = aiEl('div', 'dir-ai-msg__body');
    wrap.appendChild(body);
    if (item.t === 'e') {
      body.appendChild(aiEl('p', '', 'Something went wrong. Try again?'));
      var rb = aiEl('button', 'dir-ai-retry', 'Retry');
      rb.type = 'button';
      rb.setAttribute('data-ai-retry', '1');
      body.appendChild(rb);
      return wrap;
    }
    if (item.t === 'a') {
      var out = [];
      (item.blocks || []).forEach(function (b, bi) {
        if (b.k === 'chips') {
          var row = aiEl('div', 'dir-ai-qr');
          (b.items || []).forEach(function (c, ci) {
            var btn = aiEl('button', 'dir-ai-chip' + (c.picked ? ' dir-ai-chip--picked' : ''), c.label);
            btn.type = 'button';
            btn.setAttribute('data-ai-chip', idx + ':' + bi + ':' + ci);
            if (c.picked) btn.setAttribute('aria-pressed', 'true');
            row.appendChild(btn);
          });
          out.push(row);
        } else if (b.k === 'q') {
          var qp = aiEl('p');
          qp.appendChild(aiEl('strong', '', b.text));
          out.push(qp);
        } else {
          out.push(aiEl('p', '', b.text));
        }
      });
      out.forEach(function (n) { body.appendChild(n); });
      return wrap;
    }
    if (item.t === 'r') {
      body.appendChild(aiEl('p', '', item.text));
      if (item.based && item.based.length) {
        var based = aiEl('div', 'dir-ai-based');
        based.appendChild(aiEl('span', '', 'Based on:'));
        item.based.forEach(function (t) { based.appendChild(aiEl('span', 'dir-ai-tag', t)); });
        body.appendChild(based);
      }
      var cards = aiEl('div', 'dir-ai-cards');
      (item.ids || []).forEach(function (id) {
        var row = aiRowById[id];
        if (!row) return;
        var card = aiEl('div', 'dir-ai-card');
        card.appendChild(aiEl('strong', '', aiRowName(id)));
        var why = item.reasons && item.reasons[id];
        if (why) card.appendChild(aiEl('p', '', why));
        var acts = aiEl('div', 'dir-ai-card__acts');
        var view = aiEl('a', 'dir-ai-card__view', 'View entry');
        view.href = row.getAttribute('href');
        acts.appendChild(view);
        if (HAS_MAP) {
          var mb = aiEl('button', 'dir-ai-card__map', 'Show on map');
          mb.type = 'button';
          mb.setAttribute('data-ai-map', id);
          acts.appendChild(mb);
        }
        card.appendChild(acts);
        cards.appendChild(card);
      });
      body.appendChild(cards);
      var tools = aiEl('div', 'dir-ai-acts');
      [['up', 'Helpful'], ['down', 'Not helpful'], ['copy', 'Copy answer']].forEach(function (a) {
        var b = aiEl('button');
        b.type = 'button';
        b.setAttribute('aria-label', a[1]);
        b.innerHTML = aiSvg(a[0], 16);
        if (a[0] === 'copy') b.setAttribute('data-ai-copy', String(idx));
        else {
          b.setAttribute('data-ai-fb', a[0] + ':' + idx);
          b.setAttribute('aria-pressed', item.fb === a[0] ? 'true' : 'false');
        }
        tools.appendChild(b);
      });
      body.appendChild(tools);
      return wrap;
    }
    return wrap;
  }
  function aiTypingEl() {
    var t = aiEl('div', 'dir-ai-msg dir-ai-typing');
    t.id = 'dir-ai-typing';
    t.appendChild(aiAvatar());
    t.insertAdjacentHTML('beforeend', '<span class="dir-ai-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="dir-ai-sr">Ask AI is typing</span>');
    return t;
  }
  function aiRenderThread(full) {
    if (!aiLog) return;
    if (full || aiRendered > aiThread.length) {
      aiLog.setAttribute('aria-live', 'off');
      aiLog.innerHTML = '';
      aiRendered = 0;
    }
    for (var i = aiRendered; i < aiThread.length; i++) aiLog.appendChild(aiRenderItem(aiThread[i], i));
    aiRendered = aiThread.length;
    var old = document.getElementById('dir-ai-typing');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    if (aiBusy) aiLog.appendChild(aiTypingEl());
    aiLog.scrollTop = aiLog.scrollHeight;
    Array.prototype.forEach.call(aiLog.querySelectorAll('[data-ai-chip]'), function (b) { b.disabled = aiBusy; });
    if (aiLog.getAttribute('aria-live') === 'off') setTimeout(function () { aiLog.setAttribute('aria-live', 'polite'); }, 60);
  }
  function aiRenderSuggest() {
    if (!aiChipsEl) return;
    aiChipsEl.innerHTML = '';
    var last = aiThread[aiThread.length - 1];
    var s = last && last.sugg && !aiBusy ? last.sugg : null;
    if (!s || !s.length) { aiChipsEl.hidden = true; return; }
    s.forEach(function (c, i) {
      var b = aiEl('button', 'dir-ai-chip', c.label);
      b.type = 'button';
      b.setAttribute('data-ai-sugg', String(i));
      aiChipsEl.appendChild(b);
    });
    aiChipsEl.hidden = false;
  }
  function aiRenderCtx() {
    if (!aiCtxEl) return;
    if (!aiScoped || !aiCandidateIds) { aiCtxEl.hidden = true; return; }
    aiCtxEl.hidden = false;
    aiCtxText.innerHTML = '';
    aiCtxText.appendChild(document.createTextNode('Working from '));
    aiCtxText.appendChild(aiEl('strong', '', aiCandidateIds.length + ' results'));
    var f = aiFilterLabels().length > 0;
    var tail = aiScopeQuery && f ? ' for ' + aiLq(aiScopeQuery) + ' with your filters' : aiScopeQuery ? ' for ' + aiLq(aiScopeQuery) : ' with your filters';
    aiCtxText.appendChild(document.createTextNode(tail));
    if (aiCtxAll) aiCtxAll.textContent = 'Search all ' + totalCount;
  }
  function aiPlaceholder() {
    var last = aiThread[aiThread.length - 1];
    if (resultEntryIds || (last && last.t === 'r')) return 'Refine, or ask a follow-up';
    var typed = aiThread.some(function (m) { return m.t === 'u'; });
    if (typed) return 'Type your answer, or pick an option';
    if (aiScoped) return 'Pick an option or describe your situation';
    return AI_PLACEHOLDER_FRESH;
  }
  function aiCooldownActive() { return aiCooldownUntil > Date.now(); }
  function aiUpdateComposer() {
    var cool = aiCooldownActive();
    if (aiInput) {
      aiInput.disabled = cool;
      aiInput.placeholder = aiPlaceholder();
    }
    var hasText = !!(aiInput && aiInput.value.trim());
    if (aiSendBtn) {
      aiSendBtn.setAttribute('aria-label', aiBusy ? 'Stop' : 'Send');
      aiSendBtn.innerHTML = aiSvg(aiBusy ? 'stop' : 'send', 20);
      aiSendBtn.disabled = !aiBusy && (!hasText || cool);
    }
    if (aiFootEl) {
      aiFootEl.textContent = cool
        ? 'Ask AI is busy. You can try again in ' + Math.max(1, Math.ceil((aiCooldownUntil - Date.now()) / 1000)) + 's.'
        : aiFootDefault;
    }
  }
  function aiAutosize() {
    if (!aiInput) return;
    aiInput.style.height = 'auto';
    aiInput.style.height = Math.min(aiInput.scrollHeight, 152) + 'px';
  }
  function aiRenderAll(full) {
    aiRenderThread(full);
    aiRenderCtx();
    aiRenderSuggest();
    aiUpdateComposer();
  }

  // ---------- panel chrome ----------
  function aiUpdateTop() {
    if (!aiShell) return;
    var top = Math.max(0, Math.round(aiShell.getBoundingClientRect().top));
    document.documentElement.style.setProperty('--ai-offset', top + 'px');
    var sf = document.getElementById('dir-search-form');
    var past = sf ? sf.getBoundingClientRect().bottom < 0 : true;
    if (past !== aiPastSearch) { aiPastSearch = past; aiUpdateLauncher(); }
  }
  function aiBarPreview() {
    for (var i = aiThread.length - 1; i >= 0; i--) {
      var m = aiThread[i];
      if (m.t === 'a' || m.t === 'r') {
        var txt = aiPlain(m);
        return txt.length > 70 ? txt.slice(0, 67) + '...' : txt;
      }
    }
    return '';
  }
  function aiUpdateLauncher() {
    var mobile = aiIsMobile();
    var showSetting = !aiShell || aiShell.getAttribute('data-show-launcher') !== '0';
    var barOn = mobile && aiUi.min && !aiUi.open;
    if (aiLauncher) {
      var on = !aiUi.open && !barOn && (aiUi.min || (showSetting && aiPastSearch));
      aiLauncher.hidden = !on;
      if (aiLauncherLabel) aiLauncherLabel.textContent = (aiHasContext() || resultEntryIds) ? 'Ask AI about these results' : 'Ask AI';
      if (aiDot) aiDot.hidden = !aiUnread;
    }
    if (aiBar) {
      aiBar.hidden = !barOn;
      if (aiBarText) aiBarText.textContent = aiBarPreview();
    }
  }
  function aiUpdateE3(shown) {
    if (!aiE3 || !aiE3Static) return;
    var eligible = !resultEntryIds && aiHasContext() && shown >= 2 && shown < totalCount;
    var n = aiScoped && aiCandidateIds ? aiCandidateIds.length : shown;
    if (aiUi.open) {
      aiE3.hidden = true;
      aiE3Static.hidden = !(eligible || (aiScoped && !resultEntryIds));
      aiE3Static.lastChild.textContent = 'Ask AI is working from these ' + n;
    } else {
      aiE3Static.hidden = true;
      aiE3.hidden = !eligible;
      aiE3.lastChild.textContent = 'Narrow these ' + shown + ' with AI';
    }
  }
  function aiUpdateChrome() {
    var mobile = aiIsMobile();
    if (aiPanel) {
      aiPanel.classList.toggle('dir-ai-panel--open', aiUi.open);
      aiPanel.classList.toggle('dir-ai-panel--wide', aiUi.exp && !mobile);
      if (mobile) {
        aiPanel.setAttribute('role', 'dialog');
        aiPanel.setAttribute('aria-modal', aiUi.open ? 'true' : 'false');
      } else {
        aiPanel.removeAttribute('role');
        aiPanel.removeAttribute('aria-modal');
      }
      var ex = aiPanel.querySelector('[data-ai-act="expand"]');
      if (ex) {
        ex.hidden = mobile;
        ex.setAttribute('aria-label', aiUi.exp ? 'Collapse' : 'Expand');
        ex.setAttribute('aria-pressed', aiUi.exp ? 'true' : 'false');
        ex.innerHTML = aiSvg(aiUi.exp ? 'collapse' : 'expand', 18);
      }
    }
    document.body.classList.toggle('dir-ai-open', aiUi.open);
    document.body.classList.toggle('dir-ai-lock', aiUi.open && mobile);
    if (aiE1) {
      aiE1.setAttribute('aria-pressed', aiUi.open ? 'true' : 'false');
    }
    if (aiE2) aiE2.hidden = aiUi.open;
    aiUpdateLauncher();
    aiUpdateTop();
  }
  function aiFocusOnOpen(entry) {
    var empty = !aiInput || !aiInput.value.trim();
    if (entry !== 'E2' && empty && aiThread.length === 1 && aiLog) {
      var chip = aiLog.querySelector('[data-ai-chip]');
      if (chip) { chip.focus(); return; }
    }
    if (aiInput) aiInput.focus();
  }
  function aiOpen(entry, opener) {
    if (!AI_SEARCH_ENABLED || !aiPanel) return;
    var wasOpen = aiUi.open;
    aiOpener = opener || document.activeElement;
    aiUi.open = true;
    aiUi.min = false;
    aiUnread = false;
    if (!aiThread.length) aiStartConversation();
    else aiApplyContextChange();
    aiRenderAll(true);
    aiUpdateChrome();
    aiUpdateE3(aiShownCount);
    aiPersist();
    if (!wasOpen) aiRecord('ask_ai_open', { entry_point: entry, has_context: aiHasContext() });
    aiFocusOnOpen(entry);
  }
  function aiClose(restoreFocus) {
    aiUi.open = false;
    aiUi.min = false;
    aiUpdateChrome();
    aiUpdateE3(aiShownCount);
    aiPersist();
    if (restoreFocus !== false && aiOpener && aiOpener.focus && document.body.contains(aiOpener) && !aiOpener.hidden) aiOpener.focus();
  }
  function aiMinimise() {
    aiUi.open = false;
    aiUi.min = true;
    aiUpdateChrome();
    aiUpdateE3(aiShownCount);
    aiPersist();
    var target = aiIsMobile() ? aiBar : aiLauncher;
    if (target && !target.hidden) target.focus();
  }
  function aiToggleExpand() {
    aiUi.exp = !aiUi.exp;
    aiUpdateChrome();
    aiPersist();
  }

  // ---------- conversation ----------
  function aiSubmit() {
    if (aiBusy) { aiStop(); return; }
    aiSend(aiInput ? aiInput.value : '', 'typed');
  }
  function aiSend(text, via) {
    text = String(text || '').trim();
    if (!text || aiBusy || aiCooldownActive()) return;
    if (!aiThread.length) aiStartConversation();
    aiSnap = { thread: aiThread.length, model: aiMessages.length, text: text };
    aiThread.push({ t: 'u', text: text.slice(0, 2000) });
    aiMessages.push({ role: 'user', content: text.slice(0, 2000) });
    aiRecord('ask_ai_message_sent', { via: via });
    if (aiInput) { aiInput.value = ''; aiAutosize(); }
    aiRun();
  }
  function aiStop() {
    if (!aiBusy) return;
    aiUserStopped = true;
    aiSearchToken++;
    if (aiController) { try { aiController.abort(); } catch (err) {} }
    aiBusy = false;
    if (aiSnap) {
      aiThread.length = aiSnap.thread;
      aiMessages.length = aiSnap.model;
      if (aiInput) { aiInput.value = aiSnap.text; aiAutosize(); }
    }
    aiSnap = null;
    aiRenderAll(true);
    aiPersist();
  }
  function aiRun() {
    if (!AI_SEARCH_URL || !aiMessages.length) return;
    var token = ++aiSearchToken;
    aiUserStopped = false;
    aiBusy = true;
    aiRenderAll(false);
    var hasAbort = typeof AbortController !== 'undefined';
    aiController = hasAbort ? new AbortController() : null;
    var timeoutId = aiController ? setTimeout(function () { aiController.abort(); }, 25000) : null;
    var payload = { directory_id: AI_SEARCH_DIRECTORY_ID, messages: aiMessages };
    if (aiScoped && aiCandidateIds) payload.candidate_entry_ids = aiCandidateIds;
    fetch(AI_SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': AI_SEARCH_ANON_KEY },
      body: JSON.stringify(payload),
      signal: aiController ? aiController.signal : undefined
    })
      .then(function (res) {
        if (timeoutId) clearTimeout(timeoutId);
        if (!res.ok) throw new Error('directory_ai_search returned ' + res.status);
        return res.json();
      })
      .then(function (body) {
        if (token !== aiSearchToken) return;
        aiBusy = false;
        aiSnap = null;
        aiHandleBody(body);
      })
      .catch(function () {
        if (timeoutId) clearTimeout(timeoutId);
        if (token !== aiSearchToken || aiUserStopped) return;
        aiBusy = false;
        aiSnap = null;
        aiThread.push({ t: 'e' });
        aiAfterReply();
      });
  }
  function aiAfterReply() {
    if (!aiUi.open) aiUnread = true;
    aiRenderAll(false);
    aiUpdateLauncher();
    aiPersist();
  }
  function aiHandleBody(body) {
    if (!body || body.disabled) {
      aiThread.push({ t: 'a', blocks: [{ k: 'p', text: 'Ask AI is busy right now. You can keep using search and filters, or try again in a minute.' }] });
      aiRecord('ask_ai_rate_limited', {});
      aiCooldownUntil = Date.now() + 60000;
      aiTickCooldown();
      aiAfterReply();
      return;
    }
    if (body.follow_up && body.follow_up.question) {
      var q = String(body.follow_up.question);
      var blocks = [{ k: 'q', text: q }];
      var opts = Array.isArray(body.follow_up.options) ? body.follow_up.options.filter(function (o) { return typeof o === 'string' && o; }).slice(0, 5) : [];
      if (opts.length) blocks.push({ k: 'chips', items: aiChipItems(opts, false) });
      aiThread.push({ t: 'a', blocks: blocks });
      aiMessages.push({ role: 'assistant', content: q });
      aiAfterReply();
      return;
    }
    if (!Array.isArray(body.entry_ids)) {
      aiThread.push({ t: 'e' });
      aiAfterReply();
      return;
    }
    aiApplyResult(body);
  }
  function aiApplyResult(body) {
    var ids = body.entry_ids.filter(function (id) { return !!aiRowById[id]; });
    var scopeN = aiScoped && aiCandidateIds ? aiCandidateIds.length : 0;
    if (!ids.length) {
      var none = 'None of these quite fit.' + (aiScoped ? ' Want me to look across all ' + totalCount + '?' : ' Try describing it a different way.');
      var item = { t: 'a', blocks: [{ k: 'p', text: none }] };
      if (aiScoped) item.sugg = [{ label: 'Look across all ' + totalCount, act: 'all' }];
      aiThread.push(item);
      aiMessages.push({ role: 'assistant', content: none });
      aiAfterReply();
      return;
    }
    resultEntryIds = ids;
    aiReasons = body.reasons && typeof body.reasons === 'object' ? body.reasons : {};
    aiBasedOn = Array.isArray(body.based_on) ? body.based_on : [];
    var where = ' I\\u2019ve shown them in the list' + (HAS_MAP ? ' and on the map' : '') + '.';
    var text = scopeN
      ? aiCountWord(ids.length) + ' of the ' + scopeN + ' fit best.' + where
      : 'I found ' + ids.length + ' that fit.' + where;
    var r = { t: 'r', text: text, ids: ids, reasons: aiReasons, based: aiBasedOn, fb: null, sugg: [] };
    if (aiScoped) r.sugg.push({ label: 'Look across all ' + totalCount, act: 'all' });
    if (LOCATION_SEARCH) r.sugg.push({ label: 'Only ones near me', act: 'near' });
    if (ids.length >= 2 && ids.length <= 3) r.sugg.push({ label: 'Compare these', act: 'compare' });
    aiThread.push(r);
    aiMessages.push({ role: 'assistant', content: aiPlain(r) });
    aiRecord('ask_ai_picks_applied', { k: ids.length, scoped: !!aiScoped });
    apply();
    aiAfterReply();
  }
  function aiTickCooldown() {
    clearTimeout(aiCooldownTimer);
    if (aiCooldownUntil - Date.now() <= 0) { aiCooldownUntil = 0; aiUpdateComposer(); return; }
    aiUpdateComposer();
    aiCooldownTimer = setTimeout(aiTickCooldown, 1000);
  }
  function aiChipClick(btn) {
    var p = btn.getAttribute('data-ai-chip').split(':');
    var item = aiThread[parseInt(p[0], 10)];
    var block = item && item.blocks ? item.blocks[parseInt(p[1], 10)] : null;
    var chip = block && block.items ? block.items[parseInt(p[2], 10)] : null;
    if (!chip || aiBusy) return;
    if (chip.other) { if (aiInput) aiInput.focus(); return; }
    chip.picked = true;
    aiSend(chip.label, 'chip');
    aiRenderThread(true);
  }
  function aiSuggClick(i) {
    var last = aiThread[aiThread.length - 1];
    var c = last && last.sugg ? last.sugg[i] : null;
    if (!c || aiBusy) return;
    if (c.act === 'all') aiUnscope(true);
    aiSend(c.label, 'chip');
  }

  // ---------- scope, picks, context changes ----------
  function aiUnscope(announce) {
    if (!aiScoped) return;
    aiScoped = false;
    aiCandidateIds = null;
    aiScopeQuery = '';
    if (announce) aiThread.push({ t: 's', text: 'Now searching all ' + totalCount + ' ' + NOUN_MANY + '.' });
    aiRenderThread(false);
    aiRenderCtx();
    aiPersist();
    if (resultEntryIds) apply(); else aiUpdateE3(aiShownCount);
  }
  function aiDropPicks(reason, skipApply) {
    if (!resultEntryIds) return;
    resultEntryIds = null;
    aiReasons = {};
    aiBasedOn = [];
    aiRecord('ask_ai_picks_cleared', { reason: reason });
    if (aiThread.length && reason === 'clear_button') aiThread.push({ t: 's', text: 'AI picks cleared.' });
    aiRenderThread(false);
    aiRenderSuggest();
    aiUpdateComposer();
    aiPersist();
    if (!skipApply) apply();
  }
  function aiApplyContextChange() {
    var sig = aiSig();
    if (aiLastSig === sig) return;
    aiLastSig = sig;
    if (!aiThread.length) return;
    var ctx = aiContext();
    var onlyOpening = aiThread.length === 1 && aiThread[0].t === 'a';
    if (onlyOpening && !aiBusy) { aiStartConversation(); aiRenderAll(true); return; }
    if (!aiScoped) { aiPersist(); return; }
    var line;
    if (ctx.has && ctx.n >= 2 && ctx.n < totalCount) {
      aiCandidateIds = ctx.ids;
      aiScopeQuery = ctx.q;
      line = ctx.q ? 'Search changed to ' + aiLq(ctx.q) + ': ' + ctx.n + ' results.' : 'Filters changed: ' + ctx.n + ' results.';
    } else {
      aiScoped = false;
      aiCandidateIds = null;
      aiScopeQuery = '';
      line = ctx.has
        ? 'Search changed to ' + (ctx.q ? aiLq(ctx.q) : 'your filters') + ': ' + ctx.n + ' ' + (ctx.n === 1 ? 'result' : 'results') + '. Now searching all ' + totalCount + '.'
        : 'Search cleared. Now searching all ' + totalCount + '.';
    }
    aiThread.push({ t: 's', text: line });
    aiRenderThread(false);
    aiRenderCtx();
    aiPersist();
  }
  var aiShownCount = totalCount;
  // Called at the end of every apply(): keeps the AI chrome in step with the results.
  function aiAfterApply(shown) {
    if (!AI_SEARCH_ENABLED) return;
    aiShownCount = shown;
    aiUpdateE3(shown);
    aiUpdateLauncher();
    if (aiPill) aiPill.hidden = !resultEntryIds;
    if (aiShowAll) {
      aiShowAll.hidden = !resultEntryIds;
      if (resultEntryIds) {
        var n = aiScoped && aiCandidateIds ? aiCandidateIds.length : matchingIdsIgnoringAi().length;
        aiShowAll.textContent = 'Show all ' + n;
      }
    }
    var sig = resultEntryIds ? resultEntryIds.join(',') : '';
    if (sig !== aiPicksSig) {
      aiPicksSig = sig;
      if (resultEntryIds) aiAnnounce(resultEntryIds.length + ' AI picks shown in the results');
    }
    if (aiLastSig === null) aiLastSig = aiSig();
    clearTimeout(aiCtxTimer);
    if (aiThread.length) aiCtxTimer = setTimeout(function () {
      aiApplyContextChange();
      aiUpdateE3(aiShownCount);
    }, 500);
  }

  // ---------- panel actions ----------
  function aiNewConversation(force) {
    if (resultEntryIds && !force) { if (aiConfirmEl) aiConfirmEl.hidden = false; return; }
    if (aiConfirmEl) aiConfirmEl.hidden = true;
    if (aiBusy) { aiSearchToken++; if (aiController) { try { aiController.abort(); } catch (err) {} } aiBusy = false; aiSnap = null; }
    var had = !!resultEntryIds;
    resultEntryIds = null;
    aiReasons = {};
    aiBasedOn = [];
    if (had) aiRecord('ask_ai_picks_cleared', { reason: 'new_conversation' });
    aiStartConversation();
    aiRenderAll(true);
    if (had) apply();
    else aiUpdateE3(aiShownCount);
    aiPersist();
    aiFocusOnOpen('new');
  }
  function aiShowOnMap(id) {
    if (!HAS_MAP || !mapFrame) return;
    var mobile = aiIsMobile();
    var delay = 0;
    if (mobile) { aiMinimise(); setView('map'); delay = 250; }
    else if (mapPane && mapPane.scrollIntoView) mapPane.scrollIntoView({ behavior: aiReduced() ? 'auto' : 'smooth', block: 'center' });
    setTimeout(function () {
      if (mapFrame && mapFrame.contentWindow) mapFrame.contentWindow.postMessage({ type: 'directory-focus-entry', entryId: id }, '*');
    }, delay);
  }
  function aiCopyAnswer(idx, btn) {
    var item = aiThread[idx];
    if (!item) return;
    var text = item.text + '\\n' + (item.ids || []).map(aiRowName).join('\\n');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          btn.setAttribute('aria-label', 'Copied');
          aiAnnounce('Copied');
          setTimeout(function () { btn.setAttribute('aria-label', 'Copy answer'); }, 1500);
        }, function () {});
      }
    } catch (err) {}
  }
  function aiFeedback(val, idx, btn) {
    var item = aiThread[idx];
    if (!item) return;
    item.fb = item.fb === val ? null : val;
    Array.prototype.forEach.call(btn.parentNode.querySelectorAll('[data-ai-fb]'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-ai-fb').split(':')[0] === item.fb ? 'true' : 'false');
    });
    if (item.fb) aiRecord('ask_ai_feedback', { value: item.fb });
    aiPersist();
  }
  function aiTrapTab(e) {
    var nodes = Array.prototype.filter.call(aiPanel.querySelectorAll('button, a[href], textarea, input'), function (n) {
      return !n.disabled && !n.hidden && n.offsetParent !== null;
    });
    if (!nodes.length) return;
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function aiInit() {
    if (!AI_SEARCH_ENABLED || !aiPanel) return;
    aiRestore();
    // A reload keeps the conversation and the panel state; it never steals focus.
    aiPanel.classList.add('dir-ai-panel--instant');
    aiRenderAll(true);
    aiUpdateChrome();
    setTimeout(function () { aiPanel.classList.remove('dir-ai-panel--instant'); }, 60);
    aiAutosize();

    document.querySelectorAll('[data-ai-open]').forEach(function (b) {
      b.addEventListener('click', function () {
        var entry = b.getAttribute('data-ai-open');
        if (entry === 'E1' && aiUi.open) { aiClose(true); return; }
        aiOpen(entry, b);
      });
    });
    if (aiPanel) {
      aiPanel.addEventListener('click', function (e) {
        var t = e.target && e.target.closest ? e.target.closest('[data-ai-act]') : null;
        if (!t) return;
        var act = t.getAttribute('data-ai-act');
        if (act === 'new') aiNewConversation(false);
        else if (act === 'confirm-yes') aiNewConversation(true);
        else if (act === 'confirm-no') { if (aiConfirmEl) aiConfirmEl.hidden = true; }
        else if (act === 'expand') aiToggleExpand();
        else if (act === 'min') aiMinimise();
        else if (act === 'close') aiClose(true);
        else if (act === 'all') aiUnscope(true);
      });
      aiPanel.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.stopPropagation(); aiClose(true); }
        else if (e.key === 'Tab' && aiIsMobile() && aiUi.open) aiTrapTab(e);
      });
    }
    if (aiLog) {
      aiLog.addEventListener('click', function (e) {
        var el = e.target && e.target.closest ? e.target.closest('button') : null;
        if (!el) return;
        if (el.hasAttribute('data-ai-chip')) aiChipClick(el);
        else if (el.hasAttribute('data-ai-map')) aiShowOnMap(el.getAttribute('data-ai-map'));
        else if (el.hasAttribute('data-ai-copy')) aiCopyAnswer(parseInt(el.getAttribute('data-ai-copy'), 10), el);
        else if (el.hasAttribute('data-ai-fb')) { var f = el.getAttribute('data-ai-fb').split(':'); aiFeedback(f[0], parseInt(f[1], 10), el); }
        else if (el.hasAttribute('data-ai-retry')) {
          if (aiThread.length && aiThread[aiThread.length - 1].t === 'e') aiThread.pop();
          aiRenderThread(true);
          aiRun();
        }
      });
    }
    if (aiChipsEl) aiChipsEl.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-ai-sugg]') : null;
      if (el) aiSuggClick(parseInt(el.getAttribute('data-ai-sugg'), 10));
    });
    if (aiForm) aiForm.addEventListener('submit', function (e) { e.preventDefault(); aiSubmit(); });
    if (aiInput) {
      aiInput.addEventListener('input', function () { aiAutosize(); aiUpdateComposer(); });
      aiInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); aiSubmit(); }
      });
    }
    if (aiPill) {
      var x = aiPill.querySelector('button');
      if (x) x.addEventListener('click', function () { aiDropPicks('clear_button', false); });
    }
    if (aiShowAll) aiShowAll.addEventListener('click', function () { aiDropPicks('clear_button', false); });
    var tick = null;
    function onMove() {
      if (tick) return;
      tick = setTimeout(function () { tick = null; aiUpdateTop(); }, 16);
    }
    window.addEventListener('scroll', onMove, { passive: true });
    window.addEventListener('resize', function () { aiUpdateChrome(); onMove(); });
    aiUpdateTop();
  }
`;
}
