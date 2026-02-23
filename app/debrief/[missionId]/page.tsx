"use client";

import { use } from "react";
import Link from "next/link";
import { getMissionById, MISSIONS } from "@/engine/data/missions";
import { useFlightStore } from "@/stores/useFlightStore";
import { useProgressionStore } from "@/stores/useProgressionStore";
import { useBuilderStore } from "@/stores/useBuilderStore";
import { scoreFlightResult } from "@/engine/simulation/Scoring";
import {
  formatDistance,
  formatCost,
  formatMissionTime,
  formatDeltaV,
} from "@/lib/formatters";
import { analyzeFlightData } from "@/engine/analysis/FlightAnalyzer";
import TrajectoryReplay from "@/components/debrief/TrajectoryReplay";
import FlightCharts from "@/components/debrief/FlightCharts";
import FlightInsights from "@/components/debrief/FlightInsights";
import PhysicsExplainer from "@/components/debrief/PhysicsExplainer";
import type { FlightResult } from "@/types/physics";
import type { ScoreBreakdown } from "@/types/scoring";

export default function DebriefPage({
  params,
}: {
  params: Promise<{ missionId: string }>;
}) {
  const { missionId } = use(params);
  const mission = getMissionById(missionId);

  // Data sources (in priority order)
  const flightResult = useFlightStore((s) => s.result);
  const progressionResult = useProgressionStore(
    (s) => s.missionResults[missionId]
  );
  const rocketCost = useBuilderStore((s) => s.getTotalCost());

  // Use live flight result if available, otherwise fall back to persisted
  const flight: FlightResult | null =
    flightResult ?? progressionResult?.flightResult ?? null;

  if (!mission) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="panel p-6">
          <span className="status-dot status-dot--danger mr-2" />
          <span className="font-mono text-base text-[var(--nasa-red)]">
            Mission not found: {missionId}
          </span>
        </div>
      </div>
    );
  }

  if (!flight) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="panel p-8 text-center">
          <span className="status-dot status-dot--warning mr-2" />
          <span className="font-mono text-base text-[var(--nasa-gold)] block mb-4">
            No flight data available
          </span>
          <p className="text-sm text-[var(--muted)] mb-6">
            Complete a flight to see your debrief.
          </p>
          <Link
            href={`/builder/${missionId}`}
            className="font-mono text-[0.8rem] tracking-[0.1em] uppercase px-8 py-3 bg-[var(--nasa-red)] hover:bg-[var(--nasa-red-dark)] text-white rounded-sm transition-colors inline-block"
          >
            Go to Assembly
          </Link>
        </div>
      </div>
    );
  }

  const isSuccess =
    flight.outcome === "mission_complete" || flight.outcome === "orbit_achieved";

  const cost = progressionResult?.bestRocketConfig?.totalCost ?? rocketCost;
  const score = scoreFlightResult(flight, mission, cost);
  const stars = isSuccess ? score.stars : 0;
  const analysis = analyzeFlightData(flight, mission, score);

  // Determine bonus challenge results
  const bonusResults = mission.bonusChallenges.map((bonus) => {
    if (!isSuccess) return { bonus, completed: false };
    let completed = false;
    try {
      completed = bonus.condition(flight);
    } catch {
      completed = false;
    }
    // Cost-based bonuses
    if (!completed && /under\s+\$[\d,]+[MBK]?/i.test(bonus.description)) {
      const match = bonus.description.match(/\$([\d,]+)\s*([MBK]?)/i);
      if (match) {
        const value = parseFloat(match[1].replace(/,/g, ""));
        const suffix = match[2].toUpperCase();
        const threshold =
          suffix === "B" ? value * 1e9 : suffix === "M" ? value * 1e6 : suffix === "K" ? value * 1e3 : value;
        completed = cost < threshold;
      }
    }
    return { bonus, completed };
  });

  // Find next mission
  const missionIndex = MISSIONS.findIndex((m) => m.id === missionId);
  const nextMission = missionIndex >= 0 && missionIndex < MISSIONS.length - 1
    ? MISSIONS[missionIndex + 1]
    : null;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <span className="font-mono text-[0.75rem] tracking-[0.2em] uppercase text-[var(--nasa-red)]">
            Mission Debrief
          </span>
          <div className="flex-1 h-px bg-[var(--border)]" />
          <span className="font-mono text-[0.7rem] tracking-[0.2em] uppercase text-[var(--nasa-blue-light)]">
            {mission.codename}
          </span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight">{mission.name}</h2>
      </div>

      {/* Outcome banner */}
      <div className="panel mb-6">
        <div className="p-6 text-center">
          {/* Stars */}
          <div className="flex justify-center gap-1.5 mb-3">
            {[1, 2, 3].map((s) => (
              <span
                key={s}
                className={`text-3xl ${s <= stars ? "star-filled" : "star-empty"}`}
              >
                ★
              </span>
            ))}
          </div>

          {/* Outcome label */}
          <span
            className={`font-mono text-lg tracking-[0.15em] uppercase font-bold ${
              isSuccess ? "text-[var(--nasa-green)]" : "text-[var(--nasa-red)]"
            }`}
          >
            {outcomeLabel(flight.outcome)}
          </span>

          {isSuccess && (
            <p className="font-mono text-sm text-[var(--muted)] mt-1">
              Score: {score.totalScore}/100
            </p>
          )}
        </div>
      </div>

      {/* Scoring breakdown */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <ScoreCard
          label="Efficiency"
          score={score.efficiency.score}
          details={[
            { label: "Dv Used", value: formatDeltaV(score.efficiency.deltaVUsed) },
            { label: "Dv Optimal", value: formatDeltaV(score.efficiency.deltaVOptimal) },
          ]}
        />
        <ScoreCard
          label="Budget"
          score={score.budget.score}
          details={[
            { label: "Spent", value: formatCost(score.budget.costSpent) },
            { label: "Budget", value: formatCost(score.budget.budgetMax) },
          ]}
        />
        <ScoreCard
          label="Accuracy"
          score={score.accuracy.score}
          details={[
            {
              label: "Deviation",
              value: isFinite(score.accuracy.orbitalDeviation)
                ? formatDistance(score.accuracy.orbitalDeviation)
                : "N/A",
            },
          ]}
        />
      </div>

      {/* Flight summary */}
      <div className="panel mb-6">
        <div className="panel-header">Flight Summary</div>
        <div className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryItem label="Max Altitude" value={formatDistance(flight.maxAltitude)} />
            <SummaryItem label="Duration" value={formatMissionTime(flight.flightDuration)} />
            <SummaryItem label="Delta-v Used" value={formatDeltaV(flight.totalDeltaVUsed)} />
            <SummaryItem label="Vehicle Cost" value={formatCost(cost)} />
            {flight.finalOrbit && (
              <>
                <SummaryItem label="Apoapsis" value={formatDistance(flight.finalOrbit.apoapsis)} />
                <SummaryItem label="Periapsis" value={formatDistance(flight.finalOrbit.periapsis)} />
                <SummaryItem label="Eccentricity" value={flight.finalOrbit.eccentricity.toFixed(4)} />
                <SummaryItem
                  label="Period"
                  value={
                    flight.finalOrbit.period > 0
                      ? `${(flight.finalOrbit.period / 60).toFixed(1)} min`
                      : "—"
                  }
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Trajectory replay */}
      {flight.history.length > 1 && (
        <div className="panel mb-6">
          <div className="panel-header">Trajectory</div>
          <div className="p-4 flex justify-center">
            <div className="w-full max-w-[560px]">
              <TrajectoryReplay
                history={flight.history}
                targetOrbit={mission.requirements.targetOrbit}
                finalOrbit={flight.finalOrbit}
                outcome={flight.outcome}
                keyEvents={analysis.keyEvents}
              />
            </div>
          </div>
        </div>
      )}

      {/* Flight charts */}
      {flight.history.length > 1 && (
        <FlightCharts history={flight.history} keyEvents={analysis.keyEvents} />
      )}

      {/* Flight insights */}
      {analysis.insights.length > 0 && (
        <FlightInsights
          insights={analysis.insights}
          gravityLoss={analysis.gravityLossEstimate}
          dragLoss={analysis.dragLossEstimate}
        />
      )}

      {/* Bonus challenges */}
      {mission.bonusChallenges.length > 0 && (
        <div className="panel mb-6">
          <div className="panel-header">Bonus Challenges</div>
          <div className="p-4 space-y-2">
            {bonusResults.map(({ bonus, completed }) => (
              <div
                key={bonus.id}
                className="flex items-center gap-3 py-1"
              >
                <span
                  className={`text-lg ${
                    completed ? "star-filled" : "star-empty"
                  }`}
                >
                  ★
                </span>
                <span
                  className={`font-mono text-sm ${
                    completed
                      ? "text-[var(--nasa-green)]"
                      : "text-[var(--muted)]"
                  }`}
                >
                  {bonus.description}
                </span>
                <span
                  className={`font-mono text-[0.7rem] ml-auto ${
                    completed
                      ? "text-[var(--nasa-green)]"
                      : "text-[var(--muted)]"
                  }`}
                >
                  {completed ? "Completed" : "Incomplete"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Educational topics */}
      <PhysicsExplainer
        topicIds={mission.educationalTopics}
        flight={flight}
        mission={mission}
        score={score}
      />

      {/* Actions */}
      <div className="flex justify-center gap-3">
        <Link
          href={`/builder/${missionId}`}
          className="font-mono text-[0.8rem] tracking-[0.1em] uppercase px-5 py-2.5 border border-[var(--border)] hover:border-[var(--nasa-red)]/40 hover:bg-[var(--surface)] rounded-sm transition-colors"
        >
          Retry Mission
        </Link>
        {nextMission && (
          <Link
            href={`/builder/${nextMission.id}`}
            className="font-mono text-[0.8rem] tracking-[0.1em] uppercase px-5 py-2.5 bg-[var(--nasa-blue)] hover:bg-[var(--nasa-blue)]/80 text-white rounded-sm transition-colors"
          >
            Next Mission
          </Link>
        )}
        <Link
          href="/"
          className="font-mono text-[0.8rem] tracking-[0.1em] uppercase px-5 py-2.5 bg-[var(--nasa-red)] hover:bg-[var(--nasa-red-dark)] text-white rounded-sm transition-colors"
        >
          Mission Select
        </Link>
      </div>
    </div>
  );
}

function outcomeLabel(outcome: string): string {
  switch (outcome) {
    case "mission_complete": return "Mission Complete";
    case "orbit_achieved": return "Orbit Achieved";
    case "crash": return "Vehicle Lost";
    case "aborted": return "Mission Aborted";
    case "suborbital": return "Suborbital Only";
    case "fuel_exhausted": return "Fuel Exhausted";
    default: return outcome;
  }
}

function ScoreCard({
  label,
  score,
  details,
}: {
  label: string;
  score: number;
  details: { label: string; value: string }[];
}) {
  const color =
    score >= 80
      ? "var(--nasa-green)"
      : score >= 50
        ? "var(--nasa-gold)"
        : "var(--nasa-red)";

  return (
    <div className="panel">
      <div className="panel-header">{label}</div>
      <div className="p-4 text-center">
        <span className="font-mono text-2xl" style={{ color }}>
          {score}
        </span>
        <span className="font-mono text-sm text-[var(--muted)]">/100</span>
        <div className="mt-2 space-y-0.5">
          {details.map((d) => (
            <div key={d.label} className="flex justify-between text-[0.65rem] font-mono">
              <span className="text-[var(--muted)] tracking-wider uppercase">{d.label}</span>
              <span className="text-[var(--data)]">{d.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 rounded-sm border border-[var(--border)] bg-black/20">
      <span className="font-mono text-[0.5rem] tracking-[0.15em] uppercase text-[var(--muted)] block">
        {label}
      </span>
      <span className="font-mono text-sm text-[var(--data)] block leading-none mt-0.5">
        {value}
      </span>
    </div>
  );
}
