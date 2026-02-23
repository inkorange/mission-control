"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { getMissionById } from "@/engine/data/missions";
import { useBuilderStore } from "@/stores/useBuilderStore";
import { getEngineById } from "@/engine/data/engines";
import PartsPanel from "@/components/builder/PartsPanel";
import StageEditor from "@/components/builder/StageEditor";
import StatsPanel from "@/components/builder/StatsPanel";
import RocketPreview3D from "@/components/builder/RocketPreview3D";
import { formatCost } from "@/lib/formatters";
import type { EngineDef, FuelTankDef, FuelType } from "@/types/rocket";
import { ENGINE_FUEL_MAP } from "@/types/rocket";

export default function BuilderPage({
  params,
}: {
  params: Promise<{ missionId: string }>;
}) {
  const { missionId } = use(params);
  const mission = getMissionById(missionId);

  const {
    stages,
    payload,
    setMission,
    addStage,
    setEngine,
    addFuelTank,
    getTotalCost,
    getTWR,
    getTotalDeltaV,
  } = useBuilderStore();

  const [selectedStageIndex, setSelectedStageIndex] = useState<number>(0);

  // Initialize builder with mission data
  useEffect(() => {
    if (mission) {
      setMission(missionId, {
        name: mission.codename,
        mass: mission.requirements.minPayloadMass ?? 0,
      });
    }
  }, [missionId, mission, setMission]);

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

  const handleSelectEngine = (engine: EngineDef) => {
    if (stages.length === 0) {
      addStage();
      // Use setTimeout to allow state to settle before setting engine
      setTimeout(() => {
        const currentStages = useBuilderStore.getState().stages;
        if (currentStages.length > 0) {
          setEngine(0, engine.id, 1);
          setSelectedStageIndex(0);
        }
      }, 0);
      return;
    }

    const idx = selectedStageIndex < stages.length ? selectedStageIndex : stages.length - 1;
    // Check if engine already on stage
    const existing = stages[idx]?.engines.find((e) => e.engineId === engine.id);
    if (existing) {
      setEngine(idx, engine.id, existing.count + 1);
    } else {
      setEngine(idx, engine.id, 1);
    }
  };

  const handleSelectFuelTank = (tank: FuelTankDef) => {
    // Can't add fuel without engines on the stage
    if (stages.length === 0 || compatibleFuelTypes.length === 0) return;

    const idx = selectedStageIndex < stages.length ? selectedStageIndex : stages.length - 1;
    addFuelTank(idx, tank);
  };

  // Compute compatible fuel types from engines on the selected stage
  const selectedStage = stages[selectedStageIndex];
  const compatibleFuelTypes: FuelType[] = selectedStage
    ? [
        ...new Set(
          selectedStage.engines
            .map((ec) => {
              const engine = getEngineById(ec.engineId);
              return engine ? ENGINE_FUEL_MAP[engine.type] : null;
            })
            .filter((ft): ft is FuelType => ft !== null)
        ),
      ]
    : [];

  const totalCost = getTotalCost();
  const twr = getTWR();
  const totalDv = getTotalDeltaV();
  const overBudget = totalCost > mission.budget;
  const twrOk = stages.length === 0 || twr >= 1.0;

  // Readiness checks
  const hasEngines = stages.some((s) => s.engines.length > 0);
  const hasFuel = stages.some((s) => s.fuelMass > 0);
  const isReady = stages.length > 0 && hasEngines && hasFuel && twrOk && !overBudget;

  return (
    <div className="h-[calc(100vh-84px)] flex flex-col">
      {/* Mission subheader */}
      <div className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-mono text-[0.7rem] tracking-[0.2em] uppercase text-[var(--nasa-blue-light)]">
              {mission.codename}
            </span>
            <div className="h-4 w-px bg-[var(--border)]" />
            <h2 className="text-base font-semibold">{mission.name}</h2>
            <div className="h-4 w-px bg-[var(--border)]" />
            <div className="flex items-center gap-1.5">
              <span className="status-dot status-dot--active" />
              <span className="font-mono text-[0.75rem] tracking-wider uppercase text-[var(--nasa-green)]">
                Assembly
              </span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
              <div>
                <span className="font-mono text-[0.625rem] tracking-[0.15em] uppercase text-[var(--muted)] block">
                  Budget
                </span>
                <span
                  className={`font-mono text-sm ${overBudget ? "text-[var(--nasa-red)]" : "text-[var(--data)]"}`}
                >
                  {formatCost(totalCost)} / {formatCost(mission.budget)}
                </span>
              </div>
              {mission.requirements.minPayloadMass && (
                <div>
                  <span className="font-mono text-[0.625rem] tracking-[0.15em] uppercase text-[var(--muted)] block">
                    Payload
                  </span>
                  <span className="font-mono text-sm text-[var(--data)]">
                    {mission.requirements.minPayloadMass}kg
                  </span>
                </div>
              )}
            </div>
            <div className="h-4 w-px bg-[var(--border)]" />
            <Link
              href="/"
              className="font-mono text-[0.75rem] tracking-[0.1em] uppercase text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              Abort
            </Link>
          </div>
        </div>
      </div>

      {/* Builder workspace — 4 column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Parts catalog */}
        <div className="w-64 border-r border-[var(--border)] flex-shrink-0">
          <PartsPanel
            maxTier={mission.tier}
            onSelectEngine={handleSelectEngine}
            onSelectFuelTank={handleSelectFuelTank}
            compatibleFuelTypes={compatibleFuelTypes}
          />
        </div>

        {/* Center: Stage assembly */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-[0.75rem] tracking-[0.2em] uppercase text-[var(--nasa-red)]">
              Stage Assembly
            </span>
            <button
              onClick={addStage}
              className="font-mono text-[0.75rem] tracking-[0.1em] uppercase px-3 py-1.5 border border-[var(--border)] hover:border-[var(--nasa-red)]/40 hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)] rounded-sm transition-colors"
            >
              + Add Stage
            </button>
          </div>

          {stages.length === 0 ? (
            <div className="panel p-8 text-center">
              <p className="font-mono text-sm tracking-wider uppercase text-[var(--muted)] mb-3">
                No Stages
              </p>
              <p className="text-sm text-[var(--muted)] mb-4">
                Select a part from the catalog on the left to auto-create a stage,
                or click &quot;+ Add Stage&quot; above.
              </p>
              <div className="inline-block text-left">
                <p className="font-mono text-[0.625rem] tracking-[0.15em] uppercase text-[var(--muted)] mb-2">
                  Quick Start
                </p>
                <ol className="space-y-1 text-sm text-[var(--muted)]">
                  <li>1. Pick an engine from the Engines tab</li>
                  <li>2. The Fuel tab unlocks with compatible tanks</li>
                  <li>3. Add a fuel tank, then adjust load with the slider</li>
                  <li>4. Check TWR &gt; 1.0 to launch</li>
                </ol>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Readiness checklist */}
              <div className="panel p-3">
                <span className="font-mono text-[0.625rem] tracking-[0.15em] uppercase text-[var(--muted)] block mb-2">
                  Launch Readiness
                </span>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <CheckItem label="Engines installed" ok={hasEngines} />
                  <CheckItem label="Fuel loaded" ok={hasFuel} />
                  <CheckItem
                    label={`TWR > 1.0 ${stages.length > 0 && hasEngines ? `(${twr.toFixed(2)})` : ""}`}
                    ok={twrOk && hasEngines}
                  />
                  <CheckItem
                    label={`Within budget`}
                    ok={!overBudget}
                  />
                </div>
              </div>

              {/* Render stages top-down (upper stages first) */}
              {[...stages]
                .map((stage, i) => ({ stage, originalIndex: i }))
                .reverse()
                .map(({ stage, originalIndex }) => (
                  <div
                    key={stage.id}
                    onClick={() => setSelectedStageIndex(originalIndex)}
                    className={`cursor-pointer rounded ${
                      selectedStageIndex === originalIndex
                        ? "ring-1 ring-[var(--nasa-red)]/50"
                        : ""
                    }`}
                  >
                    <StageEditor
                      stage={stage}
                      stageIndex={originalIndex}
                      stageCount={stages.length}
                    />
                  </div>
                ))}
            </div>
          )}

          {/* Launch button */}
          {stages.length > 0 && (
            <div className="mt-6 flex items-center justify-between">
              <div className="flex items-center gap-3 flex-wrap">
                {!hasEngines && (
                  <div className="flex items-center gap-1.5">
                    <span className="status-dot status-dot--danger" />
                    <span className="font-mono text-[0.7rem] tracking-wider uppercase text-[var(--nasa-red)]">
                      No engines
                    </span>
                  </div>
                )}
                {hasEngines && !twrOk && (
                  <div className="flex items-center gap-1.5">
                    <span className="status-dot status-dot--danger" />
                    <span className="font-mono text-[0.7rem] tracking-wider uppercase text-[var(--nasa-red)]">
                      TWR {twr.toFixed(2)} — too heavy, add engines or reduce fuel
                    </span>
                  </div>
                )}
                {!hasFuel && (
                  <div className="flex items-center gap-1.5">
                    <span className="status-dot status-dot--danger" />
                    <span className="font-mono text-[0.7rem] tracking-wider uppercase text-[var(--nasa-red)]">
                      No fuel
                    </span>
                  </div>
                )}
                {overBudget && (
                  <div className="flex items-center gap-1.5">
                    <span className="status-dot status-dot--danger" />
                    <span className="font-mono text-[0.7rem] tracking-wider uppercase text-[var(--nasa-red)]">
                      Over budget
                    </span>
                  </div>
                )}
                {isReady && (
                  <div className="flex items-center gap-1.5">
                    <span className="status-dot status-dot--active" />
                    <span className="font-mono text-[0.7rem] tracking-wider uppercase text-[var(--nasa-green)]">
                      Vehicle ready
                    </span>
                  </div>
                )}
              </div>
              <Link
                href={`/launch/${missionId}`}
                className={`
                  font-mono text-[0.8rem] tracking-[0.1em] uppercase px-8 py-3 rounded-sm transition-colors
                  ${
                    !isReady
                      ? "bg-[var(--border)] text-[var(--muted)] cursor-not-allowed pointer-events-none"
                      : "bg-[var(--nasa-red)] hover:bg-[var(--nasa-red-dark)] text-white glow-red"
                  }
                `}
              >
                Proceed to Launch
              </Link>
            </div>
          )}
        </div>

        {/* Right: Preview + Stats */}
        <div className="w-96 border-l border-[var(--border)] flex-shrink-0 flex flex-col">
          <div className="h-3/5 border-b border-[var(--border)]">
            <RocketPreview3D />
          </div>
          <div className="h-2/5 overflow-y-auto">
            <StatsPanel budget={mission.budget} />
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`w-3 h-3 flex items-center justify-center rounded-sm border text-[0.5rem] font-bold ${
          ok
            ? "border-[var(--nasa-green)]/40 bg-[var(--nasa-green)]/10 text-[var(--nasa-green)]"
            : "border-[var(--border)] text-[var(--muted)]"
        }`}
      >
        {ok ? "\u2713" : ""}
      </span>
      <span
        className={`font-mono text-[0.625rem] ${
          ok ? "text-[var(--foreground)]" : "text-[var(--muted)]"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
