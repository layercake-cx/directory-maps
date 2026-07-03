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

function loadPickerLibrary() {
  if (window.google?.picker) return Promise.resolve();
  if (!pickerLibraryPromise) {
    pickerLibraryPromise = loadGapiScript()
      .then(
        () =>
          new Promise((resolve, reject) => {
            window.gapi.load("picker", {
              callback: () => {
                // gapi's callback has fired, but google.picker isn't always attached
                // to window the instant it does — a build()/setVisible() call made
                // right on its heels intermittently surfaces as "The API developer
                // key is invalid" even though the key is fine. Give it a tick.
                setTimeout(() => (window.google?.picker ? resolve() : reject(new Error("Google Picker library failed to initialize"))), 50);
              },
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
