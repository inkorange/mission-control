"use client";

import { useBuilderStore } from "@/stores/useBuilderStore";
import { getEngineById } from "@/engine/data/engines";
import { getFuelTankById } from "@/engine/data/parts";
import { formatCost, formatMass, formatDeltaV } from "@/lib/formatters";
import type { Stage } from "@/types/rocket";

interface StageEditorProps {
  stage: Stage;
  stageIndex: number;
  stageCount: number;
}

export default function StageEditor({
  stage,
  stageIndex,
  stageCount,
}: StageEditorProps) {
  const { setEngine, setFuelMass, removeFuelTank, removeStage, getStageDeltaV } =
    useBuilderStore();

  const stageDv = getStageDeltaV(stageIndex);

  // Calculate stage mass and cost
  let engineMass = 0;
  let totalThrust = 0;
  let engineCost = 0;
  for (const ec of stage.engines) {
    const engine = getEngineById(ec.engineId);
    if (engine) {
      engineMass += engine.mass * ec.count;
      totalThrust += engine.thrustVacuum * ec.count;
      engineCost += engine.cost * ec.count;
    }
  }
  const stageMass = stage.fuelMass + stage.structuralMass + engineMass;
  const totalStageCost = engineCost + stage.partsCost;

  // Display index: stages show top-down (last = top), but array is bottom-up
  const displayNumber = stageCount - stageIndex;

  return (
    <div className="panel group">
      {/* Stage header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] bg-black/20">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[0.7rem] font-bold tracking-[0.2em] uppercase text-[var(--nasa-red)]">
            Stage {displayNumber}
          </span>
          {stageIndex === 0 && (
            <span className="font-mono text-[0.55rem] tracking-wider uppercase px-1.5 py-0.5 bg-[var(--nasa-green)]/10 text-[var(--nasa-green)] border border-[var(--nasa-green)]/20 rounded-sm">
              First
            </span>
          )}
          {stageIndex === stageCount - 1 && stageCount > 1 && (
            <span className="font-mono text-[0.55rem] tracking-wider uppercase px-1.5 py-0.5 bg-[var(--nasa-blue-light)]/10 text-[var(--nasa-blue-light)] border border-[var(--nasa-blue-light)]/20 rounded-sm">
              Upper
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[0.7rem] text-[var(--data)]">
            {formatDeltaV(stageDv)}
          </span>
          <button
            onClick={() => removeStage(stageIndex)}
            className="font-mono text-[0.625rem] tracking-wider uppercase text-[var(--muted)] hover:text-[var(--nasa-red)] transition-colors opacity-0 group-hover:opacity-100"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Engines section */}
        <div>
          <span className="font-mono text-[0.625rem] tracking-[0.15em] uppercase text-[var(--muted)] block mb-1.5">
            Engines
          </span>
          {stage.engines.length === 0 ? (
            <div className="flex items-center gap-2 py-2 px-2 rounded-sm border border-dashed border-[var(--nasa-red)]/30 bg-[var(--nasa-red)]/5">
              <span className="status-dot status-dot--danger" />
              <span className="font-mono text-[0.7rem] text-[var(--nasa-red)]">
                Needs engine — select from Engines tab
              </span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {stage.engines.map((ec) => {
                const engine = getEngineById(ec.engineId);
                if (!engine) return null;
                return (
                  <div
                    key={ec.engineId}
                    className="flex items-center justify-between px-2 py-1.5 rounded-sm border border-[var(--border)] bg-black/10"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{engine.name}</span>
                      <span className="font-mono text-[0.625rem] text-[var(--muted)]">
                        {(engine.thrustVacuum / 1000).toFixed(0)}kN / {engine.ispVacuum}s
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setEngine(stageIndex, ec.engineId, ec.count - 1)
                        }
                        className="w-5 h-5 flex items-center justify-center rounded-sm border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)] text-sm transition-colors"
                      >
                        -
                      </button>
                      <span className="font-mono text-sm text-[var(--data)] w-4 text-center">
                        {ec.count}
                      </span>
                      <button
                        onClick={() =>
                          setEngine(stageIndex, ec.engineId, ec.count + 1)
                        }
                        className="w-5 h-5 flex items-center justify-center rounded-sm border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)] text-sm transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Fuel tanks section */}
        <div>
          <span className="font-mono text-[0.625rem] tracking-[0.15em] uppercase text-[var(--muted)] block mb-1.5">
            Fuel Tanks
          </span>
          {stage.tanks.length === 0 ? (
            <div className="flex items-center gap-2 py-2 px-2 rounded-sm border border-dashed border-[var(--nasa-gold)]/30 bg-[var(--nasa-gold)]/5">
              <span className="status-dot status-dot--warning" />
              <span className="font-mono text-[0.7rem] text-[var(--nasa-gold)]">
                {stage.engines.length > 0
                  ? "No fuel tanks — add from Fuel tab"
                  : "Add an engine first, then fuel"}
              </span>
            </div>
          ) : (
            <div className="space-y-1.5">
              {stage.tanks.map((tankId, idx) => {
                const tank = getFuelTankById(tankId);
                if (!tank) return null;
                return (
                  <div
                    key={`${tankId}-${idx}`}
                    className="flex items-center justify-between px-2 py-1.5 rounded-sm border border-[var(--border)] bg-black/10"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{tank.name}</span>
                      <span className="font-mono text-[0.625rem] text-[var(--muted)]">
                        {formatMass(tank.fuelCapacity)} / {formatCost(tank.cost)}
                      </span>
                    </div>
                    <button
                      onClick={() => removeFuelTank(stageIndex, idx)}
                      className="font-mono text-[0.625rem] tracking-wider uppercase text-[var(--muted)] hover:text-[var(--nasa-red)] transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Fuel load slider */}
        {stage.fuelCapacity > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono text-[0.625rem] tracking-[0.15em] uppercase text-[var(--muted)]">
                Fuel Load
              </span>
              <span className="font-mono text-[0.7rem] text-[var(--data)]">
                {formatMass(stage.fuelMass)} / {formatMass(stage.fuelCapacity)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={stage.fuelCapacity}
              step={Math.max(100, Math.round(stage.fuelCapacity / 100) * 100 / 100)}
              value={stage.fuelMass}
              onChange={(e) => setFuelMass(stageIndex, Number(e.target.value))}
              className="w-full h-1.5 appearance-none bg-[var(--border)] rounded-full cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--nasa-red)] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer
                [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:bg-[var(--nasa-red)] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
            />
            <div className="flex justify-between mt-0.5">
              <span className="font-mono text-[0.55rem] text-[var(--muted)]">Empty</span>
              <span className="font-mono text-[0.55rem] text-[var(--muted)]">
                {formatMass(stage.fuelCapacity)}
              </span>
            </div>
            <p className="font-mono text-[0.55rem] text-[var(--muted)]/60 mt-1">
              Fuel included with tank — adjust fill to trade mass vs. delta-v
            </p>
          </div>
        )}

        {/* Stage summary strip */}
        <div className="flex items-center gap-3 pt-2 border-t border-[var(--border)]">
          <div>
            <span className="font-mono text-[0.55rem] tracking-wider uppercase text-[var(--muted)] block">
              Mass
            </span>
            <span className="font-mono text-[0.7rem] text-[var(--foreground)]">
              {formatMass(stageMass)}
            </span>
          </div>
          <div>
            <span className="font-mono text-[0.55rem] tracking-wider uppercase text-[var(--muted)] block">
              Thrust
            </span>
            <span className="font-mono text-[0.7rem] text-[var(--foreground)]">
              {(totalThrust / 1000).toFixed(0)}kN
            </span>
          </div>
          <div>
            <span className="font-mono text-[0.55rem] tracking-wider uppercase text-[var(--muted)] block">
              Cost
            </span>
            <span className="font-mono text-[0.7rem] text-[var(--foreground)]">
              {formatCost(totalStageCost)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
