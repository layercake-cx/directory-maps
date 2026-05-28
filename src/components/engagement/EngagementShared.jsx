import React from "react";
import { DAY_OPTIONS } from "../../lib/engagementAnalytics";
import styles from "./EngagementShared.module.css";

export function MetricCards({ items }) {
  return (
    <div className={styles.metricGrid}>
      {items.map((item) => (
        <div key={item.label} className={styles.metricCard}>
          <p className={styles.metricLabel}>{item.label}</p>
          <p className={styles.metricValue}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export function DateRangeSelect({ days, onChange }) {
  return (
    <label className={styles.dateRange}>
      <span className={styles.dateRangeLabel}>Period</span>
      <select className={styles.dateRangeSelect} value={days} onChange={(e) => onChange(Number(e.target.value))}>
        {DAY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Panel({ title, subtitle, children, className = "" }) {
  return (
    <section className={`${styles.panel} ${className}`.trim()}>
      <header className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>{title}</h2>
        {subtitle ? <p className={styles.panelSubtitle}>{subtitle}</p> : null}
      </header>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

export function EmptyChart({ message = "No engagement data for this period." }) {
  return <p className={styles.emptyChart}>{message}</p>;
}

export function LoadingState() {
  return (
    <div className={styles.loadingWrap} aria-busy="true">
      <div className={styles.spinner} />
      <p>Loading engagement data…</p>
    </div>
  );
}

export function FunnelChart({ steps, maxCount }) {
  const max = maxCount || Math.max(...steps.map((s) => s.count), 1);
  return (
    <div className={styles.funnel}>
      {steps.map((step) => (
        <div key={step.key} className={styles.funnelRow}>
          <div className={styles.funnelLabelWrap}>
            <span className={styles.funnelLabel}>{step.label}</span>
            <span className={styles.funnelCount}>{step.count.toLocaleString()}</span>
          </div>
          <div className={styles.funnelBarTrack}>
            <div
              className={styles.funnelBarFill}
              style={{ width: `${Math.max(4, (step.count / max) * 100)}%` }}
            />
          </div>
          {step.rate != null ? <span className={styles.funnelRate}>{step.rate}%</span> : <span className={styles.funnelRate} />}
        </div>
      ))}
    </div>
  );
}

export function DataTable({ columns, rows, emptyMessage = "No data." }) {
  if (!rows.length) return <EmptyChart message={emptyMessage} />;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.className}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? i}>
              {columns.map((col) => (
                <td key={col.key} className={col.className}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
