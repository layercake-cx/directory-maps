import React from "react";
import { DAY_OPTIONS } from "../../lib/engagementAnalytics";
import styles from "./EngagementShared.module.css";
import { Section, StatGrid, StatTile, EmptyState, Skeleton, DataTable as KitDataTable } from "../ui/index.js";

export function MetricCards({ items }) {
  return (
    <StatGrid>
      {items.map((item) => (
        <StatTile key={item.label} label={item.label} value={item.value} />
      ))}
    </StatGrid>
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
    <Section title={title} description={subtitle} className={className}>
      {children}
    </Section>
  );
}

export function EmptyChart({ message = "No engagement data for this period." }) {
  return <EmptyState art="none" title={message} />;
}

export function LoadingState() {
  return <Skeleton variant="tiles" rows={4} label="Loading engagement data" />;
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
  const withIds = rows.map((r, i) => ({ ...r, __rid: r.id ?? i }));
  return <KitDataTable columns={columns} rows={withIds} getRowId={(r) => r.__rid} />;
}
