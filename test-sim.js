#!/usr/bin/env node
/**
 * Self-contained Lunar Lander autopilot simulation test.
 * No TypeScript imports needed — pure physics in JS.
 *
 * Run: node test-sim.js
 */

// ── Constants ─────────────────────────────────────────────────────────────────
const G = 6.674e-11;
const EARTH_RADIUS = 6.371e6;
const EARTH_MU = G * 5.972e24; // 3.986e14
const EARTH_ROTATION = 465.1;
const MOON_DISTANCE = 384_400e3;
const MOON_MU = G * 7.342e22;
const MOON_RADIUS = 1.737e6;
const MOON_SOI = 66_100e3;
const MOON_ORBITAL_PERIOD = 27.322 * 86400;
const MOON_INITIAL_PHASE = (135 * Math.PI) / 180;
const G0 = 9.80665;
const SCALE_HEIGHT = 8500;
const SEA_LEVEL_DENSITY = 1.225;
const DRAG_COEFF = 0.05;
const CROSS_SECTION = 3;

// ── Math helpers ──────────────────────────────────────────────────────────────
const mag = (v) => Math.sqrt(v.x * v.x + v.y * v.y);
const norm = (v) => { const m = mag(v); return m > 0 ? { x: v.x/m, y: v.y/m } : { x:0, y:0 }; };
const add = (a, b) => ({ x: a.x+b.x, y: a.y+b.y });
const sub = (a, b) => ({ x: a.x-b.x, y: a.y-b.y });
const scale = (v, s) => ({ x: v.x*s, y: v.y*s });
const dot = (a, b) => a.x*b.x + a.y*b.y;
const cross2D = (a, b) => a.x*b.y - a.y*b.x;
const rotate = (v, angle) => ({
  x: v.x * Math.cos(angle) - v.y * Math.sin(angle),
  y: v.x * Math.sin(angle) + v.y * Math.cos(angle),
});
const toRad = (d) => d * Math.PI / 180;

// ── Atmosphere ────────────────────────────────────────────────────────────────
function atmDensity(alt) {
  if (alt < 0) return SEA_LEVEL_DENSITY;
  if (alt > 100_000) return 0;
  return SEA_LEVEL_DENSITY * Math.exp(-alt / SCALE_HEIGHT);
}

// ── Moon position ─────────────────────────────────────────────────────────────
function moonPos(t) {
  const angle = MOON_INITIAL_PHASE + (2 * Math.PI / MOON_ORBITAL_PERIOD) * t;
  return { x: MOON_DISTANCE * Math.cos(angle), y: MOON_DISTANCE * Math.sin(angle) };
}

// ── Orbital elements ──────────────────────────────────────────────────────────
function orbElems(pos, vel) {
  const r = mag(pos);
  const v = mag(vel);
  const energy = v*v/2 - EARTH_MU/r;
  if (energy >= 0) return null; // hyperbolic, unbound
  const a = -EARTH_MU / (2 * energy);
  const h = cross2D(pos, vel);
  const eVx = (v*v*pos.x - dot(pos,vel)*vel.x)/EARTH_MU - pos.x/r;
  const eVy = (v*v*pos.y - dot(pos,vel)*vel.y)/EARTH_MU - pos.y/r;
  const e = Math.sqrt(eVx*eVx + eVy*eVy);
  return {
    semiMajorAxis: a,
    eccentricity: e,
    apoapsis: a*(1+e) - EARTH_RADIUS,
    periapsis: a*(1-e) - EARTH_RADIUS,
    period: 2*Math.PI*Math.sqrt(a*a*a/EARTH_MU),
  };
}

// ── RK4 ───────────────────────────────────────────────────────────────────────
function accel(pos, vel, mass, thrust, moonPosition) {
  const r = mag(pos);
  if (r === 0 || mass <= 0) return { x:0, y:0 };

  // Earth gravity
  const gMag = EARTH_MU / (r*r);
  let a = scale(norm(pos), -gMag);

  // Moon gravity
  const toMoon = sub(pos, moonPosition);
  const dm = mag(toMoon);
  if (dm > 1) {
    const moonG = MOON_MU / (dm*dm);
    a = add(a, scale(norm(toMoon), -moonG));
  }

  // Drag
  const alt = r - EARTH_RADIUS;
  const speed = mag(vel);
  if (speed > 0 && alt > 0 && alt < 100_000) {
    const rho = atmDensity(alt);
    const dragMag = 0.5 * rho * speed*speed * DRAG_COEFF * CROSS_SECTION / mass;
    a = add(a, scale(norm(vel), -dragMag));
  }

  // Thrust
  a = add(a, scale(thrust, 1/mass));
  return a;
}

