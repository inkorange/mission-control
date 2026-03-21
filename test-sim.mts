/**
 * Standalone autopilot simulation test — Lunar Lander mission.
 * Tests pitch profiles iteratively to find one that succeeds.
 *
 * Run: npx tsx --tsconfig tsconfig.json test-sim.mts
 */
import { FlightSimulator } from "./engine/simulation/FlightSimulator.js";
import { ENGINES } from "./engine/data/engines.js";
import { orbitalElementsFromState } from "./engine/physics/orbit.js";
import type { RocketConfig } from "./types/rocket.js";
import type { Mission } from "./types/mission.js";
import type { OrbitalElements } from "./types/physics.js";

// ── Autopilot helpers ─────────────────────────────────────────────────────────

function interpolate(profile: [number, number][], x: number): number {
  if (x <= profile[0][0]) return profile[0][1];
  if (x >= profile[profile.length - 1][0]) return profile[profile.length - 1][1];
  for (let i = 0; i < profile.length - 1; i++) {
    const [x0, y0] = profile[i];
    const [x1, y1] = profile[i + 1];
    if (x >= x0 && x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return profile[profile.length - 1][1];
}

// ── Mission ───────────────────────────────────────────────────────────────────

const mission: Mission = {
  id: "3-3",
  tier: 3,
  name: "Lunar Lander",
  codename: "EAGLE",
  description: "Deliver a 200kg payload to the lunar surface.",
  requirements: { targetBody: "moon", minPayloadMass: 200, maxBudget: 500_000_000 },
  budget: 500_000_000,
  availableEngines: ENGINES.filter((e) => e.tier <= 3).map((e) => e.id),
  availableParts: [],
  bonusChallenges: [],
  educationalTopics: [],
};

// ── Rockets ───────────────────────────────────────────────────────────────────

function makeConfig(label: string, stageSpecs: Array<{
  engineId: string; count: number; fuelMass: number; dryMass: number;
  fuelType?: "methane_lox" | "kerosene_lox" | "hydrogen_lox";
}>): { label: string; config: RocketConfig } {
  const stages = stageSpecs.map((s, i) => ({
    id: `s${i + 1}`,
    fuelType: (s.fuelType ?? "methane_lox") as any,
    engines: [{ engineId: s.engineId, count: s.count }],
    fuelMass: s.fuelMass, fuelCapacity: s.fuelMass,
    structuralMass: s.dryMass, partsCost: 0, tanks: [], parts: [],
  }));
  const totalWet = stages.reduce((a, s) => a + s.fuelMass + s.structuralMass, 0) + 200;
  const totalDry = stages.reduce((a, s) => a + s.structuralMass, 0) + 200;
  return {
    label,
    config: {
      id: "test", name: label, stages,
      payload: { name: "Lander", mass: 200 },
      totalCost: 0, totalMass: totalWet, totalDryMass: totalDry,
    },
  };
}

// Representative lunar stacks
const ROCKETS = [
  makeConfig("3-stage: 5×RaptorX / 1×RaptorX / 1×TitanRL2", [
    { engineId: "raptor-x", count: 5, fuelMass: 500_000, dryMass: 25_000 },
    { engineId: "raptor-x", count: 1, fuelMass: 80_000, dryMass: 5_000 },
    { engineId: "titan-rl2", count: 1, fuelMass: 10_000, dryMass: 2_000, fuelType: "hydrogen_lox" },
  ]),
  makeConfig("2-stage: 9×Kestrel9 / 1×RaptorX", [
    { engineId: "kestrel-9", count: 9, fuelMass: 500_000, dryMass: 50_000, fuelType: "kerosene_lox" },
    { engineId: "raptor-x", count: 1, fuelMass: 120_000, dryMass: 8_000 },
  ]),
  makeConfig("2-stage: 3×RaptorX / 1×RaptorX", [
    { engineId: "raptor-x", count: 3, fuelMass: 300_000, dryMass: 15_000 },
    { engineId: "raptor-x", count: 1, fuelMass: 80_000, dryMass: 5_000 },
  ]),
];

// ── Pitch profiles to test ────────────────────────────────────────────────────

const PROFILES: Array<{ name: string; fn: (alt: number, orb: OrbitalElements | null) => number }> = [
  {
    name: "CURRENT (gentle + 300km prograde switch)",
    fn: (alt, orb) => {
      const p: [number, number][] = [
        [0,0],[5_000,0],[10_000,5],[20_000,10],[40_000,18],
        [70_000,28],[100_000,38],[150_000,52],[220_000,68],
        [350_000,82],[500_000,90],
      ];
      if (orb && orb.periapsis > 80_000) return 90;
      if (alt > 300_000) return 90;
      return interpolate(p, alt);
    },
  },
  {
    name: "PROGRADE TRACKING (velocity-angle + 300km switch)",
    fn: (alt, orb) => {
      // Just use the gentle profile but switch to prograde at 200km
      const p: [number, number][] = [
        [0,0],[5_000,0],[10_000,5],[20_000,10],[40_000,18],
        [70_000,28],[100_000,38],[150_000,52],[200_000,68],
        [300_000,82],[400_000,90],
      ];
      if (orb && orb.periapsis > 80_000) return 90;
      if (alt > 200_000) return 90;
      return interpolate(p, alt);
    },
  },
  {
    name: "VERY GENTLE (max 25° at 100km)",
    fn: (alt, orb) => {
      const p: [number, number][] = [
        [0,0],[5_000,0],[10_000,3],[30_000,8],[60_000,15],
        [100_000,25],[150_000,38],[250_000,55],[400_000,75],[600_000,90],
      ];
      if (orb && orb.periapsis > 80_000) return 90;
      if (alt > 400_000) return 90;
      return interpolate(p, alt);
    },
  },
  {
    name: "APOAPSIS-GATED (pitch 90 when apo>200km & above atmo)",
    fn: (alt, orb) => {
      const p: [number, number][] = [
        [0,0],[5_000,0],[10_000,5],[20_000,10],[40_000,18],
        [70_000,28],[100_000,38],[150_000,52],[220_000,68],
        [350_000,82],[500_000,90],
      ];
      // Once we have a trajectory with apoapsis > 200km and we're above atmosphere, burn prograde
      if (orb && orb.apoapsis > 200_000 && alt > 100_000) return 90;
      return interpolate(p, alt);
    },
  },
];

// ── Simulation runner ─────────────────────────────────────────────────────────

interface RunResult {
  outcome: string;
  maxAlt: number;
  duration: number;
  dvUsed: number;
}

function runSim(config: RocketConfig, pitchFn: (alt: number, orb: OrbitalElements | null) => number): RunResult {
  const sim = new FlightSimulator(config, mission, ENGINES);
  sim.setTimeScale(500);
  sim.start();

  let maxAlt = 0;
  let lastPitch = -1;
  const MAX_TICKS = 500_000;
  let ticks = 0;

  while (sim.running && ticks < MAX_TICKS) {
    sim.tick(0.016);

    const history = sim.getResult().history;
    const snap = history[history.length - 1];
    if (!snap) { ticks++; continue; }

    const alt = snap.altitude;
    const orb = snap.orbitalElements;
    if (alt > maxAlt) maxAlt = alt;

    const rawPitch = pitchFn(alt, orb);
    const pitch = Math.round(rawPitch);
    if (pitch !== lastPitch) {
      sim.setPitchAngle(pitch);
      lastPitch = pitch;
    }

    ticks++;
  }

  const result = sim.getResult();
  return {
    outcome: result.outcome,
    maxAlt,
    duration: result.flightDuration,
    dvUsed: result.totalDeltaVUsed,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const icons: Record<string, string> = {
  mission_complete: "✅", orbit_achieved: "✅", target_reached: "🎯",
  crash: "💥", fuel_exhausted: "⛽", suborbital: "🌊", escaped: "🌌", aborted: "🛑",
};

console.log("=".repeat(70));
console.log("  LUNAR LANDER AUTOPILOT TEST");
console.log("=".repeat(70));

for (const { label, config } of ROCKETS) {
  const launchMass = config.stages.reduce((a, s) => a + s.fuelMass + s.structuralMass, 0) + 200;
  console.log(`\n🚀 Rocket: ${label}`);
  console.log(`   Launch mass: ${(launchMass / 1000).toFixed(0)} t`);

  for (const profile of PROFILES) {
    const r = runSim(config, profile.fn);
    const dur = `T+${String(Math.floor(r.duration / 60)).padStart(2, "0")}:${String(Math.floor(r.duration % 60)).padStart(2, "0")}`;
    const icon = icons[r.outcome] ?? "?";
    const altStr = r.maxAlt > 1_000_000 ? `${(r.maxAlt / 1_000_000).toFixed(2)} Mm` : `${(r.maxAlt / 1000).toFixed(1)} km`;
    console.log(`   ${icon} [${profile.name}]`);
    console.log(`      outcome=${r.outcome}  maxAlt=${altStr}  dur=${dur}  dv=${r.dvUsed.toFixed(0)}`);
  }
}
