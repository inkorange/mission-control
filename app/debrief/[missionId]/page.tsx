"use client";

import { use } from "react";
import { getMissionById } from "@/engine/data/missions";

export default function DebriefPage({
  params,
}: {
  params: Promise<{ missionId: string }>;
}) {
  const { missionId } = use(params);
  const mission = getMissionById(missionId);

  if (!mission) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="panel p-6">
          <span className="status-dot status-dot--danger mr-2" />
          <span className="font-mono text-sm text-[var(--nasa-red)]">
            Mission not found: {missionId}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-[var(--nasa-red)]">
            Mission Debrief
          </span>
          <div className="flex-1 h-px bg-[var(--border)]" />
          <span className="font-mono text-[0.55rem] tracking-[0.2em] uppercase text-[var(--nasa-blue-light)]">
            {mission.codename}
          </span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight">{mission.name}</h2>
      </div>

      {/* Scoring panel — placeholder for Phase 5 */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {["Efficiency", "Budget", "Accuracy"].map((category) => (
          <div key={category} className="panel">
            <div className="panel-header">{category}</div>
            <div className="p-4 text-center">
              <span className="font-mono text-2xl text-[var(--data)]">--</span>
              <div className="mt-1">
                <span className="font-mono text-[0.55rem] tracking-wider uppercase text-[var(--muted)]">
                  Awaiting data
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Mission result panel */}
      <div className="panel mb-6">
        <div className="panel-header">Mission Analysis</div>
        <div className="p-6 text-center">
          <div className="flex justify-center gap-1 mb-3">
            {[1, 2, 3].map((star) => (
              <span key={star} className="text-2xl star-empty">
                ★
              </span>
            ))}
          </div>
          <p className="font-mono text-xs tracking-wider uppercase text-[var(--muted)] mb-2">
            Phase 5
          </p>
          <p className="text-sm text-[var(--muted)] max-w-md mx-auto">
            Post-mission analysis with trajectory comparison, scoring breakdown,
            and physics explanations tailored to your flight data.
          </p>
        </div>
      </div>

      {/* Educational topics preview */}
      <div className="panel mb-6">
        <div className="panel-header">Educational Topics</div>
        <div className="p-4">
          <div className="flex flex-wrap gap-2">
            {mission.educationalTopics.map((topic) => (
              <span
                key={topic}
                className="font-mono text-[0.6rem] tracking-wider uppercase px-2.5 py-1 bg-[var(--nasa-panel-hover)] border border-[var(--border)] rounded-sm text-[var(--muted)]"
              >
                {topic.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-center gap-3">
        <a
          href={`/builder/${missionId}`}
          className="font-mono text-[0.65rem] tracking-[0.1em] uppercase px-5 py-2.5 border border-[var(--border)] hover:border-[var(--nasa-red)]/40 hover:bg-[var(--surface)] rounded-sm transition-colors"
        >
          Retry Mission
        </a>
        <a
          href="/"
          className="font-mono text-[0.65rem] tracking-[0.1em] uppercase px-5 py-2.5 bg-[var(--nasa-red)] hover:bg-[var(--nasa-red-dark)] text-white rounded-sm transition-colors"
        >
          Mission Select
        </a>
      </div>
    </div>
  );
}