function rk4(state, dt, thrust, moonPosition) {
  const { pos, vel, mass } = state;
  const a1 = accel(pos, vel, mass, thrust, moonPosition);
  const pos2 = add(pos, scale(vel, dt/2));
  const vel2 = add(vel, scale(a1, dt/2));
  const a2 = accel(pos2, vel2, mass, thrust, moonPosition);
  const pos3 = add(pos, scale(vel2, dt/2));
  const vel3 = add(vel, scale(a2, dt/2));
  const a3 = accel(pos3, vel3, mass, thrust, moonPosition);
  const pos4 = add(pos, scale(vel3, dt));
  const vel4 = add(vel, scale(a3, dt));
  const a4 = accel(pos4, vel4, mass, thrust, moonPosition);

  return {
    pos: add(pos, scale(add(add(vel, scale(vel2,2)), add(scale(vel3,2), vel4)), dt/6)),
    vel: add(vel, scale(add(add(a1, scale(a2,2)), add(scale(a3,2), a4)), dt/6)),
    mass,
  };
}

// ── Autopilot profiles ────────────────────────────────────────────────────────
function interp(profile, x) {
  if (x <= profile[0][0]) return profile[0][1];
  if (x >= profile[profile.length-1][0]) return profile[profile.length-1][1];
  for (let i = 0; i < profile.length-1; i++) {
    const [x0,y0] = profile[i], [x1,y1] = profile[i+1];
    if (x >= x0 && x <= x1) return y0 + (x-x0)/(x1-x0)*(y1-y0);
  }
  return profile[profile.length-1][1];
}

const PROFILES = {
  "GENTLE + 300km switch": (alt, orb) => {
    const p = [[0,0],[5000,0],[10000,5],[20000,10],[40000,18],[70000,28],[100000,38],[150000,52],[220000,68],[350000,82],[500000,90]];
    if (orb && orb.periapsis > 80_000) return 90;
    if (alt > 300_000) return 90;
    return interp(p, alt);
  },
  "VERY GENTLE + 400km switch": (alt, orb) => {
    const p = [[0,0],[5000,0],[10000,3],[30000,8],[60000,15],[100000,25],[150000,38],[250000,55],[400000,75],[600000,90]];
    if (orb && orb.periapsis > 80_000) return 90;
    if (alt > 400_000) return 90;
    return interp(p, alt);
  },
  "OLD low_orbit profile": (alt, orb) => {
    const p = [[0,0],[5000,0],[8000,5],[15000,12],[30000,25],[50000,38],[70000,50],[90000,60],[100000,68],[120000,78],[140000,85],[160000,88],[180000,90]];
    if (orb && orb.periapsis > 80_000) return 90;
    return interp(p, alt);
  },
  // ── Prograde+floor variants — testing different high-altitude floor values ─
  // Goal: find the floor that works for both heavy (678t) and low-TWR rockets.
  // 65° crashed user's rocket at 250km. Pure prograde crashed at 928km.
  // Try 35°, 42°, 50°, 56° at 200km+.
  "PROGRADE+FLOOR-56": (alt, orb, vel, pos) => {
    if (orb && orb.periapsis > 80_000) return 90;
    if (vel && pos) {
      const rMag = Math.sqrt(pos.x*pos.x + pos.y*pos.y);
      if (rMag > 0) {
        const vr = (vel.x*pos.x + vel.y*pos.y) / rMag;
        const vt = (-vel.x*pos.y + vel.y*pos.x) / rMag;
        const vtEarned = vt - 465;
        if (alt < 1000) return 0;
        if (alt < 5000) return 3;
        const prog = Math.atan2(Math.max(0, vtEarned), Math.max(1, vr)) * (180/Math.PI);
        const fl = alt < 30_000 ? 8 : alt < 60_000 ? 18 : alt < 100_000 ? 28 : alt < 200_000 ? 42 : 56;
        return Math.max(prog, fl);
      }
    }
    const p = [[0,0],[5000,0],[10000,5],[20000,10],[40000,18],[70000,28],[100000,28],[150000,42],[200000,56],[400000,90]];
    return interp(p, alt);
  },
  "PROGRADE+FLOOR-50": (alt, orb, vel, pos) => {
    if (orb && orb.periapsis > 80_000) return 90;
    if (vel && pos) {
      const rMag = Math.sqrt(pos.x*pos.x + pos.y*pos.y);
      if (rMag > 0) {
        const vr = (vel.x*pos.x + vel.y*pos.y) / rMag;
        const vt = (-vel.x*pos.y + vel.y*pos.x) / rMag;
        const vtEarned = vt - 465;
        if (alt < 1000) return 0;
        if (alt < 5000) return 3;
        const prog = Math.atan2(Math.max(0, vtEarned), Math.max(1, vr)) * (180/Math.PI);
        const fl = alt < 30_000 ? 7 : alt < 60_000 ? 16 : alt < 100_000 ? 25 : alt < 200_000 ? 38 : 50;
        return Math.max(prog, fl);
      }
    }
    const p = [[0,0],[5000,0],[10000,4],[20000,9],[40000,16],[70000,23],[100000,25],[150000,38],[200000,50],[400000,90]];
    return interp(p, alt);
  },
  "PROGRADE+FLOOR-42": (alt, orb, vel, pos) => {
    if (orb && orb.periapsis > 80_000) return 90;
    if (vel && pos) {
      const rMag = Math.sqrt(pos.x*pos.x + pos.y*pos.y);
      if (rMag > 0) {
        const vr = (vel.x*pos.x + vel.y*pos.y) / rMag;
        const vt = (-vel.x*pos.y + vel.y*pos.x) / rMag;
        const vtEarned = vt - 465;
        if (alt < 1000) return 0;
        if (alt < 5000) return 3;
        const prog = Math.atan2(Math.max(0, vtEarned), Math.max(1, vr)) * (180/Math.PI);
        const fl = alt < 30_000 ? 6 : alt < 60_000 ? 14 : alt < 100_000 ? 22 : alt < 200_000 ? 33 : 42;
        return Math.max(prog, fl);
      }
    }
    const p = [[0,0],[5000,0],[10000,4],[20000,8],[40000,14],[70000,20],[100000,22],[150000,33],[200000,42],[400000,80],[600000,90]];
    return interp(p, alt);
  },
  "PROGRADE+FLOOR-35": (alt, orb, vel, pos) => {
    if (orb && orb.periapsis > 80_000) return 90;
    if (vel && pos) {
      const rMag = Math.sqrt(pos.x*pos.x + pos.y*pos.y);
      if (rMag > 0) {
        const vr = (vel.x*pos.x + vel.y*pos.y) / rMag;
        const vt = (-vel.x*pos.y + vel.y*pos.x) / rMag;
        const vtEarned = vt - 465;
        if (alt < 1000) return 0;
        if (alt < 5000) return 3;
        const prog = Math.atan2(Math.max(0, vtEarned), Math.max(1, vr)) * (180/Math.PI);
        const fl = alt < 30_000 ? 5 : alt < 60_000 ? 12 : alt < 100_000 ? 18 : alt < 200_000 ? 28 : 35;
        return Math.max(prog, fl);
      }
    }
    const p = [[0,0],[5000,0],[10000,3],[20000,7],[40000,12],[70000,17],[100000,18],[150000,28],[200000,35],[400000,70],[600000,90]];
    return interp(p, alt);
  },
  // ── Exact profile applied in page.tsx (smooth graduated floor v2) ─────
  // 35° at 200km (minimum to prevent Kestrel9 escape), rising gently to 75°
  // at 600km. Avoids the 200km→65° step that crashed user's rocket.
  "PAGE.TSX SMOOTH FLOOR v2": (alt, orb, vel, pos) => {
    if (orb && orb.periapsis > 80_000) return 90;
    if (vel && pos) {
      const rMag = Math.sqrt(pos.x*pos.x + pos.y*pos.y);
      if (rMag > 0) {
        const vr = (vel.x*pos.x + vel.y*pos.y) / rMag;
        const vt = (-vel.x*pos.y + vel.y*pos.x) / rMag;
        const vtEarned = vt - 465;
        if (alt < 1000) return 0;
        if (alt < 5000) return 3;
        const prog = Math.atan2(Math.max(0, vtEarned), Math.max(1, vr)) * (180/Math.PI);
        const floorPts = [[5000,3],[30000,5],[60000,12],[100000,18],[200000,35],[400000,60],[700000,78],[1000000,88]];
        const fl = interp(floorPts, alt);
        return Math.max(prog, fl);
      }
    }
    const p = [[0,0],[5000,3],[30000,5],[60000,12],[100000,18],[200000,35],[400000,60],[700000,78],[1000000,88]];
    return interp(p, alt);
  },
};

