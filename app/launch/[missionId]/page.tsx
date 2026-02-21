"use client";

import { use } from "react";
import { getMissionById } from "@/engine/data/missions";

export default function LaunchPage({
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
      {/* Flight HUD header */}
      <div className="border-b border-[var(--border)] px-6 py-3 flex items-center justify-between bg-[var(--surface)]">
        <div className="flex items-center gap-4">
          <span className="text-xs text-[var(--muted)] uppercase tracking-wider">
            {mission.codename}
          </span>
          <span className="font-mono text-sm">T+ 00:00:00</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-[var(--muted)]">Time Warp: 1x</span>
        </div>
      </div>

      {/* Flight scene — placeholder for Phase 3 */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-2xl font-bold mb-2">Launch Simulation</p>
          <p className="text-[var(--muted)] mb-4">
            3D flight visualization coming in Phase 3
          </p>
          <div className="mt-6">
            <a
              href={`/debrief/${missionId}`}
              className="inline-block px-6 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg font-medium transition-colors"
            >
              Debrief →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
