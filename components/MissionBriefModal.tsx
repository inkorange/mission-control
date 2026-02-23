"use client";

import { useEffect, useCallback } from "react";
import Link from "next/link";
import type { Mission, MissionResult } from "@/types/mission";
import { formatCost, formatDistance, formatMass } from "@/lib/formatters";

interface MissionBriefModalProps {
  mission: Mission;
  previousResult?: MissionResult;
  onClose: () => void;
}

export default function MissionBriefModal({
  mission,
  previousResult,
  onClose,
}: MissionBriefModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const target = mission.requirements.targetOrbit;
  const isSuborbital = target && (!isFinite(target.periapsis.min) || !isFinite(target.periapsis.max));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="panel w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto animate-scale-in">
        {/* Header */}
        <div className="p-5 border-b border-[var(--border)]">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-[0.7rem] tracking-[0.2em] uppercase text-[var(--nasa-blue-light)]">
              {mission.codename}
            </span>
            <span className="font-mono text-[0.7rem] tracking-[0.15em] uppercase text-[var(--muted)]">
              Tier {mission.tier}
            </span>
          </div>
          <h3 className="text-xl font-bold tracking-tight">{mission.name}</h3>
        </div>

        {/* Description */}
        <div className="p-5 border-b border-[var(--border)]">
          <p className="text-[0.9rem] leading-relaxed text-[var(--muted)]">
            {mission.description}
          </p>
        </div>

        {/* Mission parameters */}
        <div className="p-5 border-b border-[var(--border)]">
          <span className="font-mono text-[0.6rem] tracking-[0.15em] uppercase text-[var(--nasa-red)] block mb-3">
            Mission Parameters
          </span>
          <div className="grid grid-cols-2 gap-2">
            <ParamItem label="Budget" value={formatCost(mission.budget)} />
            {mission.requirements.minPayloadMass && (
              <ParamItem
                label="Payload"
                value={formatMass(mission.requirements.minPayloadMass)}
              />
            )}
            {mission.requirements.targetBody && (
              <ParamItem
                label="Target"
                value={mission.requirements.targetBody.charAt(0).toUpperCase() + mission.requirements.targetBody.slice(1)}
              />
            )}
            {target && !isSuborbital && (
              <>
                <ParamItem
                  label="Periapsis"
                  value={`${formatDistance(target.periapsis.min)} – ${formatDistance(target.periapsis.max)}`}
                />
                <ParamItem
                  label="Apoapsis"
                  value={`${formatDistance(target.apoapsis.min)}${isFinite(target.apoapsis.max) ? ` – ${formatDistance(target.apoapsis.max)}` : "+"}`}
                />
              </>
            )}
            {target && isSuborbital && (
              <ParamItem
                label="Min Altitude"
                value={isFinite(target.apoapsis.min) ? formatDistance(target.apoapsis.min) : "—"}
              />
            )}
            {mission.requirements.timeLimitSeconds && (
              <ParamItem
                label="Time Limit"
                value={`${(mission.requirements.timeLimitSeconds / 60).toFixed(0)} min`}
              />
            )}
          </div>
        </div>

        {/* Bonus challenges */}
        {mission.bonusChallenges.length > 0 && (
          <div className="p-5 border-b border-[var(--border)]">
            <span className="font-mono text-[0.6rem] tracking-[0.15em] uppercase text-[var(--nasa-red)] block mb-3">
              Bonus Challenges
            </span>
            <div className="space-y-2">
              {mission.bonusChallenges.map((bonus) => {
                const completed = previousResult?.bonusCompleted.includes(bonus.id);
                return (
                  <div key={bonus.id} className="flex items-center gap-2">
                    <span className={`text-base ${completed ? "star-filled" : "star-empty"}`}>
                      ★
                    </span>
                    <span
                      className={`font-mono text-[0.8rem] ${
                        completed ? "text-[var(--nasa-green)]" : "text-[var(--muted)]"
                      }`}
                    >
                      {bonus.description}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Previous best */}
        {previousResult && (
          <div className="p-5 border-b border-[var(--border)]">
            <span className="font-mono text-[0.6rem] tracking-[0.15em] uppercase text-[var(--nasa-red)] block mb-2">
              Previous Best
            </span>
            <div className="flex items-center gap-3">
              <div className="flex gap-0.5">
                {[1, 2, 3].map((s) => (
                  <span
                    key={s}
                    className={`text-lg ${
                      s <= previousResult.stars ? "star-filled" : "star-empty"
                    }`}
                  >
                    ★
                  </span>
                ))}
              </div>
              <span className="font-mono text-sm text-[var(--muted)]">
                Score: {previousResult.bestScore}/100
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="p-5 flex items-center gap-3">
          <Link
            href={`/builder/${mission.id}`}
            className="flex-1 text-center font-mono text-[0.8rem] tracking-[0.1em] uppercase py-2.5 bg-[var(--nasa-red)] hover:bg-[var(--nasa-red-dark)] text-white rounded-sm transition-colors"
          >
            Begin Assembly
          </Link>
          <button
            onClick={onClose}
            className="font-mono text-[0.8rem] tracking-[0.1em] uppercase px-5 py-2.5 border border-[var(--border)] hover:bg-[var(--surface)] rounded-sm transition-colors text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ParamItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2 rounded-sm border border-[var(--border)] bg-black/20">
      <span className="font-mono text-[0.5rem] tracking-[0.15em] uppercase text-[var(--muted)] block">
        {label}
      </span>
      <span className="font-mono text-[0.8rem] text-[var(--data)] block leading-none mt-0.5">
        {value}
      </span>
    </div>
  );
}
