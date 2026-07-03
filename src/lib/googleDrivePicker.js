import { invokeFunction } from "./supabase";

const PICKER_MIME_TYPES = [
  "application/vnd.google-apps.spreadsheet",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

let gapiScriptPromise = null;
let pickerLibraryPromise = null;

function loadGapiScript() {
  if (window.gapi) return Promise.resolve();
  if (!gapiScriptPromise) {
    gapiScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://apis.google.com/js/api.js";
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Failed to load Google API script"));
      document.head.appendChild(script);
    });
  }
  return gapiScriptPromise;
}

function waitForPickerNamespace(timeoutMs = 5000, intervalMs = 100) {
  if (window.google?.picker) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const poll = () => {
      if (window.google?.picker) return resolve();
      if (Date.now() - start >= timeoutMs) return reject(new Error("Google Picker library failed to initialize"));
      setTimeout(poll, intervalMs);
    };
    poll();
  });
}

function loadPickerLibrary() {
  if (window.google?.picker) return Promise.resolve();
  if (!pickerLibraryPromise) {
    pickerLibraryPromise = loadGapiScript()
      .then(
        () =>
          new Promise((resolve, reject) => {
            // gapi's own callback firing doesn't reliably mean window.google.picker is
            // actually attached yet — real-world load can take well over a second, so
            // poll for it with a real timeout instead of guessing a short fixed delay.
            window.gapi.load("picker", {
              callback: () => waitForPickerNamespace().then(resolve, reject),
              onerror: () => reject(new Error("Failed to load Google Picker")),
            });
          })
      )
      .catch((err) => {
        pickerLibraryPromise = null; // don't cache a failed load — let the next call retry from scratch
        throw err;
      });
  }
  return pickerLibraryPromise;
}

/**
 * Best-effort background warm-up: call this as soon as a page that might open
 * the Picker mounts, so the (sometimes slow) library load has real wall-clock
 * time to finish before the user actually clicks the button. Never throws —
 * failures here just mean the click-time load falls back to loading fresh.
 */
export function preloadGoogleDrivePicker() {
  loadPickerLibrary().catch(() => {});
}

/**
 * Opens Google's Picker widget so the user can choose a Sheet/CSV/Excel file
 * from their Drive. Uses a short-lived access token minted server-side by the
 * google_get_access_token Edge Function — the stored refresh_token never
 * reaches the browser. Requires VITE_GOOGLE_API_KEY (Picker API enabled,
 * domain-restricted in Google Cloud Console).
 */
export async function openGoogleDrivePicker({ mapId, onPicked }) {
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
  if (!apiKey) throw new Error("Missing VITE_GOOGLE_API_KEY — required for Google Picker.");

  await loadPickerLibrary();

  const { data, error } = await invokeFunction("google_get_access_token", { body: { mapId } });
  if (data?.error) throw new Error(data.error);
  if (error) {
    const body = await error.context?.json?.().catch(() => null);
    throw new Error(body?.error ?? body?.message ?? error.message);
  }
  const accessToken = data?.accessToken;
  if (!accessToken) throw new Error("Missing access token");

  const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
    .setMimeTypes(PICKER_MIME_TYPES)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(false);

  const builder = new window.google.picker.PickerBuilder()
    .setOAuthToken(accessToken)
    .setDeveloperKey(apiKey)
    .addView(view);
  // setAppId is required under the drive.file scope for a picked file to actually
  // receive a persistent access grant — without it, selection appears to succeed but
  // later Drive API reads 404 as if the app has no access to the file.
  if (data?.appId) builder.setAppId(data.appId);

  const picker = builder
    .setCallback((pickerData) => {
      if (pickerData.action === window.google.picker.Action.PICKED) {
        const doc = pickerData.docs?.[0];
        if (doc) onPicked(doc.id, doc.mimeType, doc.name);
      }
    })
    .build();
  // Same cold-start settling issue as the library load above — defer showing the
  // widget by a tick rather than calling setVisible() in the same synchronous pass
  // as build().
  requestAnimationFrame(() => picker.setVisible(true));
}
