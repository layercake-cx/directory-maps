import React from "react";
import { Button, Callout, Field, Pill, SegmentedControl, Section, Select } from "../ui/index.js";
import { SCHEDULE_HOUR_OPTIONS, describeSchedule } from "./schedule.js";
import "../../styles/wave-b/map-data.css";

// Provider brand marks. The hex fills are the providers' own logo colours (data, not UI colours).
function GoogleMark() {
  return (
    <svg className="md-brand" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" fill="#EA4335"/>
    </svg>
  );
}

function MicrosoftMark() {
  return (
    <svg className="md-brand" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23 23" width="24" height="24" aria-hidden="true">
      <rect width="10.5" height="10.5" fill="#F25022"/>
      <rect x="12.5" width="10.5" height="10.5" fill="#7FBA00"/>
      <rect y="12.5" width="10.5" height="10.5" fill="#00A4EF"/>
      <rect x="12.5" y="12.5" width="10.5" height="10.5" fill="#FFB900"/>
    </svg>
  );
}

function AppleMark() {
  return (
    <svg className="md-brand" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 814 1000" width="20" height="24" aria-hidden="true">
      <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-42.3-150.3-109.2c-58.6-81.5-109.5-209.2-109.5-330.4 0-168.8 111.1-258.1 220.2-258.1 81.3 0 148.6 53.4 198.4 53.4 50.2 0 128.7-56.5 219.1-56.5zm-204.7-96.1c37.5-44.4 64.2-105.9 64.2-167.5 0-8.8-.8-17.7-2.3-25.4-60.5 2.4-132.2 39.6-175.3 89.4-33.4 37.5-64.8 99.8-64.8 162.8 0 9.6 1.6 19.2 2.3 22.3 3.8.7 10 1.6 16.2 1.6 54.3 0 120.5-36.1 159.7-83.2z" fill="#555"/>
    </svg>
  );
}

function ProviderHead({ mark, name, sub, aside }) {
  return (
    <div className="md-provider-head">
      <div className="md-provider-id">
        {mark}
        <div>
          <p className="md-provider-name">{name}</p>
          <p className="md-provider-sub">{sub}</p>
        </div>
      </div>
      {aside}
    </div>
  );
}

/**
 * The provider cards on the map Data "Sync data" tab: Google Drive (live) plus OneDrive and iCloud (coming soon).
 * Presentational: the page owns the state and handlers. Shared by the client and admin map Data pages.
 *
 * @param {{
 *   sheetStatus: object|null,          // validate_sheet_source result; null while checking
 *   schedFreq: "manual"|"daily", schedTime: string,
 *   savingSchedule: boolean, syncing: boolean, connecting: boolean, configuring: boolean, openingPicker: boolean,
 *   onConnect: () => void, onSync: () => void, onChangeFile: () => void, onDisconnect: () => void,
 *   onSaveSchedule: (freq: string, time: string) => void,
 * }} props
 */
export default function DriveSyncCards({
  sheetStatus, schedFreq, schedTime, savingSchedule, syncing, connecting, configuring, openingPicker,
  onConnect, onSync, onChangeFile, onDisconnect, onSaveSchedule,
}) {
  const busy = syncing || connecting || configuring;
  return (
    <div className="md-provider-grid">
      <Section>
        <div className="md-provider-body">
          <ProviderHead
            mark={<GoogleMark />}
            name="Google Drive"
            sub="Sync from a Google Sheet"
            aside={sheetStatus?.connected ? <Pill tone="ok">Connected</Pill> : null}
          />

          {sheetStatus === null && <p className="md-meta" role="status">Checking connection…</p>}

          {sheetStatus !== null && !sheetStatus.connected && (
            <div>
              <Button variant="primary" onClick={onConnect} loading={connecting} loadingLabel="Connecting…">
                Connect Google Drive
              </Button>
            </div>
          )}

          {sheetStatus?.connected && sheetStatus?.sheet?.spreadsheet_id && (
            <>
              <div className="md-fact">
                <span className="md-fact-label">Connected file</span>
                <span className="md-fact-value">{sheetStatus.sheet.sheet_name || "File connected"}</span>
              </div>

              <fieldset className="md-fieldset" disabled={savingSchedule}>
                <SegmentedControl
                  label="Auto-sync schedule"
                  value={schedFreq}
                  onChange={(v) => onSaveSchedule(v, schedTime)}
                  options={[
                    { label: "Off", value: "manual" },
                    { label: "Daily", value: "daily" },
                  ]}
                />
                {schedFreq === "daily" && (
                  <Field label="Run at" hint="Local time" className="md-time-field">
                    <Select value={schedTime} onChange={(e) => onSaveSchedule("daily", e.target.value)} options={SCHEDULE_HOUR_OPTIONS} />
                  </Field>
                )}
              </fieldset>

              <div className="md-meta-list">
                <p className="md-meta">{describeSchedule(schedFreq, schedTime)}</p>
                {sheetStatus.last_synced_at && (
                  <p className="md-meta">
                    Last synced {new Date(sheetStatus.last_synced_at).toLocaleString("en-GB")}
                    {sheetStatus.last_sync_status === "WARNING" ? " (with warnings)" : ""}
                  </p>
                )}
                {sheetStatus.dataRowCount != null && (
                  <p className="md-meta">File: {sheetStatus.dataRowCount} rows, {sheetStatus.rowsWithName} with a name</p>
                )}
              </div>
              {sheetStatus.last_sync_error && <Callout tone="warn">{sheetStatus.last_sync_error}</Callout>}

              <div className="md-actions">
                <Button variant="primary" size="sm" onClick={onSync} disabled={busy} loading={syncing} loadingLabel="Syncing…">
                  Sync now
                </Button>
                <Button size="sm" onClick={onChangeFile} disabled={busy} loading={openingPicker} loadingLabel="Opening…">
                  Change file
                </Button>
                <Button variant="danger" size="sm" onClick={onDisconnect} disabled={busy} loading={connecting} loadingLabel="Disconnecting…">
                  Disconnect
                </Button>
              </div>
            </>
          )}

          {sheetStatus?.connected && !sheetStatus?.sheet?.spreadsheet_id && (
            <div>
              <Button onClick={onChangeFile} disabled={connecting || configuring} loading={openingPicker} loadingLabel="Opening…">
                Choose a file from Google Drive
              </Button>
            </div>
          )}
        </div>
      </Section>

      <Section className="md-provider--soon">
        <div className="md-provider-body">
          <ProviderHead mark={<MicrosoftMark />} name="OneDrive" sub="Microsoft 365 / Excel" />
          <div><Pill tone="neutral" dashed>Coming soon</Pill></div>
        </div>
      </Section>

      <Section className="md-provider--soon">
        <div className="md-provider-body">
          <ProviderHead mark={<AppleMark />} name="iCloud Drive" sub="Apple Numbers" />
          <div><Pill tone="neutral" dashed>Coming soon</Pill></div>
        </div>
      </Section>
    </div>
  );
}
