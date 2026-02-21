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
    <div className="h-[calc(100vh-49px)] flex flex-col">
      {/* Mission subheader */}
      <div className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="px-6 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-mono text-[0.55rem] tracking-[0.2em] uppercase text-[var(--nasa-blue-light)]">
              {mission.codename}
            </span>
            <div className="h-4 w-px bg-[var(--border)]" />
            <h2 className="text-sm font-semibold">{mission.name}</h2>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
              <div>
                <span className="font-mono text-[0.5rem] tracking-[0.15em] uppercase text-[var(--muted)] block">
                  Budget
                </span>
                <span className="font-mono text-xs text-[var(--data)]">
                  ${(mission.budget / 1_000_000).toFixed(0)}M
                </span>
              </div>
              {mission.requirements.minPayloadMass && (
                <div>
                  <span className="font-mono text-[0.5rem] tracking-[0.15em] uppercase text-[var(--muted)] block">
                    Payload
                  </span>
                  <span className="font-mono text-xs text-[var(--data)]">
                    {mission.requirements.minPayloadMass}kg
                  </span>
                </div>
              )}
            </div>
            <div className="h-4 w-px bg-[var(--border)]" />
            <a
              href="/"
              className="font-mono text-[0.6rem] tracking-[0.1em] uppercase text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              Abort
            </a>
          </div>
        </div>
      </div>

      {/* Builder workspace — placeholder for Phase 2 */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="panel p-8 mb-4">
            <div className="panel-header mb-0 -m-8 mb-6 rounded-t">
              Vehicle Assembly
            </div>
            <div className="w-16 h-16 mx-auto mb-4 border-2 border-[var(--border)] rounded-sm flex items-center justify-center">
              <div className="w-3 h-8 bg-[var(--border-light)] rounded-sm" />
              <div className="w-5 h-12 bg-[var(--border)] rounded-sm -ml-0.5" />
              <div className="w-3 h-8 bg-[var(--border-light)] rounded-sm -ml-0.5" />
            </div>
            <p className="font-mono text-xs tracking-wider uppercase text-[var(--muted)] mb-2">
              Phase 2
            </p>
            <p className="text-sm text-[var(--muted)]">
              Drag-and-drop rocket assembly, engine selection, staging configuration,
              and real-time delta-v calculations.
            </p>
          </div>

          <p className="text-[0.7rem] leading-relaxed text-[var(--muted)] mb-6">
            {mission.description}
          </p>

          <a
            href={`/launch/${missionId}`}
            className="inline-block font-mono text-[0.65rem] tracking-[0.1em] uppercase px-6 py-2.5 bg-[var(--nasa-red)] hover:bg-[var(--nasa-red-dark)] text-white rounded-sm transition-colors"
          >
            Proceed to Launch
          </a>
        </div>
      </div>
    </div>
  );
}