// ── Engine data ───────────────────────────────────────────────────────────────
const ENGINES_DATA = {
  "raptor-x":   { thrustSL: 2_200_000, thrustVac: 2_500_000, ispSL: 330, ispVac: 363 },
  "kestrel-9":  { thrustSL: 1_200_000, thrustVac: 1_340_000, ispSL: 289, ispVac: 316 },
  "kestrel-7":  { thrustSL: 1_300_000, thrustVac: 1_400_000, ispSL: 300, ispVac: 335 },
  "titan-rl2":  { thrustSL: 0,         thrustVac: 180_000,   ispSL: 0,   ispVac: 467 },
  "spartan-1":  { thrustSL: 1_200_000, thrustVac: 1_350_000, ispSL: 220, ispVac: 242 },
};

// ── Rocket configs ────────────────────────────────────────────────────────────
const ROCKETS = [
  {
    label: "3-stage: 5×RaptorX booster / 1×RaptorX upper / 1×TitanRL2 lander",
    stages: [
      { engineId:"raptor-x", count:5, fuelMass:500_000, dryMass:25_000 },
      { engineId:"raptor-x", count:1, fuelMass:80_000,  dryMass:5_000  },
      { engineId:"titan-rl2", count:1, fuelMass:10_000, dryMass:2_000  },
    ],
    payloadMass: 200,
  },
  {
    label: "2-stage: 9×Kestrel9 / 1×RaptorX",
    stages: [
      { engineId:"kestrel-9", count:9, fuelMass:500_000, dryMass:50_000 },
      { engineId:"raptor-x",  count:1, fuelMass:120_000, dryMass:8_000  },
    ],
    payloadMass: 200,
  },
  {
    label: "2-stage: 3×RaptorX / 1×RaptorX (leaner)",
    stages: [
      { engineId:"raptor-x", count:3, fuelMass:300_000, dryMass:15_000 },
      { engineId:"raptor-x", count:1, fuelMass:80_000,  dryMass:5_000  },
    ],
    payloadMass: 200,
  },
  // Low-TWR configs — simulate the "crash at 928km" scenario
  {
    label: "LOW-TWR: 1×RaptorX booster / 1×TitanRL2 upper (low dv)",
    stages: [
      { engineId:"raptor-x",  count:1, fuelMass:120_000, dryMass:6_000 },
      { engineId:"titan-rl2", count:1, fuelMass:20_000,  dryMass:2_000 },
    ],
    payloadMass: 200,
  },
  {
    label: "LOW-TWR: 2×RaptorX booster / 1×TitanRL2 upper",
    stages: [
      { engineId:"raptor-x",  count:2, fuelMass:200_000, dryMass:10_000 },
      { engineId:"titan-rl2", count:1, fuelMass:15_000,  dryMass:2_000  },
    ],
    payloadMass: 200,
  },
  {
    label: "LOW-TWR: 3×Kestrel9 / 1×TitanRL2",
    stages: [
      { engineId:"kestrel-9", count:3, fuelMass:200_000, dryMass:20_000 },
      { engineId:"titan-rl2", count:1, fuelMass:20_000,  dryMass:2_000  },
    ],
    payloadMass: 200,
  },
  // Reproducing "crash at 250km with 65° floor, 928km with prograde"
  // Key: stage 2 has TWR ~1.0-1.1 at 200km → 65° floor causes fast falling/crash
  {
    label: "CRASH-REPRO: 2×RaptorX booster (150t) / 1×RaptorX upper heavy (250t)",
    // S2 starts with TWR≈1.04 at 200km → floor-65 crashes, floor-35 survives
    stages: [
      { engineId:"raptor-x", count:2, fuelMass:150_000, dryMass:10_000 },
      { engineId:"raptor-x", count:1, fuelMass:250_000, dryMass:10_000 },
    ],
    payloadMass: 200,
  },
  {
    label: "CRASH-REPRO: 3×Kestrel9 booster (250t) / 1×RaptorX upper (220t)",
    // S2 starts with TWR≈1.08 at 200km
    stages: [
      { engineId:"kestrel-9", count:3, fuelMass:250_000, dryMass:20_000 },
      { engineId:"raptor-x",  count:1, fuelMass:220_000, dryMass:10_000 },
    ],
    payloadMass: 200,
  },
  {
    label: "CRASH-REPRO: 5×Kestrel9 booster / 1×RaptorX upper (heavy payload 1t)",
    stages: [
      { engineId:"kestrel-9", count:5, fuelMass:400_000, dryMass:40_000 },
      { engineId:"raptor-x",  count:1, fuelMass:80_000,  dryMass:5_000  },
    ],
    payloadMass: 1_000,
  },
];

