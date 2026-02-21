"use client";

import { useEffect } from "react";
import { useProgressionStore } from "@/stores/useProgressionStore";
import { MISSIONS } from "@/engine/data/missions";
import { getStarsRequiredForTier } from "@/engine/data/missions";
import type { MissionTier } from "@/types/mission";

const TIER_NAMES: Record<number, string> = {
  1: "Foundations",
  2: "Working Orbits",
  3: "Deep Space",
  4: "Interplanetary",
  5: "Grand Tour",
};

export default function MissionSelect() {
  const {
    isLoaded,
    loadProgress,
    missionResults,
    isTierUnlocked,
    getTierStars,
    totalStars,
  } = useProgressionStore();

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  const tiers = [1, 2, 3, 4, 5] as MissionTier[];

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-10">
        <h2 className="text-3xl font-bold mb-2">Mission Select</h2>
        <p className="text-[var(--muted)]">
          Total Stars: {totalStars} | Choose a mission to begin designing your
          rocket.
        </p>
      </div>

      {tiers.map((tier) => {
        const unlocked = isTierUnlocked(tier);
        const tierMissions = MISSIONS.filter((m) => m.tier === tier);
        const tierStars = getTierStars(tier);
        const required = getStarsRequiredForTier(tier);

        return (
          <div key={tier} className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-xl font-semibold">
                Tier {tier}: {TIER_NAMES[tier]}
              </h3>
              {!unlocked && (
                <span className="text-xs text-[var(--warning)] border border-[var(--warning)]/30 px-2 py-0.5 rounded">
                  Requires {required} stars from Tier {tier - 1}
                </span>
              )}
              {unlocked && (
                <span className="text-xs text-[var(--muted)]">
                  {tierStars} stars earned
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {tierMissions.map((mission) => {
                const result = missionResults[mission.id];
                const isUnlocked = unlocked;

                return (
                  <div
                    key={mission.id}
                    className={`
                      border rounded-lg p-5 transition-all
                      ${
                        isUnlocked
                          ? "border-[var(--border)] hover:border-[var(--accent)]/50 hover:bg-[var(--surface-hover)] cursor-pointer"
                          : "border-[var(--border)]/30 opacity-40 cursor-not-allowed"
                      }
                    `}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className="text-xs text-[var(--muted)] uppercase tracking-wider">
                          {mission.codename}
                        </span>
                        <h4 className="font-semibold">{mission.name}</h4>
                      </div>
                      <div className="flex gap-0.5">
                        {[1, 2, 3].map((star) => (
                          <span
                            key={star}
                            className={`text-sm ${
                              result && result.stars >= star
                                ? "text-[var(--warning)]"
                                : "text-[var(--border)]"
                            }`}
                          >
                            ★
                          </span>
                        ))}
                      </div>
                    </div>

                    <p className="text-sm text-[var(--muted)] line-clamp-2 mb-3">
                      {mission.description}
                    </p>

                    <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                      <span>
                        Budget: $
                        {(mission.budget / 1_000_000).toFixed(0)}M
                      </span>
                      {isUnlocked && (
                        <a
                          href={`/builder/${mission.id}`}
                          className="text-[var(--accent)] hover:text-[var(--accent-hover)] font-medium"
                        >
                          {result ? "Retry" : "Start"} →
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
