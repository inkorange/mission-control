"use client";

import { useBuilderStore } from "@/stores/useBuilderStore";
import { formatMass, formatDeltaV, formatCost } from "@/lib/formatters";

interface StatsPanelProps {
  budget: number;
}

export default function StatsPanel({ budget }: StatsPanelProps) {
  const { stages, getTotalMass, getTotalDeltaV, getTWR, getTotalCost } =
    useBuilderStore();

  const totalMass = getTotalMass();
  const totalDv = getTotalDeltaV();
  const twr = getTWR();
  const totalCost = getTotalCost();

  const overBudget = totalCost > budget;
  const budgetPercent = budget > 0 ? Math.min(100, (totalCost / budget) * 100) : 0;
  const twrOk = twr >= 1.0;
  const hasStages = stages.length > 0;

  // Delta-v reference thresholds (approximate)
  const dvThresholds = [
    { label: "100km", value: 2000 },
    { label: "LEO", value: 9400 },
    { label: "GEO", value: 13400 },
    { label: "Moon", value: 15500 },
  ];

  return (
    <div className="panel flex flex-col h-full">
      <div className="panel-header">Vehicle Stats</div>

      <div className="p-3 space-y-3 flex-1">
        {/* Primary readouts */}
        <div className="grid grid-cols-2 gap-2">
          {/* Delta-v */}
          <div className="p-2 rounded-sm border border-[var(--border)] bg-black/20">
            <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-[var(--muted)] block mb-0.5">
              Total Delta-V
            </span>
            <span className="font-mono text-lg text-[var(--data)] block leading-none">
              {hasStages ? formatDeltaV(totalDv) : "—"}
            </span>
          </div>

          {/* TWR */}
          <div className="p-2 rounded-sm border border-[var(--border)] bg-black/20">
            <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-[var(--muted)] block mb-0.5">
              TWR (Launch)
            </span>
            <span
              className={`font-mono text-lg block leading-none ${
                !hasStages
                  ? "text-[var(--muted)]"
                  : twrOk
                    ? "text-[var(--nasa-green)]"
                    : "text-[var(--nasa-red)]"
              }`}
            >
              {hasStages ? twr.toFixed(2) : "—"}
            </span>
            {hasStages && !twrOk && (
              <span className="font-mono text-[0.55rem] text-[var(--nasa-red)] block mt-0.5">
                Must be &gt; 1.0
              </span>
            )}
          </div>

          {/* Mass */}
          <div className="p-2 rounded-sm border border-[var(--border)] bg-black/20">
            <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-[var(--muted)] block mb-0.5">
              Total Mass
            </span>
            <span className="font-mono text-base text-[var(--foreground)] block leading-none">
              {hasStages ? formatMass(totalMass) : "—"}
            </span>
          </div>

          {/* Stages */}
          <div className="p-2 rounded-sm border border-[var(--border)] bg-black/20">
            <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-[var(--muted)] block mb-0.5">
              Stages
            </span>
            <span className="font-mono text-base text-[var(--foreground)] block leading-none">
              {stages.length}
            </span>
          </div>
        </div>

        {/* Budget bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-[var(--muted)]">
              Budget
            </span>
            <span
              className={`font-mono text-[0.7rem] ${
                overBudget ? "text-[var(--nasa-red)]" : "text-[var(--data)]"
              }`}
            >
              {formatCost(totalCost)} / {formatCost(budget)}
            </span>
          </div>
          <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                overBudget ? "bg-[var(--nasa-red)]" : "bg-[var(--nasa-green)]"
              }`}
              style={{ width: `${Math.min(100, budgetPercent)}%` }}
            />
          </div>
          {overBudget && (
            <span className="font-mono text-[0.55rem] text-[var(--nasa-red)] block mt-0.5">
              Over budget by {formatCost(totalCost - budget)}
            </span>
          )}
        </div>

        {/* Delta-v reference bar */}
        <div>
          <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-[var(--muted)] block mb-1.5">
            Delta-V Reference
          </span>
          <div className="relative h-3 bg-[var(--border)] rounded-full overflow-hidden">
            {/* Current delta-v fill */}
            <div
              className="absolute inset-y-0 left-0 bg-[var(--data)]/30 rounded-full transition-all"
              style={{
                width: `${Math.min(100, (totalDv / 16000) * 100)}%`,
              }}
            />
          </div>
          {/* Threshold markers */}
          <div className="relative h-4 mt-0.5">
            {dvThresholds.map((t) => (
              <div
                key={t.label}
                className="absolute flex flex-col items-center"
                style={{
                  left: `${Math.min(98, (t.value / 16000) * 100)}%`,
                  transform: "translateX(-50%)",
                }}
              >
                <div className="w-px h-1.5 bg-[var(--muted)]" />
                <span className="font-mono text-[0.5rem] text-[var(--muted)] whitespace-nowrap">
                  {t.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Per-stage delta-v breakdown */}
        {stages.length > 0 && (
          <div>
            <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-[var(--muted)] block mb-1">
              Stage Breakdown
            </span>
            <div className="space-y-1">
              {stages.map((_, i) => {
                const sdv = useBuilderStore.getState().getStageDeltaV(i);
                const pct = totalDv > 0 ? (sdv / totalDv) * 100 : 0;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="font-mono text-[0.625rem] text-[var(--muted)] w-7">
                      S{stages.length - i}
                    </span>
                    <div className="flex-1 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[var(--data)] rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-[0.625rem] text-[var(--data)] w-14 text-right">
                      {formatDeltaV(sdv)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
