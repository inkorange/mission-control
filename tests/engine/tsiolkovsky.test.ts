import { describe, it, expect } from "vitest";
import {
  deltaV,
  totalDeltaV,
  thrustToWeightRatio,
  massFlowRate,
  burnTime,
} from "@/engine/physics/tsiolkovsky";
import { G0 } from "@/engine/physics/constants";
import type { StageSpec } from "@/types/rocket";

describe("deltaV (Tsiolkovsky rocket equation)", () => {
  it("calculates Saturn V S-IC first stage delta-v correctly", () => {
    // Saturn V S-IC: Isp ~263s, wet mass ~2,290,000 kg
    // Payload above: ~700,000 kg (upper stages + payload)
    // Effective wet = 2,290,000 + 700,000 = 2,990,000 but for the stage itself:
    // Stage wet = 2,290,000, stage dry = ~131,000 + ~700,000 payload = ~831,000
    // For the stage alone: wet 2,290,000 dry 131,000 → but we test the function directly
    const dv = deltaV(263, 2_290_000, 750_000);
    // ln(2290000/750000) = ln(3.053) = 1.116
    // 263 * 9.80665 * 1.116 ≈ 2878 m/s
    expect(dv).toBeGreaterThan(2800);
    expect(dv).toBeLessThan(3000);
  });

  it("calculates a simple case correctly", () => {
    // Isp=300s, wet=1000kg, dry=400kg
    // Δv = 300 * 9.80665 * ln(1000/400) = 300 * 9.80665 * 0.9163 = 2694 m/s
    const dv = deltaV(300, 1000, 400);
    expect(dv).toBeCloseTo(2694, -1);
  });

  it("returns 0 when dry mass equals wet mass (no fuel)", () => {
    expect(deltaV(300, 1000, 1000)).toBe(0);
  });

  it("returns 0 when dry mass exceeds wet mass", () => {
    expect(deltaV(300, 100, 200)).toBe(0);
  });

  it("returns 0 when dry mass is zero or negative", () => {
    expect(deltaV(300, 100, 0)).toBe(0);
    expect(deltaV(300, 100, -50)).toBe(0);
  });
});

describe("totalDeltaV (multi-stage)", () => {
  it("calculates correctly for a two-stage rocket", () => {
    // Stage 1 (bottom): wet 10000, dry 2000, Isp 280
    // Stage 2 (top):    wet 3000,  dry 500,  Isp 350
    // Processing bottom-up:
    // Stage 1: payload above = 3000 (stage 2 wet)
    //   wet = 10000 + 3000 = 13000, dry = 2000 + 3000 = 5000
    //   Δv1 = 280 * 9.80665 * ln(13000/5000)
    // Stage 2: payload above = 0
    //   Δv2 = 350 * 9.80665 * ln(3000/500)
    const stages: StageSpec[] = [
      { wetMass: 10000, dryMass: 2000, isp: 280, thrustVacuum: 0, thrustSeaLevel: 0 },
      { wetMass: 3000, dryMass: 500, isp: 350, thrustVacuum: 0, thrustSeaLevel: 0 },
    ];

    const dv = totalDeltaV(stages);

    // Stage 1: 280 * 9.80665 * ln(13000/5000) = 280 * 9.80665 * 0.9555 = 2624
    const expectedStage1 = 280 * G0 * Math.log(13000 / 5000);
    // Stage 2: 350 * 9.80665 * ln(3000/500) = 350 * 9.80665 * 1.7918 = 6150
    const expectedStage2 = 350 * G0 * Math.log(3000 / 500);

    expect(dv).toBeCloseTo(expectedStage1 + expectedStage2, 0);
  });

  it("handles a single stage", () => {
    const stages: StageSpec[] = [
      { wetMass: 5000, dryMass: 1000, isp: 300, thrustVacuum: 0, thrustSeaLevel: 0 },
    ];
    const expected = 300 * G0 * Math.log(5000 / 1000);
    expect(totalDeltaV(stages)).toBeCloseTo(expected, 0);
  });

  it("returns 0 for empty stages", () => {
    expect(totalDeltaV([])).toBe(0);
  });
});

describe("thrustToWeightRatio", () => {
  it("returns > 1 when thrust exceeds weight", () => {
    // 100kN thrust, 5000kg mass → TWR = 100000 / (5000 * 9.80665) ≈ 2.04
    const twr = thrustToWeightRatio(100_000, 5000);
    expect(twr).toBeCloseTo(2.04, 1);
  });

  it("returns exactly 1 when thrust equals weight", () => {
    const mass = 1000;
    const thrust = mass * G0;
    expect(thrustToWeightRatio(thrust, mass)).toBeCloseTo(1, 5);
  });

  it("returns < 1 when thrust is insufficient", () => {
    const twr = thrustToWeightRatio(5000, 1000);
    expect(twr).toBeLessThan(1);
  });

  it("returns 0 for zero mass", () => {
    expect(thrustToWeightRatio(1000, 0)).toBe(0);
  });
});

describe("massFlowRate", () => {
  it("calculates correctly", () => {
    // ṁ = F / (Isp * g0) = 1000000 / (300 * 9.80665) ≈ 339.8 kg/s
    const rate = massFlowRate(1_000_000, 300);
    expect(rate).toBeCloseTo(339.8, 0);
  });

  it("returns 0 for zero Isp", () => {
    expect(massFlowRate(1000, 0)).toBe(0);
  });
});

describe("burnTime", () => {
  it("calculates correctly", () => {
    // 10000 kg fuel, 100 kg/s flow rate → 100 seconds
    expect(burnTime(10000, 100)).toBe(100);
  });

  it("returns 0 for zero flow rate", () => {
    expect(burnTime(10000, 0)).toBe(0);
  });
});