// ── Simulation ────────────────────────────────────────────────────────────────
function simulate(rocket, pitchFn, profileName) {
  const DT = 0.1; // physics timestep (s)
  const TIME_SCALE = 500; // sim-seconds per real-second

  // Build stage runtimes
  const stages = rocket.stages.map(s => {
    const eng = ENGINES_DATA[s.engineId];
    const thrustVac = eng.thrustVac * s.count;
    const thrustSL  = eng.thrustSL  * s.count;
    const avgIspVac = eng.ispVac;
    const avgIspSL  = eng.ispSL;
    return { thrustVac, thrustSL, avgIspVac, avgIspSL, fuelRemaining: s.fuelMass, dryMass: s.dryMass };
  });
  const totalMass = stages.reduce((a,s) => a + s.fuelRemaining + s.dryMass, 0) + rocket.payloadMass;

  // State
  let pos = { x: EARTH_RADIUS, y: 0 };
  let vel = { x: 0, y: EARTH_ROTATION };
  let mass = totalMass;
  let t = 0;
  let stageIdx = 0;
  let pitchDeg = 0;
  let throttleLocked = false;
  let throttle = 1;
  let maxAlt = 0;
  let outcome = null;
  let dvUsed = 0;
  let lastSpeed = mag(vel);

  const MOON_TRANSFER_APOAPSIS = MOON_DISTANCE; // body.orbitRadius = MOON_DISTANCE for Moon

  const MAX_SIM_TIME = 3600 * 24 * 3; // 3 days max

  while (t < MAX_SIM_TIME && !outcome) {
    // Current stage
    const stage = stages[stageIdx];
    if (!stage) { outcome = "fuel_exhausted"; break; }

    // Moon position
    const mp = moonPos(t);

    // Alt and orbital elements
    const r = mag(pos);
    const alt = r - EARTH_RADIUS;
    if (alt > maxAlt) maxAlt = alt;

    // Orbital elements (computed when above 50km)
    let orb = null;
    if (alt > 50_000) {
      orb = orbElems(pos, vel);
    }

    // Autopilot pitch (pass vel and pos for prograde-tracking profiles)
    pitchDeg = pitchFn(alt, orb, vel, pos);

    // === TLI AUTO-CUTOFF (mirrors FlightSimulator) ===
    if (alt > 100_000 && !throttleLocked && orb) {
      // For Moon mission: cut when apoapsis reaches Moon's orbit
      if (orb.apoapsis >= MOON_TRANSFER_APOAPSIS) {
        throttle = 0;
        throttleLocked = true;
        outcome = "mission_complete";
        break;
      }
    }

    // Effective thrust (linear interpolation by altitude)
    const altFrac = Math.min(1, alt / 100_000);
    const effectiveThrust = stage.thrustSL + (stage.thrustVac - stage.thrustSL) * altFrac;
    const effectiveIsp = stage.avgIspSL + (stage.avgIspVac - stage.avgIspSL) * altFrac;

    // Thrust vector
    let thrustVec = { x: 0, y: 0 };
    if (stage.fuelRemaining > 0 && throttle > 0) {
      const currentThrust = effectiveThrust * throttle;
      const radialDir = norm(pos);
      const pitchRad = toRad(pitchDeg);
      const thrustDir = rotate(radialDir, -pitchRad);
      thrustVec = scale(thrustDir, currentThrust);

      // Fuel consumption
      const flowRate = currentThrust / (effectiveIsp * G0);
      const fuelConsumed = Math.min(flowRate * DT, stage.fuelRemaining);
      stage.fuelRemaining -= fuelConsumed;
      mass -= fuelConsumed;
    }

    // Auto-stage
    if (stage.fuelRemaining <= 0 && stageIdx < stages.length - 1) {
      mass -= stage.dryMass;
      stageIdx++;
    }

    // Integrate
    const newState = rk4({ pos, vel, mass }, DT, thrustVec, mp);
    pos = newState.pos;
    vel = newState.vel;
    mass = newState.mass;
    t += DT;

    // Delta-V tracking
    const speed = mag(vel);
    dvUsed += Math.abs(speed - lastSpeed);
    lastSpeed = speed;

    // Crash check
    const newAlt = mag(pos) - EARTH_RADIUS;
    if (newAlt < 0) {
      outcome = "crash";
      break;
    }

    // Escape check
    if (newAlt > 500_000_000) {
      outcome = "escaped";
      break;
    }
  }

  if (!outcome) outcome = "timeout";
  return { outcome, maxAlt, duration: t, dvUsed };
}

