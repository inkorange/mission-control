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
        <p className="text-[var(--danger)]">Mission not found: {missionId}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="mb-8">
        <span className="text-xs text-[var(--muted)] uppercase tracking-wider">
          Mission Debrief
        </span>
        <h2 className="text-3xl font-bold">{mission.name}</h2>
      </div>

      {/* Debrief content — placeholder for Phase 5 */}
      <div className="border border-[var(--border)] rounded-lg p-8 text-center">
        <p className="text-xl font-semibold mb-2">Scoring & Education</p>
        <p className="text-[var(--muted)] mb-6">
          Post-mission analysis, scoring breakdown, and physics explainers
          coming in Phase 5
        </p>
        <div className="flex justify-center gap-4">
          <a
            href={`/builder/${missionId}`}
            className="px-5 py-2 border border-[var(--border)] rounded-lg text-sm hover:bg-[var(--surface)] transition-colors"
          >
            Retry Mission
          </a>
          <a
            href="/"
            className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg text-sm transition-colors"
          >
            Mission Select
          </a>
        </div>
      </div>
    </div>
  );
}
