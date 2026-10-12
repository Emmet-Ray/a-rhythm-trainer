import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RecordActivity } from "./practiceRecordStorage";

/** 统计由记录接口提供，图表与列表同批更新，不从当前分页反推频次。 */
export function PracticeActivityChart({ activity }: { activity: RecordActivity }) {
  const monthly = activity.unit === "month";
  const dateLabel = (date: string) => monthly ? date.slice(0, 7) : date;
  return <section className="record-activity" aria-label="练习次数趋势">
    <div className="record-activity-heading">
      <h2>{monthly ? "每月练习次数" : "练习次数趋势"}</h2>
    </div>
    <div className="record-activity-chart">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={activity.points} accessibilityLayer aria-label={`练习次数趋势，共 ${activity.points.reduce((sum, point) => sum + point.count, 0)} 次`} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--ds-line)" strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={date => monthly ? String(date).slice(0, 7) : String(date).slice(5).replace('-', '/')}
            minTickGap={28} tickLine={false} axisLine={false} tick={{ fill: "var(--ds-muted)", fontSize: 12 }} />
          <YAxis allowDecimals={false} width={32} tickLine={false} axisLine={false} domain={[0, 'auto']}
            tick={{ fill: "var(--ds-muted)", fontSize: 12 }} />
          <Tooltip isAnimationActive={false} cursor={{ fill: "var(--ds-tint)" }}
            labelFormatter={label => dateLabel(String(label))} formatter={value => [`${value} 次`, '练习次数']}
            labelStyle={{ color: "var(--ds-muted)", fontSize: 12, marginBottom: 4 }}
            itemStyle={{ color: "var(--ds-ink)", fontSize: 14 }}
            contentStyle={{ background: "var(--ds-surface)", border: "1px solid var(--ds-line)", borderRadius: 8, color: "var(--ds-ink)" }} />
          <Bar dataKey="count" name="练习次数" fill="var(--ds-primary)" maxBarSize={36} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </section>;
}