// ── Main ──────────────────────────────────────────────────────────────────────
const ICONS = { mission_complete:"✅", orbit_achieved:"✅", target_reached:"🎯", crash:"💥", fuel_exhausted:"⛽", timeout:"⏱️", escaped:"🌌" };

console.log("=".repeat(72));
console.log("  LUNAR LANDER AUTOPILOT SIMULATION TEST");
console.log("=".repeat(72));

for (const rocket of ROCKETS) {
  const launchMass = rocket.stages.reduce((a,s) => a + s.fuelMass + s.dryMass, 0) + rocket.payloadMass;
  console.log(`\n🚀 ${rocket.label}`);
  console.log(`   Launch mass: ${(launchMass/1000).toFixed(0)} t`);

  for (const [name, fn] of Object.entries(PROFILES)) {
    const r = simulate(rocket, fn, name);
    const dur = `T+${String(Math.floor(r.duration/60)).padStart(2,"0")}:${String(Math.floor(r.duration%60)).padStart(2,"0")}`;
    const altStr = r.maxAlt > 1_000_000 ? `${(r.maxAlt/1_000_000).toFixed(1)} Mm` : `${(r.maxAlt/1000).toFixed(1)} km`;
    const icon = ICONS[r.outcome] ?? "?";
    console.log(`   ${icon} [${name}]`);
    console.log(`      outcome=${r.outcome}  maxAlt=${altStr}  dur=${dur}  dv=${r.dvUsed.toFixed(0)}`);
  }
}

// ── Additional targeted tests ─────────────────────────────────────────────────
console.log("\n" + "=".repeat(72));
console.log("  TARGETED: What crashes at ~106 km?");
console.log("=".repeat(72));

// Test: Titan RL-2 upper stage with various fuel loads (common mistake)
const titanUpper = [
  { fuel: 5_000, label: "TitanRL2 upper 5t fuel (≈87t launch)" },
  { fuel: 15_000, label: "TitanRL2 upper 15t fuel (≈97t launch)" },
  { fuel: 30_000, label: "TitanRL2 upper 30t fuel (≈112t launch)" },
  { fuel: 50_000, label: "TitanRL2 upper 50t fuel (≈132t launch)" },
];

