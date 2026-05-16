import React from "react";
import {
  Bar,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS } from "../../lib/engagementAnalytics";
import { EmptyChart } from "./EngagementShared.jsx";
import styles from "./EngagementShared.module.css";

export function DailyEventsChart({ data }) {
  if (!data?.length || data.every((d) => d.events === 0 && d.sessions === 0)) {
    return <EmptyChart />;
  }
  return (
    <div className={styles.chartWrap}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Bar yAxisId="left" dataKey="events" name="Events" fill="#378ADD" radius={[4, 4, 0, 0]} />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="sessions"
            name="Sessions"
            stroke="#1D9E75"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({ data, emptyMessage }) {
  if (!data?.length) return <EmptyChart message={emptyMessage} />;
  return (
    <div className={styles.chartWrap}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
            {data.map((entry, i) => (
              <Cell key={entry.type ?? entry.source ?? entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ListingTrendChart({ data }) {
  if (
    !data?.length ||
    data.every((d) => d.panelOpens === 0 && d.websiteClicks === 0 && d.emailClicks === 0 && d.messagesSent === 0)
  ) {
    return <EmptyChart />;
  }
  return (
    <div className={styles.chartWrap}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="panelOpens" name="Panel opens" stroke="#378ADD" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="websiteClicks" name="Website clicks" stroke="#1D9E75" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="emailClicks" name="Email clicks" stroke="#D85A30" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="messagesSent" name="Messages sent" stroke="#7F77DD" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
