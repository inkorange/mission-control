"use client";

import { useState, useEffect } from "react";
import { getEnginesByTier } from "@/engine/data/engines";
import { getFuelTanksByTier } from "@/engine/data/parts";
import type { EngineDef, FuelTankDef, FuelType } from "@/types/rocket";
import { formatCost, formatMass } from "@/lib/formatters";

type Tab = "engines" | "fuel";

interface PartsPanelProps {
  maxTier: number;
  onSelectEngine: (engine: EngineDef) => void;
  onSelectFuelTank: (tank: FuelTankDef) => void;
  /** Fuel types compatible with engines on the selected stage. Empty = no engines yet. */
  compatibleFuelTypes: FuelType[];
}

export default function PartsPanel({
  maxTier,
  onSelectEngine,
  onSelectFuelTank,
  compatibleFuelTypes,
}: PartsPanelProps) {
  const [tab, setTab] = useState<Tab>("engines");

  const engines = getEnginesByTier(maxTier);
  const allTanks = getFuelTanksByTier(maxTier);

  const hasEngines = compatibleFuelTypes.length > 0;
  const tanks = hasEngines
    ? allTanks.filter((t) => compatibleFuelTypes.includes(t.fuelType))
    : [];

  // If fuel tab is active but no engines on stage, switch back to engines
  useEffect(() => {
    if (tab === "fuel" && !hasEngines) {
      setTab("engines");
    }
  }, [tab, hasEngines]);

  return (
    <div className="panel flex flex-col h-full">
      <div className="panel-header flex items-center justify-between">
        <span>Parts Catalog</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)]">
        <button
          onClick={() => setTab("engines")}
          className={`
            flex-1 py-2 font-mono text-[0.75rem] tracking-[0.15em] uppercase transition-colors
            ${tab === "engines"
              ? "text-[var(--nasa-red)] border-b-2 border-[var(--nasa-red)] bg-[var(--nasa-red)]/5"
              : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }
          `}
        >
          Engines
        </button>
        <button
          onClick={() => hasEngines && setTab("fuel")}
          title={hasEngines ? undefined : "Select an engine first"}
          className={`
            flex-1 py-2 font-mono text-[0.75rem] tracking-[0.15em] uppercase transition-colors
            ${!hasEngines
              ? "text-[var(--muted)]/40 cursor-not-allowed"
              : tab === "fuel"
                ? "text-[var(--nasa-red)] border-b-2 border-[var(--nasa-red)] bg-[var(--nasa-red)]/5"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }
          `}
        >
          Fuel
        </button>
      </div>

      {/* Parts list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {tab === "engines" &&
          engines.map((engine) => (
            <button
              key={engine.id}
              onClick={() => onSelectEngine(engine)}
              className="w-full text-left p-2.5 rounded-sm border border-[var(--border)] hover:border-[var(--nasa-red)]/40 hover:bg-[var(--surface-hover)] transition-all group"
            >
              <div className="flex items-start justify-between mb-1">
                <div>
                  <span className="text-sm font-semibold block">
                    {engine.name}
                  </span>
                  <span className="font-mono text-[0.625rem] tracking-wider uppercase text-[var(--muted)]">
                    {engine.type.replace("liquid_", "").replace("_", "/")}
                  </span>
                </div>
                <span className="font-mono text-[0.7rem] text-[var(--nasa-gold)] opacity-0 group-hover:opacity-100 transition-opacity">
                  + Add
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 mt-1.5">
                <div>
                  <span className="font-mono text-[0.55rem] tracking-wider uppercase text-[var(--muted)] block">
                    Thrust
                  </span>
                  <span className="font-mono text-[0.75rem] text-[var(--data)]">
                    {(engine.thrustVacuum / 1000).toFixed(0)}kN
                  </span>
                </div>
                <div>
                  <span className="font-mono text-[0.55rem] tracking-wider uppercase text-[var(--muted)] block">
                    Isp
                  </span>
                  <span className="font-mono text-[0.75rem] text-[var(--data)]">
                    {engine.ispVacuum}s
                  </span>
                </div>
                <div>
                  <span className="font-mono text-[0.55rem] tracking-wider uppercase text-[var(--muted)] block">
                    Cost
                  </span>
                  <span className="font-mono text-[0.75rem] text-[var(--data)]">
                    {formatCost(engine.cost)}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 mt-1">
                <div>
                  <span className="font-mono text-[0.55rem] tracking-wider uppercase text-[var(--muted)] block">
                    Mass
                  </span>
                  <span className="font-mono text-[0.75rem] text-[var(--muted)]">
                    {formatMass(engine.mass)}
                  </span>
                </div>
                <div>
                  <span className="font-mono text-[0.55rem] tracking-wider uppercase text-[var(--muted)] block">
                    Throttle
                  </span>
                  <span className="font-mono text-[0.75rem] text-[var(--muted)]">
                    {engine.throttleable
                      ? `${Math.round(engine.minThrottle * 100)}-100%`
                      : "Fixed"}
                  </span>
                </div>
                <div>
                  <span className="font-mono text-[0.55rem] tracking-wider uppercase text-[var(--muted)] block">
                    Restart
                  </span>
                  <span className="font-mono text-[0.75rem] text-[var(--muted)]">
                    {engine.restartable ? "Yes" : "No"}
                  </span>
                </div>
              </div>
            </button>
          ))}

        {tab === "fuel" && hasEngines && (
          <>
            {tanks.length > 0 ? (
              tanks.map((tank) => (
                <button
                  key={tank.id}
                  onClick={() => onSelectFuelTank(tank)}
                  className="w-full text-left p-2.5 rounded-sm border border-[var(--border)] hover:border-[var(--nasa-red)]/40 hover:bg-[var(--surface-hover)] transition-all group"
                >
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <span className="text-sm font-semibold block">
                        {tank.name}
                      </span>
                      <span className="font-mono text-[0.625rem] tracking-wider uppercase text-[var(--muted)]">
                        {tank.fuelType.replace("_", "/")}
                      </span>
                    </div>
                    <span className="font-mono text-[0.7rem] text-[var(--nasa-gold)] opacity-0 group-hover:opacity-100 transition-opacity">
                      + Add
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 mt-1.5">
                    <div>
                      <span className="font-mono text-[0.55rem] tracking-wider uppercase text-[var(--muted)] block">
                        Capacity
                      </span>
                      <span className="font-mono text-[0.75rem] text-[var(--data)]">
                        {formatMass(tank.fuelCapacity)}
                      </span>
                    </div>
                    <div>
                      <span className="font-mono text-[0.55rem] tracking-wider uppercase text-[var(--muted)] block">
                        Dry Mass
                      </span>
                      <span className="font-mono text-[0.75rem] text-[var(--data)]">
                        {formatMass(tank.dryMass)}
                      </span>
                    </div>
                    <div>
                      <span className="font-mono text-[0.55rem] tracking-wider uppercase text-[var(--muted)] block">
                        Cost
                      </span>
                      <span className="font-mono text-[0.75rem] text-[var(--data)]">
                        {formatCost(tank.cost)}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-4 text-center">
                <span className="font-mono text-[0.7rem] text-[var(--muted)]">
                  No compatible tanks available at this tier
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