for (const { fuel, label } of titanUpper) {
  const rocket = {
    label,
    stages: [
      { engineId:"raptor-x", count:1, fuelMass:80_000, dryMass:5_000 },
      { engineId:"titan-rl2", count:1, fuelMass:fuel,  dryMass:2_000 },
    ],
    payloadMass: 200,
  };
  const r = simulate(rocket, PROFILES["GENTLE + 300km switch"], "GENTLE+300km");
  const dur = `T+${String(Math.floor(r.duration/60)).padStart(2,"0")}:${String(Math.floor(r.duration%60)).padStart(2,"0")}`;
  const altStr = r.maxAlt > 1_000_000 ? `${(r.maxAlt/1_000_000).toFixed(1)} Mm` : `${(r.maxAlt/1000).toFixed(1)} km`;
  const icon = ICONS[r.outcome] ?? "?";
  console.log(`${icon} [${label}]  outcome=${r.outcome}  maxAlt=${altStr}  dur=${dur}`);
}

// Test: Heavy first stage with Titan RL-2 lander stage
console.log();
const heavyS1configs = [
  { label: "3×RaptorX-S1 / TitanRL2-S2 30t fuel", stages: [
    { engineId:"raptor-x", count:3, fuelMass:250_000, dryMass:15_000 },
    { engineId:"titan-rl2", count:1, fuelMass:30_000, dryMass:2_000 },
  ]},
  { label: "3×RaptorX-S1 / TitanRL2-S2 10t fuel", stages: [
    { engineId:"raptor-x", count:3, fuelMass:250_000, dryMass:15_000 },
    { engineId:"titan-rl2", count:1, fuelMass:10_000, dryMass:2_000 },
  ]},
  { label: "5×Kestrel9-S1 / TitanRL2-S2 20t fuel", stages: [
    { engineId:"kestrel-9", count:5, fuelMass:300_000, dryMass:30_000 },
    { engineId:"titan-rl2", count:1, fuelMass:20_000, dryMass:2_000 },
  ]},
  { label: "5×Kestrel9-S1 / RaptorX-S2 50t fuel", stages: [
    { engineId:"kestrel-9", count:5, fuelMass:300_000, dryMass:30_000 },
    { engineId:"raptor-x", count:1, fuelMass:50_000, dryMass:5_000 },
  ]},
];

for (const { label, stages } of heavyS1configs) {
  const rocket = { label, stages, payloadMass: 200 };
  for (const [pname, fn] of [["OLD", PROFILES["OLD low_orbit profile"]], ["GENTLE+300km", PROFILES["GENTLE + 300km switch"]]]) {
    const r = simulate(rocket, fn, pname);
    const dur = `T+${String(Math.floor(r.duration/60)).padStart(2,"0")}:${String(Math.floor(r.duration%60)).padStart(2,"0")}`;
    const altStr = r.maxAlt > 1_000_000 ? `${(r.maxAlt/1_000_000).toFixed(1)} Mm` : `${(r.maxAlt/1000).toFixed(1)} km`;
    const icon = ICONS[r.outcome] ?? "?";
    console.log(`${icon} [${pname}] ${label}  outcome=${r.outcome}  maxAlt=${altStr}  dur=${dur}`);
  }
  console.log();
}

// ── Single stage / simple builds a new player might try ──────────────────────
console.log("\n" + "=".repeat(72));
console.log("  SINGLE STAGE / NAIVE BUILDS — finding 106km crash pattern");
console.log("=".repeat(72));

const naiveConfigs = [
  { label: "1×RaptorX, 150t fuel single stage", stages: [
    { engineId:"raptor-x", count:1, fuelMass:150_000, dryMass:5_000 },
  ]},
  { label: "1×RaptorX, 200t fuel single stage", stages: [
    { engineId:"raptor-x", count:1, fuelMass:200_000, dryMass:8_000 },
  ]},
  { label: "2×RaptorX, 300t fuel single stage", stages: [
    { engineId:"raptor-x", count:2, fuelMass:300_000, dryMass:12_000 },
  ]},
  { label: "2×Kestrel9, 200t fuel + RaptorX upper 30t", stages: [
    { engineId:"kestrel-9", count:2, fuelMass:200_000, dryMass:15_000, fuelType:"kerosene_lox" },
    { engineId:"raptor-x", count:1, fuelMass:30_000, dryMass:3_000 },
  ]},
  { label: "3×Kestrel9, 300t fuel + TitanRL2 upper 15t", stages: [
    { engineId:"kestrel-9", count:3, fuelMass:300_000, dryMass:20_000, fuelType:"kerosene_lox" },
    { engineId:"titan-rl2", count:1, fuelMass:15_000, dryMass:1_500 },
  ]},
  { label: "2×RaptorX, 200t fuel + RaptorX upper 50t + TitanRL2 10t", stages: [
    { engineId:"raptor-x", count:2, fuelMass:200_000, dryMass:12_000 },
    { engineId:"raptor-x", count:1, fuelMass:50_000, dryMass:3_500 },
    { engineId:"titan-rl2", count:1, fuelMass:10_000, dryMass:1_000 },
  ]},
];

