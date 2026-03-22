"use client";

import { useEffect, useState } from "react";
import { useProgressionStore } from "@/stores/useProgressionStore";
import { MISSIONS } from "@/engine/data/missions";
import { getStarsRequiredForTier } from "@/engine/data/missions";
import MissionBriefModal from "@/components/MissionBriefModal";
import WelcomeModal from "@/components/WelcomeModal";
import EarthBackground from "@/components/three/EarthBackground";
import type { Mission, MissionTier } from "@/types/mission";

const TIER_NAMES: Record<number, string> = {
  1: "Foundations",
  2: "Working Orbits",
  3: "Deep Space",
  4: "Interplanetary",
  5: "Grand Tour",
};

const TIER_DESCRIPTIONS: Record<number, string> = {
  1: "Prove you can reach space and achieve stable orbit",
  2: "Master orbital transfers and geostationary deployment",
  3: "Navigate to the Moon — transfers, orbit, and landing",
  4: "Interplanetary missions to Mars and beyond",
  5: "Grand tour of the outer solar system",
};

export default function MissionSelect() {
  const {
    isLoaded,
    loadProgress,
    missionResults,
    unlockedTiers,
    isTierUnlocked,
    getTierStars,
    totalStars,
  } = useProgressionStore();
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [devMode, setDevMode] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("welcomeDismissed")) {
      setShowWelcome(true);
    }
  }, []);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  const COMING_SOON_TIERS: MissionTier[] = [4, 5];

  // Shift+O: unlock all tiers for testing (also bypasses Coming Soon)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === "O") {
        setDevMode(true);
        useProgressionStore.setState({
          unlockedTiers: [1, 2, 3, 4, 5],
        });
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-[var(--nasa-red)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="font-mono text-sm tracking-wider uppercase text-[var(--muted)]">
            Loading mission data...
          </p>
        </div>
      </div>
    );
  }

  const tiers = [1, 2, 3, 4, 5] as MissionTier[];

  return (
    <div className="relative min-h-[calc(100vh-84px)]">
      {/* 3D Earth background */}
      <EarthBackground />

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <span className="font-mono text-[0.75rem] tracking-[0.2em] uppercase text-[var(--nasa-red)]">
            Flight Operations
          </span>
          <div className="flex-1 h-px bg-[var(--border)]" />
          <div className="flex items-center gap-2">
            <span className="font-mono text-[0.75rem] tracking-wider uppercase text-[var(--muted)]">
              Total Stars
            </span>
            <span className="font-mono text-base text-[var(--nasa-gold)]">
              {totalStars}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Mission Select</h2>
            <p className="text-base text-[var(--muted)] mt-1">
              Select a mission to begin vehicle assembly and launch operations.
            </p>
          </div>
          <button
            onClick={() => setShowWelcome(true)}
            className="font-mono text-[0.8rem] tracking-[0.1em] uppercase px-4 py-2 bg-[var(--nasa-blue-light)] hover:bg-[var(--nasa-blue-light)]/80 text-white rounded-sm transition-colors shadow-[0_0_12px_rgba(64,156,255,0.3)]"
          >
            Help
          </button>
        </div>
      </div>

      {/* Tier sections */}
      {tiers.map((tier) => {
        const unlocked = unlockedTiers.includes(tier);
        const comingSoon = COMING_SOON_TIERS.includes(tier) && !devMode;
        const tierMissions = MISSIONS.filter((m) => m.tier === tier);
        const tierStars = getTierStars(tier);
        const required = getStarsRequiredForTier(tier);
        const maxStars = tierMissions.length * 3;

        return (
          <div key={tier} className="mb-8">
            {/* Tier header panel */}
            <div className={`panel-glass mb-4 ${comingSoon ? "opacity-50" : ""}`}>
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`
                      font-mono text-[0.8rem] font-bold tracking-[0.15em] uppercase px-2 py-0.5 rounded-sm
                      ${comingSoon
                        ? "bg-[var(--border)]/20 text-[var(--muted)] border border-[var(--border)]"
                        : unlocked
                          ? "bg-[var(--nasa-red)]/10 text-[var(--nasa-red)] border border-[var(--nasa-red)]/30"
                          : "bg-[var(--border)]/20 text-[var(--muted)] border border-[var(--border)]"
                      }
                    `}
                  >
                    Tier {tier}
                  </span>
                  <div>
                    <h3 className="text-base font-semibold">{TIER_NAMES[tier]}</h3>
                    <p className="font-mono text-[0.75rem] text-[var(--muted)]">
                      {TIER_DESCRIPTIONS[tier]}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {comingSoon && (
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[0.75rem] tracking-wider uppercase text-[var(--muted)]">
                        Coming Soon
                      </span>
                    </div>
                  )}
                  {!comingSoon && !unlocked && (
                    <div className="flex items-center gap-1.5">
                      <span className="status-dot status-dot--warning" />
                      <span className="font-mono text-[0.75rem] tracking-wider uppercase text-[var(--nasa-gold)]">
                        Locked — {required} stars from Tier {tier - 1}
                      </span>
                    </div>
                  )}
                  {!comingSoon && unlocked && (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[0.75rem] tracking-wider uppercase text-[var(--muted)]">
                        Progress
                      </span>
                      <div className="flex gap-0.5">
                        {Array.from({ length: maxStars }).map((_, i) => (
                          <div
                            key={i}
                            className={`w-1.5 h-3 rounded-[1px] ${
                              i < tierStars
                                ? "bg-[var(--nasa-gold)]"
                                : "bg-[var(--border)]"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="font-mono text-[0.75rem] text-[var(--nasa-gold)]">
                        {tierStars}/{maxStars}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Mission cards grid */}
            {comingSoon ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {tierMissions.map((mission, missionIdx) => (
                  <div
                    key={mission.id}
                    className="panel-glass opacity-40 animate-slide-up"
                    style={{ animationDelay: `${missionIdx * 50}ms` }}
                  >
                    <div className="p-4">
                      <span className="font-mono text-[0.7rem] tracking-[0.2em] uppercase text-[var(--muted)]">
                        {mission.codename}
                      </span>
                      <h4 className="text-base font-semibold mt-0.5 mb-3">
                        {mission.name}
                      </h4>
                      <div className="h-3 w-full bg-[var(--border)] rounded mb-1.5" />
                      <div className="h-3 w-3/4 bg-[var(--border)] rounded mb-3" />
                      <div className="pt-2 border-t border-[var(--border)]">
                        <div className="h-4 w-20 bg-[var(--border)] rounded" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {tierMissions.map((mission, missionIdx) => {
                const result = missionResults[mission.id];
                const isUnlocked = unlocked;

                return (
                  <div
                    key={mission.id}
                    className={`
                      panel-glass transition-all relative animate-slide-up
                      ${isUnlocked
                        ? "hover:border-[var(--nasa-red)]/40 hover:-translate-y-0.5 cursor-pointer group"
                        : "opacity-30 cursor-not-allowed"
                      }
                    `}
                    style={{ animationDelay: `${missionIdx * 50}ms` }}
                    onClick={() => isUnlocked && setSelectedMission(mission)}
                  >
                    {/* Top accent on hover */}
                    {isUnlocked && (
                      <div className="absolute top-0 left-0 right-0 h-[2px] bg-[var(--nasa-red)] opacity-0 group-hover:opacity-100 transition-opacity rounded-t-[4px]" />
                    )}

                    <div className="p-4">
                      {/* Designation + stars */}
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <span className="font-mono text-[0.7rem] tracking-[0.2em] uppercase text-[var(--nasa-blue-light)]">
                            {mission.codename}
                          </span>
                          <h4 className="text-base font-semibold mt-0.5">
                            {mission.name}
                          </h4>
                        </div>
                        <div className="flex gap-0.5 mt-0.5">
                          {[1, 2, 3].map((star) => (
                            <span
                              key={star}
                              className={`text-sm ${
                                result && result.stars >= star
                                  ? "star-filled"
                                  : "star-empty"
                              }`}
                            >
                              ★
                            </span>
                          ))}
                        </div>
                      </div>

                      <p className="text-[0.85rem] leading-relaxed text-[var(--muted)] line-clamp-2 mb-3">
                        {mission.description}
                      </p>

                      {/* Data strip */}
                      <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                        <div className="flex items-center gap-3">
                          <div>
                            <span className="font-mono text-[0.625rem] tracking-[0.15em] uppercase text-[var(--muted)] block">
                              Budget
                            </span>
                            <span className="font-mono text-[0.85rem] text-[var(--data)]">
                              ${(mission.budget / 1_000_000).toFixed(0)}M
                            </span>
                          </div>
                          {mission.requirements.minPayloadMass && (
                            <div>
                              <span className="font-mono text-[0.625rem] tracking-[0.15em] uppercase text-[var(--muted)] block">
                                Payload
                              </span>
                              <span className="font-mono text-[0.85rem] text-[var(--data)]">
                                {mission.requirements.minPayloadMass}kg
                              </span>
                            </div>
                          )}
                        </div>
                        {isUnlocked && (
                          <span
                            className="font-mono text-[0.75rem] tracking-[0.1em] uppercase px-3 py-1.5 bg-[var(--nasa-red)] group-hover:bg-[var(--nasa-red-dark)] text-white rounded-sm transition-colors"
                          >
                            {result ? "Retry" : "Launch"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        );
      })}
      </div>

      {/* Welcome modal — first visit only */}
      {showWelcome && (
        <WelcomeModal
          onClose={() => {
            setShowWelcome(false);
            localStorage.setItem("welcomeDismissed", "1");
          }}
        />
      )}

      {/* Mission brief modal */}
      {selectedMission && (
        <MissionBriefModal
          mission={selectedMission}
          previousResult={missionResults[selectedMission.id]}
          onClose={() => setSelectedMission(null)}
        />
      )}
    </div>
  );
}
