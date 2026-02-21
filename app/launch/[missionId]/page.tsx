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
      {/* Flight HUD header */}
      <div className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-mono text-[0.55rem] tracking-[0.2em] uppercase text-[var(--nasa-blue-light)]">
              {mission.codename}
            </span>
            <div className="h-4 w-px bg-[var(--border)]" />
            <div className="flex items-center gap-1.5">
              <span className="status-dot status-dot--active" />
              <span className="font-mono text-[0.6rem] tracking-wider uppercase text-[var(--nasa-green)]">
                Flight Active
              </span>
            </div>
          </div>

          {/* Telemetry strip */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
              <div>
                <span className="font-mono text-[0.5rem] tracking-[0.15em] uppercase text-[var(--muted)] block">
                  MET
                </span>
                <span className="font-mono text-xs text-[var(--data)]">
                  T+ 00:00:00
                </span>
              </div>
              <div>
                <span className="font-mono text-[0.5rem] tracking-[0.15em] uppercase text-[var(--muted)] block">
                  ALT
                </span>
                <span className="font-mono text-xs text-[var(--data)]">
                  0.0 km
                </span>
              </div>
              <div>
                <span className="font-mono text-[0.5rem] tracking-[0.15em] uppercase text-[var(--muted)] block">
                  VEL
                </span>
                <span className="font-mono text-xs text-[var(--data)]">
                  0 m/s
                </span>
              </div>
            </div>
            <div className="h-4 w-px bg-[var(--border)]" />
            <div>
              <span className="font-mono text-[0.5rem] tracking-[0.15em] uppercase text-[var(--muted)] block">
                Warp
              </span>
              <span className="font-mono text-xs text-[var(--foreground)]">
                1x
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Flight scene — placeholder for Phase 3 */}
      <div className="flex-1 flex items-center justify-center relative">
        {/* Simulated dark space background */}
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--nasa-dark)] to-[#020510]" />

        <div className="text-center relative z-10">
          <div className="panel p-8 mb-4">
            <div className="panel-header mb-0 -m-8 mb-6 rounded-t">
              Flight Simulation
            </div>
            {/* Stylized trajectory preview */}
            <div className="w-32 h-32 mx-auto mb-4 relative">
              <div className="absolute inset-0 border-2 border-[var(--border)] rounded-full" />
              <div className="absolute inset-4 border border-[var(--border-light)] rounded-full border-dashed" />
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-2 h-2 bg-[var(--nasa-blue-light)] rounded-full" />
              <div className="absolute top-6 right-6 w-1.5 h-1.5 bg-[var(--nasa-red)] rounded-full" />
            </div>
            <p className="font-mono text-xs tracking-wider uppercase text-[var(--muted)] mb-2">
              Phase 3
            </p>
            <p className="text-sm text-[var(--muted)]">
              Real-time 3D flight visualization, manual gravity turn controls,
              staging, and live orbital telemetry.
            </p>
          </div>

          <a
            href={`/debrief/${missionId}`}
            className="inline-block font-mono text-[0.65rem] tracking-[0.1em] uppercase px-6 py-2.5 bg-[var(--nasa-red)] hover:bg-[var(--nasa-red-dark)] text-white rounded-sm transition-colors"
          >
            Proceed to Debrief
          </a>
        </div>
      </div>
    </div>
  );
}