for (const { label, stages } of naiveConfigs) {
  const rocket = { label, stages, payloadMass: 200 };
  const launchMass = stages.reduce((a,s) => a + s.fuelMass + s.dryMass, 0) + 200;
  process.stdout.write(`\n🚀 ${label} (${(launchMass/1000).toFixed(0)}t)\n`);
  for (const [pname, fn] of [["OLD", PROFILES["OLD low_orbit profile"]], ["GENTLE+300km", PROFILES["GENTLE + 300km switch"]]]) {
    const r = simulate(rocket, fn, pname);
    const dur = `T+${String(Math.floor(r.duration/60)).padStart(2,"0")}:${String(Math.floor(r.duration%60)).padStart(2,"0")}`;
    const altStr = r.maxAlt > 1_000_000 ? `${(r.maxAlt/1_000_000).toFixed(1)} Mm` : `${(r.maxAlt/1000).toFixed(1)} km`;
    const icon = ICONS[r.outcome] ?? "?";
    process.stdout.write(`   ${icon} [${pname}]  ${r.outcome}  maxAlt=${altStr}  dur=${dur}  dv=${r.dvUsed.toFixed(0)}\n`);
  }
}

// ── Find a universal profile ──────────────────────────────────────────────────
console.log("\n" + "=".repeat(72));
console.log("  UNIVERSAL PROFILE SEARCH");
console.log("=".repeat(72));

const testRockets = [
  { label: "5×RaptorX / RaptorX / TitanRL2 (622t)", stages: [
    { engineId:"raptor-x", count:5, fuelMass:500_000, dryMass:25_000 },
    { engineId:"raptor-x", count:1, fuelMass:80_000,  dryMass:5_000  },
    { engineId:"titan-rl2", count:1, fuelMass:10_000, dryMass:2_000  },
  ], payloadMass:200 },
  { label: "9×Kestrel9 / RaptorX (678t)", stages: [
    { engineId:"kestrel-9", count:9, fuelMass:500_000, dryMass:50_000, fuelType:"kerosene_lox" },
    { engineId:"raptor-x",  count:1, fuelMass:120_000, dryMass:8_000  },
  ], payloadMass:200 },
  { label: "3×RaptorX / RaptorX (400t)", stages: [
    { engineId:"raptor-x", count:3, fuelMass:300_000, dryMass:15_000 },
    { engineId:"raptor-x", count:1, fuelMass:80_000,  dryMass:5_000  },
  ], payloadMass:200 },
  { label: "3×Kestrel9 / TitanRL2 (337t)", stages: [
    { engineId:"kestrel-9", count:3, fuelMass:300_000, dryMass:20_000, fuelType:"kerosene_lox" },
    { engineId:"titan-rl2", count:1, fuelMass:15_000, dryMass:1_500  },
  ], payloadMass:200 },
];

// Profile: velocity-vector-driven (actual prograde tracking)
// Track the angle of the velocity vector from vertical
function progradePitch(pos, vel) {
  if (!pos || !vel) return 0;
  const r = Math.sqrt(pos.x**2 + pos.y**2);
  if (r === 0) return 0;
  // Radial velocity (outward from Earth)
  const vr = (vel.x*pos.x + vel.y*pos.y) / r;
  // Tangential velocity (prograde)
  const vt = (-vel.x*pos.y + vel.y*pos.x) / r;
  // Subtract Earth rotation contribution to tangential (~465 m/s) to get "earned" horizontal vel
  const vtEarned = vt - 465;
  // Pitch = angle of velocity from vertical (radial direction)
  // Use earned horizontal vel to avoid pitching toward Earth rotation at launch
  const angle = Math.atan2(Math.max(0, vtEarned), Math.max(1, vr)) * (180 / Math.PI);
  return Math.max(0, Math.min(90, angle));
}

