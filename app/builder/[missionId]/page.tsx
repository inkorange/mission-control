"use client";

import { use } from "react";
import { getMissionById } from "@/engine/data/missions";

export default function BuilderPage({
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
    <div className="h-[calc(100vh-53px)] flex flex-col">
      {/* Mission header */}
      <div className="border-b border-[var(--border)] px-6 py-3 flex items-center justify-between bg-[var(--surface)]">
        <div>
          <span className="text-xs text-[var(--muted)] uppercase tracking-wider">
            {mission.codename}
          </span>
          <h2 className="text-lg font-semibold">{mission.name}</h2>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <span className="text-[var(--muted)]">
            Budget:{" "}
            <span className="text-foreground font-mono">
              ${(mission.budget / 1_000_000).toFixed(0)}M
            </span>
          </span>
          <a
            href="/"
            className="text-[var(--muted)] hover:text-foreground transition-colors"
          >
            ← Back
          </a>
        </div>
      </div>

      {/* Builder workspace — placeholder for Phase 2 */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-2xl font-bold mb-2">Rocket Builder</p>
          <p className="text-[var(--muted)] mb-4">
            Drag-and-drop assembly coming in Phase 2
          </p>
          <p className="text-sm text-[var(--muted)]">
            {mission.description}
          </p>
          <div className="mt-6">
            <a
              href={`/launch/${missionId}`}
              className="inline-block px-6 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg font-medium transition-colors"
            >
              Launch →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
