"use client";

import type { FlightInsight } from "@/engine/analysis/FlightAnalyzer";
import { formatDeltaV } from "@/lib/formatters";

interface FlightInsightsProps {
  insights: FlightInsight[];
  gravityLoss: number;
  dragLoss: number;
}

export default function FlightInsights({
  insights,
  gravityLoss,
  dragLoss,
}: FlightInsightsProps) {
  return (
    <div className="panel mb-6">
      <div className="panel-header">Flight Analysis</div>
      <div className="p-4 space-y-3">
        {/* Loss breakdown */}
        <div className="flex gap-3 mb-1">
          <div className="p-2 rounded-sm border border-[var(--border)] bg-black/20 flex-1">
            <span className="font-mono text-[0.5rem] tracking-[0.15em] uppercase text-[var(--muted)] block">
              Gravity Losses
            </span>
            <span className="font-mono text-sm text-[var(--nasa-gold)] block leading-none mt-0.5">
              ~{formatDeltaV(gravityLoss)}
            </span>
          </div>
          <div className="p-2 rounded-sm border border-[var(--border)] bg-black/20 flex-1">
            <span className="font-mono text-[0.5rem] tracking-[0.15em] uppercase text-[var(--muted)] block">
              Drag Losses
            </span>
            <span className="font-mono text-sm text-[var(--nasa-gold)] block leading-none mt-0.5">
              ~{formatDeltaV(dragLoss)}
            </span>
          </div>
        </div>

        {/* Insight cards */}
        {insights.map((insight, i) => (
          <InsightCard key={i} insight={insight} />
        ))}
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: FlightInsight }) {
  const borderColor =
    insight.type === "positive"
      ? "var(--nasa-green)"
      : insight.type === "warning"
        ? "var(--nasa-gold)"
        : "var(--data)";

  return (
    <div
      className="p-3 rounded-sm bg-black/20 border-l-2"
      style={{ borderLeftColor: borderColor }}
    >
      <span
        className="font-mono text-[0.7rem] tracking-wider uppercase block"
        style={{ color: borderColor }}
      >
        {insight.title}
      </span>
      <p className="font-mono text-[0.65rem] text-[var(--muted)] mt-1 leading-relaxed">
        {insight.detail}
      </p>
    </div>
  );
}