// Modified simulate that returns pos/vel info  
function simulate2(rocket, pitchFn) {
  const DT = 0.1;
  const stages = rocket.stages.map(s => {
    const eng = ENGINES_DATA[s.engineId];
    return { thrustVac: eng.thrustVac * s.count, thrustSL: eng.thrustSL * s.count,
             avgIspVac: eng.ispVac, avgIspSL: eng.ispSL, 
             fuelRemaining: s.fuelMass, dryMass: s.dryMass };
  });
  const totalMass = stages.reduce((a,s) => a + s.fuelRemaining + s.dryMass, 0) + rocket.payloadMass;
  let pos = { x: EARTH_RADIUS, y: 0 }, vel = { x: 0, y: EARTH_ROTATION };
  let mass = totalMass, t = 0, stageIdx = 0, pitchDeg = 0, throttleLocked = false, throttle = 1;
  let maxAlt = 0, outcome = null, dvUsed = 0, lastSpeed = EARTH_ROTATION;
  const MAX_SIM_TIME = 3600 * 24 * 3;

  while (t < MAX_SIM_TIME && !outcome) {
    const stage = stages[stageIdx];
    if (!stage) { outcome = "fuel_exhausted"; break; }
    const mp = moonPos(t);
    const r = Math.sqrt(pos.x**2 + pos.y**2);
    const alt = r - EARTH_RADIUS;
    if (alt > maxAlt) maxAlt = alt;
    let orb = null;
    if (alt > 50_000) orb = orbElems(pos, vel);
    
    // Autopilot pitch  
    pitchDeg = pitchFn(alt, orb, pos, vel);
    
    // TLI auto-cutoff
    if (alt > 100_000 && !throttleLocked && orb) {
      if (orb.apoapsis >= MOON_DISTANCE) {
        throttle = 0; throttleLocked = true; outcome = "mission_complete"; break;
      }
    }
    
    const altFrac = Math.min(1, alt / 100_000);
    const effectiveThrust = stage.thrustSL + (stage.thrustVac - stage.thrustSL) * altFrac;
    const effectiveIsp = stage.avgIspSL + (stage.avgIspVac - stage.avgIspSL) * altFrac;
    let thrustVec = { x: 0, y: 0 };
    if (stage.fuelRemaining > 0 && throttle > 0) {
      const ct = effectiveThrust * throttle;
      const rd = { x: pos.x/r, y: pos.y/r };
      const pitchRad = pitchDeg * Math.PI / 180;
      const td = { x: rd.x*Math.cos(-pitchRad)-rd.y*Math.sin(-pitchRad), y: rd.x*Math.sin(-pitchRad)+rd.y*Math.cos(-pitchRad) };
      thrustVec = { x: td.x*ct, y: td.y*ct };
      const fr = ct / (effectiveIsp * G0);
      const fc = Math.min(fr * DT, stage.fuelRemaining);
      stage.fuelRemaining -= fc; mass -= fc;
    }
    if (stage.fuelRemaining <= 0 && stageIdx < stages.length - 1) { mass -= stage.dryMass; stageIdx++; }
    const ns = rk4({ pos, vel, mass }, DT, thrustVec, mp);
    pos = ns.pos; vel = ns.vel; mass = ns.mass; t += DT;
    const speed = Math.sqrt(vel.x**2+vel.y**2);
    dvUsed += Math.abs(speed - lastSpeed); lastSpeed = speed;
    if (Math.sqrt(pos.x**2+pos.y**2) - EARTH_RADIUS < 0) { outcome = "crash"; break; }
    if (Math.sqrt(pos.x**2+pos.y**2) - EARTH_RADIUS > 500e6) { outcome = "escaped"; break; }
  }
  if (!outcome) outcome = "timeout";
  return { outcome, maxAlt, duration: t, dvUsed };
}

const universalProfiles = {
  "PROGRADE TRACKING (velocity angle)": (alt, orb, pos, vel) => {
    if (orb && orb.periapsis > 80_000) return 90;
    if (alt < 1_000) return 0;
    if (alt < 5_000) return 3; // initial kick
    return progradePitch(pos, vel);
  },
  "OLD profile (baseline)": (alt, orb) => {
    const p = [[0,0],[5000,0],[8000,5],[15000,12],[30000,25],[50000,38],[70000,50],[90000,60],[100000,68],[120000,78],[140000,85],[160000,88],[180000,90]];
    if (orb && orb.periapsis > 80_000) return 90;
    return interp(p, alt);
  },
  "APO-GATED (alt>150km gate)": (alt, orb) => {
    const p = [[0,0],[5000,0],[8000,5],[15000,12],[30000,25],[50000,38],[70000,50],[90000,60],[100000,68],[120000,78],[140000,85],[160000,88],[180000,90]];
    if (orb && orb.periapsis > 80_000) return 90;
    if (alt > 150_000 && orb && orb.apoapsis > 200_000) return 90;
    return interp(p, alt);
  },
};

for (const [pname, fn] of Object.entries(universalProfiles)) {
  process.stdout.write(`\n[${pname}]\n`);
  for (const rocket of testRockets) {
    const r = simulate2(rocket, fn);
    const dur = `T+${String(Math.floor(r.duration/60)).padStart(2,"0")}:${String(Math.floor(r.duration%60)).padStart(2,"0")}`;
    const altStr = r.maxAlt > 1_000_000 ? `${(r.maxAlt/1_000_000).toFixed(1)} Mm` : `${(r.maxAlt/1000).toFixed(1)} km`;
    const icon = ICONS[r.outcome] ?? "?";
    process.stdout.write(`  ${icon} ${rocket.label}  ${r.outcome}  maxAlt=${altStr}  dur=${dur}\n`);
  }
}
