"use client";

import { useBuilderStore } from "@/stores/useBuilderStore";
import { getEngineById } from "@/engine/data/engines";

/**
 * 2D schematic rocket preview — stacked stages visualized as colored segments.
 * Replaces 3D R3F preview for Phase 2; can be upgraded to 3D in a later phase.
 */
export default function RocketPreview() {
  const { stages, payload } = useBuilderStore();

  if (stages.length === 0) {
    return (
      <div className="panel flex flex-col h-full">
        <div className="panel-header">Vehicle Preview</div>
        <div className="flex-1 flex items-center justify-center">
          <p className="font-mono text-[0.7rem] tracking-wider uppercase text-[var(--muted)]">
            Add stages to preview
          </p>
        </div>
      </div>
    );
  }

  // Calculate relative heights based on mass
  const stageData = stages.map((stage, i) => {
    let engineMass = 0;
    let engineCount = 0;
    for (const ec of stage.engines) {
      const engine = getEngineById(ec.engineId);
      if (engine) {
        engineMass += engine.mass * ec.count;
        engineCount += ec.count;
      }
    }
    const totalMass = stage.fuelMass + stage.structuralMass + engineMass;
    return { ...stage, totalMass, engineCount, index: i };
  });

  const maxMass = Math.max(...stageData.map((s) => s.totalMass), 1);

  return (
    <div className="panel flex flex-col h-full">
      <div className="panel-header">Vehicle Preview</div>

      <div className="flex-1 flex flex-col items-center justify-end p-4 pb-6">
        {/* Rocket visualization — built bottom-up, displayed top-down */}
        <div className="flex flex-col items-center gap-0.5 w-full max-w-[120px]">
          {/* Payload / Nosecone */}
          {payload.mass > 0 && (
            <div className="flex flex-col items-center">
              <div
                className="w-0 h-0 border-l-[14px] border-r-[14px] border-b-[20px] border-l-transparent border-r-transparent border-b-[var(--nasa-silver)]/30"
              />
              <span className="font-mono text-[0.5rem] text-[var(--muted)] mt-0.5">
                {payload.name}
              </span>
            </div>
          )}

          {/* Stages — rendered top to bottom (reverse order since index 0 = bottom) */}
          {[...stageData].reverse().map((stage) => {
            // Width proportional to mass, min 40%, max 100%
            const widthPct = Math.max(40, (stage.totalMass / maxMass) * 100);
            // Height proportional to mass
            const heightPx = Math.max(
              30,
              Math.min(100, (stage.totalMass / maxMass) * 80 + 20)
            );
            const displayNum = stageData.length - stage.index;

            return (
              <div key={stage.id} className="flex flex-col items-center w-full">
                {/* Interstage adapter */}
                {stage.index < stageData.length - 1 && (
                  <div className="w-1/3 h-[3px] bg-[var(--border-light)] rounded-sm" />
                )}

                {/* Stage body */}
                <div
                  className="rounded-sm border border-[var(--border-light)] relative overflow-hidden transition-all"
                  style={{
                    width: `${widthPct}%`,
                    height: `${heightPx}px`,
                  }}
                >
                  {/* Fuel fill */}
                  {stage.fuelMass > 0 && (
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-[var(--nasa-blue)]/20 border-t border-[var(--nasa-blue)]/30"
                      style={{
                        height: `${Math.min(
                          90,
                          (stage.fuelMass / (stage.totalMass || 1)) * 100
                        )}%`,
                      }}
                    />
                  )}

                  {/* Stage label */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-mono text-[0.625rem] font-bold text-[var(--foreground)]/60">
                      S{displayNum}
                    </span>
                  </div>
                </div>

                {/* Engine bells for bottom of each stage */}
                {stage.engineCount > 0 && (
                  <div className="flex items-start justify-center gap-0.5 -mt-0.5">
                    {Array.from({
                      length: Math.min(stage.engineCount, 7),
                    }).map((_, ei) => (
                      <div
                        key={ei}
                        className="w-2 h-3 bg-gradient-to-b from-[var(--border-light)] to-[var(--nasa-orange)]/30 rounded-b-full"
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Launch pad base */}
          <div className="w-full flex flex-col items-center mt-1">
            <div className="w-3/4 h-[2px] bg-[var(--muted)]" />
            <div className="w-full h-[1px] bg-[var(--border)] mt-1" />
          </div>
        </div>
      </div>
    </div>
  );
}
