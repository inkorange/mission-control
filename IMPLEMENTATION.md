# Mission Control: Implementation Guide

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Architecture & Data Flow](#4-architecture--data-flow)
5. [Phase 1 — Foundation & Physics Engine](#5-phase-1--foundation--physics-engine)
6. [Phase 2 — Rocket Builder](#6-phase-2--rocket-builder)
7. [Phase 3 — Launch Simulation](#7-phase-3--launch-simulation)
8. [Phase 4 — Missions & Progression](#8-phase-4--missions--progression)
9. [Phase 5 — Scoring, Debrief & Education](#9-phase-5--scoring-debrief--education)
10. [Phase 6 — Leaderboard & Auth (Future)](#10-phase-6--leaderboard--auth-future)
11. [Data Architecture](#11-data-architecture)
12. [Physics Reference](#12-physics-reference)
13. [Component Map](#13-component-map)
14. [Asset Requirements](#14-asset-requirements)
15. [Testing Strategy](#15-testing-strategy)

---

## 1. Project Overview

**Mission Control** is a browser-based rocket engineering game where players design, build, and launch rockets to complete progressively harder space missions. The game teaches real orbital mechanics through experimentation and failure — not textbooks.

**Core Loop:** Receive mission brief → Design rocket in builder → Launch and fly → Score and debrief → Unlock next tier.

**Target:** Desktop-first web app (responsive down to tablet). Deployed on Vercel.

---

## 2. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | **Next.js 16 (App Router)** | SSR, file-based routing, API routes for future backend |
| UI | **React 19 + TypeScript** | Type safety, React Compiler optimizations |
| 3D Engine | **Three.js via React Three Fiber** | Proven in your solar project, declarative 3D |
| 3D Utilities | **@react-three/drei, @react-three/postprocessing** | Camera controls, effects, helpers |
| State | **Zustand** | Lightweight, no boilerplate, works outside React tree |
| Drag & Drop | **@dnd-kit/core + @dnd-kit/sortable** | Accessible, performant, great for vertical stacking |
| Styling | **Tailwind CSS + SCSS modules** | Utility-first with scoped overrides for complex UI |
| Physics Math | **Custom engine (no library)** | Orbital mechanics are specialized; general physics libs add overhead |
| Charts | **Recharts or visx** | For trajectory plots, delta-v readouts, scoring graphs |
| Persistence | **localStorage (now) → Supabase (later)** | Abstracted behind a data access layer |
| Testing | **Vitest + React Testing Library + Playwright** | Unit for physics, component tests, E2E for flows |
| Deploy | **Vercel** | Zero-config for Next.js |

### Key Dependencies (package.json)

```json
{
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "three": "^0.172.0",
    "@react-three/fiber": "^9.0.0",
    "@react-three/drei": "^10.0.0",
    "@react-three/postprocessing": "^3.0.0",
    "zustand": "^5.0.0",
    "@dnd-kit/core": "^6.0.0",
    "@dnd-kit/sortable": "^8.0.0",
    "recharts": "^2.15.0",
    "tailwindcss": "^4.0.0",
    "sass": "^1.80.0"
  }
}
```

---

## 3. Project Structure

```
mission-control/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (fonts, providers, nav)
│   ├── page.tsx                  # Landing / mission select
│   ├── builder/
│   │   └── [missionId]/
│   │       └── page.tsx          # Rocket builder for a specific mission
│   ├── launch/
│   │   └── [missionId]/
│   │       └── page.tsx          # Launch simulation view
│   ├── debrief/
│   │   └── [missionId]/
│   │       └── page.tsx          # Post-mission scoring & education
│   └── api/                      # Future: leaderboard endpoints
│       └── scores/
│           └── route.ts
│
├── components/
│   ├── builder/                  # Rocket assembly UI
│   │   ├── RocketCanvas.tsx      # 3D preview of assembled rocket
│   │   ├── PartsPanel.tsx        # Draggable parts catalog
│   │   ├── StageStack.tsx        # Vertical stage assembly area
│   │   ├── PartCard.tsx          # Individual part (drag source)
│   │   ├── StatsPanel.tsx        # Live mass/thrust/delta-v readouts
│   │   └── BudgetBar.tsx         # Budget remaining indicator
│   │
│   ├── launch/                   # Flight simulation UI
│   │   ├── FlightScene.tsx       # R3F 3D scene (rocket, Earth, trajectory)
│   │   ├── TrajectoryOverlay.tsx # 2D HUD: altitude, velocity, apoapsis
│   │   ├── Timeline.tsx          # Event timeline (stage sep, burns)
│   │   ├── Telemetry.tsx         # Live flight data readouts
│   │   └── FlightControls.tsx    # Manual burn/separation triggers
│   │
│   ├── debrief/                  # Post-mission screens
│   │   ├── ScoreCard.tsx         # Star rating + breakdown
│   │   ├── TrajectoryReplay.tsx  # Actual vs optimal trajectory
│   │   └── PhysicsExplainer.tsx  # Educational content per mission
│   │
│   ├── missions/                 # Mission selection
│   │   ├── MissionGrid.tsx       # Mission cards with lock/unlock state
│   │   └── MissionBrief.tsx      # Detailed brief modal
│   │
│   └── ui/                       # Shared UI primitives
│       ├── Button.tsx
│       ├── Modal.tsx
│       ├── ProgressRing.tsx
│       └── Tooltip.tsx
│
├── engine/                       # Physics & simulation (pure logic, no React)
│   ├── physics/
│   │   ├── constants.ts          # G, Earth mass/radius, atmospherics
│   │   ├── tsiolkovsky.ts        # Rocket equation calculations
│   │   ├── orbit.ts              # Keplerian elements, patched conics
│   │   ├── atmosphere.ts         # Drag model, pressure curve
│   │   ├── gravity.ts            # Gravitational acceleration by altitude
│   │   └── trajectory.ts         # Numerical integration (RK4)
│   │
│   ├── simulation/
│   │   ├── FlightSimulator.ts    # Main simulation loop (tick-based)
│   │   ├── RocketState.ts        # Current mass, fuel, velocity, position
│   │   ├── Event.ts              # Staging events, burn start/stop
│   │   └── Scoring.ts            # Score calculation from flight data
│   │
│   └── data/
│       ├── engines.ts            # Engine catalog (thrust, Isp, mass, cost)
│       ├── fuels.ts              # Fuel types (density, cost per kg)
│       ├── parts.ts              # Structural parts (fairings, adapters, etc.)
│       └── missions.ts           # Mission definitions & requirements
│
├── stores/                       # Zustand stores
│   ├── useBuilderStore.ts        # Rocket assembly state
│   ├── useFlightStore.ts         # Active simulation state
│   ├── useProgressionStore.ts    # Unlocked missions, stars earned
│   └── useMissionStore.ts        # Current mission brief
│
├── lib/                          # Utilities & data access
│   ├── persistence.ts            # Abstract save/load (localStorage now, Supabase later)
│   ├── formatters.ts             # Number formatting (km, m/s, $)
│   └── math.ts                   # Vector math, interpolation helpers
│
├── types/                        # Shared TypeScript types
│   ├── rocket.ts                 # RocketConfig, Stage, Part, Engine
│   ├── mission.ts                # Mission, MissionRequirements, MissionTier
│   ├── physics.ts                # Vector2D, OrbitalElements, FlightData
│   └── scoring.ts                # ScoreBreakdown, StarRating
│
├── public/
│   ├── models/                   # 3D models (.glb) — rocket parts, Earth
│   ├── textures/                 # Planet textures, skybox
│   └── audio/                    # Engine sounds, UI feedback (optional)
│
├── styles/
│   └── globals.scss              # Global styles, CSS custom properties
│
└── tests/
    ├── engine/                   # Unit tests for physics & simulation
    │   ├── tsiolkovsky.test.ts
    │   ├── orbit.test.ts
    │   └── simulation.test.ts
    └── e2e/                      # Playwright end-to-end tests
        ├── builder.spec.ts
        └── launch.spec.ts
```

---

## 4. Architecture & Data Flow

### State Flow

```
Mission Select → Builder → Launch → Debrief
     │              │          │         │
     │              │          │         │
  [useMissionStore] │   [useFlightStore] │
     │              │          │         │
     └──────────────┴──────────┴─────────┘
                        │
               [useProgressionStore]
                        │
                [persistence.ts]
                        │
              localStorage / Supabase
```

### Builder → Launch Data Handoff

The builder produces a `RocketConfig` object:

```typescript
interface RocketConfig {
  stages: Stage[];        // Bottom-up order (first stage at index 0)
  payload: Payload;       // Mass and dimensions
  totalCost: number;
  totalMass: number;      // Wet mass (fuel included)
  totalDryMass: number;   // Without fuel
}

interface Stage {
  id: string;
  engines: EngineConfig[];   // Engine type + count
  fuelType: FuelType;
  fuelMass: number;          // kg
  structuralMass: number;    // kg (tanks, interstage, etc.)
  fairings?: FairingConfig;  // Only on top stage
}
```

This config is passed to the `FlightSimulator`, which runs a tick-based numerical integration and outputs `FlightData[]` — an array of snapshots at each timestep.

### Simulation Architecture

The flight simulation runs **decoupled from the render loop**:

- **Physics tick**: Fixed timestep (e.g., 0.01s of sim time), runs in a `requestAnimationFrame` loop but can be sped up (1x, 5x, 10x, 100x time warp)
- **Render tick**: R3F renders at 60fps, interpolating between physics states for smooth visuals
- **No Web Workers for v1**: Physics is lightweight enough for the main thread. Can be extracted to a worker later if needed.

---

## 5. Phase 1 — Foundation & Physics Engine

**Goal:** Establish the project scaffold and build the physics engine with verified math.

### 5.1 Project Setup

```bash
npx create-next-app@latest mission-control --typescript --tailwind --app --src-dir=false
```

- Configure TypeScript strict mode
- Set up Tailwind v4 + SCSS
- Install Three.js / R3F / Drei
- Install Zustand, dnd-kit, Recharts
- Configure Vitest for unit testing
- Set up ESLint + Prettier

### 5.2 Physical Constants (`engine/physics/constants.ts`)

```typescript
export const G = 6.674e-11;              // Gravitational constant (m³/kg/s²)
export const EARTH_MASS = 5.972e24;      // kg
export const EARTH_RADIUS = 6.371e6;     // meters
export const EARTH_MU = G * EARTH_MASS;  // Standard gravitational parameter
export const EARTH_ROTATION = 465.1;     // Surface rotation speed at equator (m/s)
export const SEA_LEVEL_PRESSURE = 101325; // Pa
export const SCALE_HEIGHT = 8500;        // meters (for exponential atmosphere model)

// Orbital altitudes (meters above surface)
export const LEO_MIN = 160e3;
export const LEO_MAX = 2000e3;
export const GEO_ALTITUDE = 35786e3;
export const MOON_DISTANCE = 384400e3;
```

### 5.3 Tsiolkovsky Rocket Equation (`engine/physics/tsiolkovsky.ts`)

The foundational equation for all delta-v calculations:

```
Δv = Isp × g₀ × ln(m_wet / m_dry)
```

```typescript
export const G0 = 9.80665; // m/s² (standard gravity)

export function deltaV(isp: number, wetMass: number, dryMass: number): number {
  if (dryMass <= 0 || wetMass <= dryMass) return 0;
  return isp * G0 * Math.log(wetMass / dryMass);
}

export function totalDeltaV(stages: StageSpec[]): number {
  // Calculate stage-by-stage, accounting for upper stage mass as payload
  let totalDv = 0;
  for (let i = stages.length - 1; i >= 0; i--) {
    const payloadAbove = stages.slice(i + 1).reduce(
      (sum, s) => sum + s.wetMass, 0
    );
    const wetMass = stages[i].wetMass + payloadAbove;
    const dryMass = stages[i].dryMass + payloadAbove;
    totalDv += deltaV(stages[i].isp, wetMass, dryMass);
  }
  return totalDv;
}

export function thrustToWeightRatio(
  thrustN: number, massKg: number, gLocal: number = G0
): number {
  return thrustN / (massKg * gLocal);
}
```

### 5.4 Atmospheric Model (`engine/physics/atmosphere.ts`)

Exponential atmosphere for drag calculations:

```typescript
export function atmosphericDensity(altitudeMeters: number): number {
  if (altitudeMeters > 100000) return 0; // Kármán line — effectively vacuum
  const rho0 = 1.225; // kg/m³ at sea level
  return rho0 * Math.exp(-altitudeMeters / SCALE_HEIGHT);
}

export function dragForce(
  velocity: number,
  altitude: number,
  dragCoeff: number,
  crossSection: number
): number {
  const rho = atmosphericDensity(altitude);
  return 0.5 * rho * velocity * velocity * dragCoeff * crossSection;
}
```

### 5.5 Gravity Model (`engine/physics/gravity.ts`)

```typescript
export function gravitationalAcceleration(altitudeMeters: number): number {
  const r = EARTH_RADIUS + altitudeMeters;
  return EARTH_MU / (r * r);
}
```

### 5.6 Orbital Mechanics (`engine/physics/orbit.ts`)

Keplerian orbital elements from state vectors:

```typescript
export interface OrbitalElements {
  semiMajorAxis: number;      // a (meters)
  eccentricity: number;       // e (0 = circular, <1 = elliptical)
  inclination: number;        // i (radians)
  apoapsis: number;           // Highest point above surface (meters)
  periapsis: number;          // Lowest point above surface (meters)
  period: number;             // Orbital period (seconds)
}

export function orbitalElementsFromState(
  position: Vector2D,  // meters from Earth center
  velocity: Vector2D   // m/s
): OrbitalElements {
  const r = magnitude(position);
  const v = magnitude(velocity);

  // Vis-viva: specific orbital energy
  const energy = (v * v) / 2 - EARTH_MU / r;

  // Semi-major axis
  const a = -EARTH_MU / (2 * energy);

  // Eccentricity vector
  const h = cross2D(position, velocity); // specific angular momentum
  const eVec = {
    x: (v * v * position.x - dot(position, velocity) * velocity.x) / EARTH_MU - position.x / r,
    y: (v * v * position.y - dot(position, velocity) * velocity.y) / EARTH_MU - position.y / r,
  };
  const e = magnitude(eVec);

  // Apoapsis and periapsis (above surface)
  const apoapsis = a * (1 + e) - EARTH_RADIUS;
  const periapsis = a * (1 - e) - EARTH_RADIUS;

  // Period
  const period = 2 * Math.PI * Math.sqrt((a * a * a) / EARTH_MU);

  return { semiMajorAxis: a, eccentricity: e, inclination: 0, apoapsis, periapsis, period };
}

// Delta-v for Hohmann transfer between circular orbits
export function hohmannDeltaV(r1: number, r2: number): { burn1: number; burn2: number; total: number } {
  const v1 = Math.sqrt(EARTH_MU / r1);
  const vTransfer1 = Math.sqrt(EARTH_MU * (2 / r1 - 2 / (r1 + r2)));
  const vTransfer2 = Math.sqrt(EARTH_MU * (2 / r2 - 2 / (r1 + r2)));
  const v2 = Math.sqrt(EARTH_MU / r2);

  return {
    burn1: Math.abs(vTransfer1 - v1),
    burn2: Math.abs(v2 - vTransfer2),
    total: Math.abs(vTransfer1 - v1) + Math.abs(v2 - vTransfer2),
  };
}
```

### 5.7 Numerical Integration (`engine/physics/trajectory.ts`)

4th-order Runge-Kutta for trajectory propagation:

```typescript
export interface SimState {
  position: Vector2D;   // meters from Earth center
  velocity: Vector2D;   // m/s
  mass: number;         // kg (decreasing as fuel burns)
  time: number;         // seconds since launch
  altitude: number;     // meters above surface
  fuel: number;         // kg remaining in current stage
}

// RK4 integration step
export function rk4Step(
  state: SimState,
  dt: number,
  thrust: Vector2D,     // Newtons, in world frame
  dragCoeff: number,
  crossSection: number
): SimState {
  const deriv = (s: SimState): { dPos: Vector2D; dVel: Vector2D } => {
    const r = magnitude(s.position);
    const grav = scale(normalize(s.position), -EARTH_MU / (r * r));
    const drag = dragForceVector(s.velocity, s.altitude, dragCoeff, crossSection);
    const accel = add(add(grav, scale(thrust, 1 / s.mass)), scale(drag, -1 / s.mass));
    return { dPos: s.velocity, dVel: accel };
  };

  const k1 = deriv(state);
  const k2 = deriv(advanceState(state, k1, dt / 2));
  const k3 = deriv(advanceState(state, k2, dt / 2));
  const k4 = deriv(advanceState(state, k3, dt));

  return {
    ...state,
    position: add(state.position, scale(
      add(add(k1.dPos, scale(k2.dPos, 2)), add(scale(k3.dPos, 2), k4.dPos)),
      dt / 6
    )),
    velocity: add(state.velocity, scale(
      add(add(k1.dVel, scale(k2.dVel, 2)), add(scale(k3.dVel, 2), k4.dVel)),
      dt / 6
    )),
    time: state.time + dt,
    altitude: magnitude(state.position) - EARTH_RADIUS + /* updated in next line */0,
  };
}
```

### 5.8 Phase 1 Deliverables & Verification

- [ ] All physics functions unit tested against known values
  - Tsiolkovsky: Saturn V Stage 1 should yield ~2,700 m/s Δv
  - Orbital velocity at 200km LEO should be ~7,784 m/s
  - Hohmann LEO→GEO should be ~3,935 m/s total
  - Atmospheric density at 10km should be ~0.414 kg/m³
- [ ] Basic Next.js app scaffold with routing
- [ ] Zustand stores initialized
- [ ] Persistence layer abstraction

---

## 6. Phase 2 — Rocket Builder

**Goal:** Drag-and-drop rocket assembly with real-time stats and 3D preview.

### 6.1 Parts Catalog Data Model

```typescript
// types/rocket.ts
type EngineType = 'solid' | 'liquid_kerolox' | 'liquid_hydrolox' | 'liquid_methalox' | 'ion';

interface EngineDef {
  id: string;
  name: string;
  type: EngineType;
  thrustSeaLevel: number;    // Newtons
  thrustVacuum: number;      // Newtons
  ispSeaLevel: number;       // seconds
  ispVacuum: number;         // seconds
  mass: number;              // kg (dry)
  cost: number;              // dollars
  throttleable: boolean;     // Can throttle down?
  minThrottle: number;       // 0-1 (e.g., 0.4 for Merlin)
  restartable: boolean;      // Can restart in flight?
  description: string;
  tier: number;              // Unlock tier (1-5)
}
```

### 6.2 Example Engine Catalog

Engines inspired by real hardware but with game-balanced stats:

| Engine | Type | Thrust (vac) | Isp (vac) | Mass | Cost | Tier |
|--------|------|-------------|-----------|------|------|------|
| Spartan-1 | Solid | 1,200 kN | 242s | 4,000 kg | $2M | 1 |
| Kestrel-7 | Kerolox | 845 kN | 311s | 3,400 kg | $8M | 1 |
| Titan RL | Hydrolox | 110 kN | 462s | 300 kg | $15M | 2 |
| Raptor-X | Methalox | 2,200 kN | 363s | 1,600 kg | $12M | 3 |
| Halcyon Drive | Ion | 0.5 N | 3,000s | 50 kg | $25M | 4 |
| Nova Cluster | Kerolox | 7,500 kN | 304s | 8,200 kg | $30M | 5 |

### 6.3 Builder UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│  MISSION: Deploy ComSat to GEO    Budget: $120M    [Back]   │
├──────────┬──────────────────────────────┬───────────────────┤
│          │                              │                   │
│  PARTS   │     STAGE ASSEMBLY           │   3D PREVIEW      │
│  CATALOG │     (Drop Zone)              │   (R3F Canvas)    │
│          │                              │                   │
│ [Engine] │  ┌─────────────────────┐     │   ╱╲              │
│ [Engine] │  │ Stage 3 (Payload)   │     │  ╱  ╲             │
│ [Fuel  ] │  │ Payload: ComSat     │     │ │    │            │
│ [Struct] │  ├─────────────────────┤     │ │ S3 │            │
│ [Fairing]│  │ Stage 2             │     │ ├────┤            │
│          │  │ 1x Titan RL         │     │ │    │            │
│ Filter:  │  │ Fuel: 12,000 kg     │     │ │ S2 │            │
│ [All   ] │  ├─────────────────────┤     │ ├────┤            │
│ [Engines]│  │ Stage 1             │     │ │    │            │
│ [Fuel  ] │  │ 5x Kestrel-7       │     │ │ S1 │            │
│ [Struct] │  │ Fuel: 250,000 kg    │     │ │    │            │
│          │  └─────────────────────┘     │ └────┘            │
│          │                              │                   │
├──────────┴──────────────────────────────┴───────────────────┤
│  Mass: 312,400 kg  │  Δv: 9,420 m/s  │  TWR: 1.34         │
│  Cost: $94M / $120M budget  │  Stages: 3  │  [LAUNCH →]    │
└─────────────────────────────────────────────────────────────┘
```

### 6.4 Builder Store (`stores/useBuilderStore.ts`)

```typescript
interface BuilderState {
  missionId: string;
  stages: Stage[];
  payload: Payload;

  // Actions
  addStage: () => void;
  removeStage: (stageIndex: number) => void;
  reorderStages: (from: number, to: number) => void;
  setEngine: (stageIndex: number, engineId: string, count: number) => void;
  setFuel: (stageIndex: number, fuelType: FuelType, massKg: number) => void;
  addPart: (stageIndex: number, partId: string) => void;
  removePart: (stageIndex: number, partIndex: number) => void;

  // Computed (derived via selectors)
  getTotalMass: () => number;
  getTotalCost: () => number;
  getTotalDeltaV: () => number;
  getStageDeltaV: (stageIndex: number) => number;
  getTWR: () => number;
  getRocketConfig: () => RocketConfig;
}
```

### 6.5 Drag-and-Drop Implementation

Using `@dnd-kit`:

- **PartsPanel** contains `<DragOverlay>` source items for each part type
- **StageStack** is a `<SortableContext>` where stages can be reordered
- Each stage has drop zones for engines, fuel tanks, and structural parts
- Dropping a part auto-calculates new mass/cost/Δv via Zustand selectors
- **Validation indicators**: Red border if TWR < 1.0, yellow if Δv is insufficient for mission

### 6.6 3D Rocket Preview

A live R3F canvas showing the rocket as it's assembled:

- Stages stack vertically with interstage adapters
- Engine bells visible at stage bottoms
- Fairings on the payload
- Rocket scales dynamically based on total mass
- Camera orbits automatically, with user drag to rotate

### 6.7 Phase 2 Deliverables

- [ ] Parts catalog with 15-20 components across all categories
- [ ] Drag-and-drop builder with stage management
- [ ] Real-time Δv, TWR, mass, cost calculations
- [ ] 3D rocket preview (can start with primitives — cylinders/cones — before detailed models)
- [ ] Budget validation (can't exceed mission budget)
- [ ] "Launch" button that serializes `RocketConfig` and routes to `/launch/[missionId]`

---

## 7. Phase 3 — Launch Simulation

**Goal:** Real-time 2D/3D flight visualization with manual controls and live telemetry.

### 7.1 Flight Simulator (`engine/simulation/FlightSimulator.ts`)

```typescript
class FlightSimulator {
  private state: SimState;
  private config: RocketConfig;
  private currentStage: number;
  private events: FlightEvent[];
  private history: SimState[];        // Recorded for replay & scoring
  private timeScale: number;          // 1x, 5x, 10x, 100x

  constructor(config: RocketConfig, mission: Mission) { /* ... */ }

  // Main simulation tick — called per frame, may run multiple physics steps
  tick(dtReal: number): void {
    const dtSim = dtReal * this.timeScale;
    const steps = Math.ceil(dtSim / FIXED_DT);

    for (let i = 0; i < steps; i++) {
      this.physicsStep(FIXED_DT);
    }
  }

  private physicsStep(dt: number): void {
    // 1. Compute thrust vector (direction from gravity turn profile + throttle)
    // 2. Consume fuel (mass flow rate = thrust / (Isp * g0))
    // 3. Check for staging events
    // 4. RK4 integration step
    // 5. Update orbital elements
    // 6. Record state to history
    // 7. Check termination conditions (orbit achieved, crash, fuel exhausted)
  }

  // Player actions
  triggerStageSeparation(): void { /* ... */ }
  setThrottle(value: number): void { /* 0-1 */ }
  setAttitude(pitchDeg: number): void { /* Gravity turn angle */ }
  setTimeScale(scale: number): void { /* ... */ }
}
```

### 7.2 Gravity Turn Profile

The gravity turn is the key piloting skill in the game:

```
Altitude (km)    Pitch from vertical
0                0° (straight up)
1                ~5° (kick)
10               ~20°
30               ~45°
70               ~70°
100+             ~90° (horizontal)
```

Players can:
1. **Manual mode**: Set pitch angle with a slider/dial at any time
2. **Programmed mode**: Set pitch waypoints on a timeline before launch
3. **Auto mode** (unlocked later): Optimal gravity turn computed automatically

### 7.3 Flight Scene (3D View)

The R3F scene renders:

- **Rocket model** with flame effects (postprocessing bloom)
- **Earth** with atmosphere glow (scaled for visibility)
- **Trajectory line** drawn behind the rocket
- **Optimal trajectory** shown as a ghost line (dotted)
- **Camera modes**: Follow rocket, orbital view, ground tracking

### 7.4 Telemetry HUD Overlay

A 2D overlay on the 3D scene with live data:

```
┌──────────────────────────────────────────┐
│  T+ 00:02:34           Time Warp: [1x]  │
│                                          │
│  ALT: 87.4 km    VEL: 2,341 m/s         │
│  AP:  203.2 km   PE:  -6,371 km (sub)   │
│  Δv:  4,823 m/s  TWR: 2.1               │
│                                          │
│  Stage 2/3       Fuel: ███████░░ 72%     │
│                                          │
│  [STAGE]  [THROTTLE ━━━━━━━●━━]  [ABORT]│
└──────────────────────────────────────────┘
```

### 7.5 Flight Events & Termination

The simulation ends when one of these conditions is met:

| Condition | Outcome |
|-----------|---------|
| Periapsis > target orbit | **Orbit achieved** — proceed to scoring |
| Altitude < 0 | **Crash** — mission failed |
| All fuel exhausted + periapsis < 0 | **Sub-orbital** — mission failed |
| Player hits ABORT | **Aborted** — partial scoring |
| Orbit matches target within tolerance | **Mission complete** |

### 7.6 Phase 3 Deliverables

- [ ] FlightSimulator class with RK4 integration
- [ ] Gravity turn controls (manual pitch, throttle, staging)
- [ ] 3D flight scene with Earth, rocket, trajectory trail
- [ ] Telemetry HUD with live readouts
- [ ] Time warp (1x, 5x, 10x, 100x)
- [ ] Flight termination detection (orbit/crash/abort)
- [ ] Flight history recording for replay & scoring

---

## 8. Phase 4 — Missions & Progression

**Goal:** Mission progression tree from LEO to the outer solar system.

### 8.1 Mission Tier Structure

```
Tier 1: Foundations (Unlocked from start)
├── Mission 1.1: "First Light" — Reach 100km altitude (suborbital)
├── Mission 1.2: "Orbit!" — Achieve stable LEO (200km circular)
└── Mission 1.3: "Payload Delivery" — Place 500kg satellite in LEO

Tier 2: Working Orbits (Unlock: 5 stars from Tier 1)
├── Mission 2.1: "Higher Ground" — Place satellite at 800km orbit
├── Mission 2.2: "GTO Transfer" — Reach geostationary transfer orbit
└── Mission 2.3: "ComSat Deploy" — Circularize at GEO (35,786km)

Tier 3: Deep Space (Unlock: 5 stars from Tier 2)
├── Mission 3.1: "Lunar Flyby" — Pass within 500km of the Moon
├── Mission 3.2: "Lunar Orbit" — Achieve stable lunar orbit
└── Mission 3.3: "Lunar Lander" — Deliver payload to lunar surface

Tier 4: Interplanetary (Unlock: 5 stars from Tier 3)
├── Mission 4.1: "Mars Window" — Trans-Mars injection burn
├── Mission 4.2: "Mars Orbit" — Achieve Mars orbit insertion
└── Mission 4.3: "Red Landing" — Deliver rover to Mars surface

Tier 5: Grand Tour (Unlock: 7 stars from Tier 4)
├── Mission 5.1: "Jupiter Flyby" — Gravity assist past Jupiter
├── Mission 5.2: "Saturn Rings" — Orbit insertion at Saturn
└── Mission 5.3: "Voyager" — Achieve solar escape velocity
```

### 8.2 Mission Data Structure

```typescript
interface Mission {
  id: string;
  tier: number;
  name: string;
  codename: string;            // e.g., "First Light"
  description: string;         // Flavor text briefing
  requirements: MissionRequirements;
  budget: number;              // Max dollars
  availableEngines: string[];  // Engine IDs unlocked for this tier
  availableParts: string[];    // Part IDs unlocked for this tier
  bonusChallenges: BonusChallenge[];
  educationalTopics: string[]; // Debrief topics to cover
}

interface MissionRequirements {
  targetOrbit?: OrbitalTarget;         // For orbit missions
  targetBody?: 'moon' | 'mars' | ...;  // For interplanetary
  minPayloadMass?: number;              // kg
  maxBudget: number;
  timeLimitSeconds?: number;            // Optional time pressure
}

interface OrbitalTarget {
  periapsis: { min: number; max: number };   // meters
  apoapsis: { min: number; max: number };
  inclination?: { min: number; max: number };
}

interface BonusChallenge {
  id: string;
  description: string;         // "Reach orbit using only solid boosters"
  condition: (flight: FlightData) => boolean;
  bonusStars: number;
}
```

### 8.3 Progression Store

```typescript
interface ProgressionState {
  unlockedTiers: number[];
  missionResults: Record<string, MissionResult>;
  totalStars: number;

  // Computed
  isMissionUnlocked: (missionId: string) => boolean;
  getTierStars: (tier: number) => number;

  // Actions
  completeMission: (missionId: string, result: MissionResult) => void;
}

interface MissionResult {
  stars: number;            // 0-3
  bestScore: number;
  bestRocketConfig: RocketConfig;
  bonusCompleted: string[]; // Bonus challenge IDs
  completedAt: number;      // Timestamp
}
```

### 8.4 Mission Select UI

- Grid layout with tier rows
- Cards show mission name, difficulty, star rating
- Locked missions appear dimmed with lock icon + unlock requirements
- Clicking an unlocked mission shows the mission brief modal
- Brief shows: description, orbital target visualization, budget, available parts, bonus challenges

### 8.5 Phase 4 Deliverables

- [ ] 15 missions across 5 tiers with balanced requirements
- [ ] Progression store with unlock logic
- [ ] Mission select grid UI with lock/unlock states
- [ ] Mission brief modal with target visualization
- [ ] Persistence of mission results to localStorage

---

## 9. Phase 5 — Scoring, Debrief & Education

**Goal:** Post-mission analysis that teaches real physics through the player's own results.

### 9.1 Scoring System

Each mission awards 0-3 stars based on three categories:

```typescript
interface ScoreBreakdown {
  efficiency: {
    score: number;          // 0-100
    deltaVUsed: number;
    deltaVOptimal: number;
    fuelWasted: number;     // kg
  };
  budget: {
    score: number;          // 0-100
    costSpent: number;
    budgetMax: number;
    percentUnderBudget: number;
  };
  accuracy: {
    score: number;          // 0-100
    orbitalDeviation: number;  // meters from target
    inclinationError: number;  // degrees
  };
  totalScore: number;       // Average of three categories
  stars: 0 | 1 | 2 | 3;    // <40 = 0, <60 = 1, <80 = 2, >=80 = 3
}
```

### 9.2 Debrief Screen Layout

```
┌─────────────────────────────────────────────────────────────┐
│  MISSION DEBRIEF: "Orbit!"                     ★ ★ ★ ☆     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐  ┌──────────────────────────────┐  │
│  │  YOUR TRAJECTORY    │  │  SCORE BREAKDOWN             │  │
│  │                     │  │                              │  │
│  │  ╭─── optimal       │  │  Efficiency   ████████░░ 82  │  │
│  │  │   ╭── yours      │  │  Budget       ██████████ 95  │  │
│  │  │  ╱               │  │  Accuracy     ██████░░░░ 64  │  │
│  │  ○╱   🌍            │  │                              │  │
│  │                     │  │  Total: 80 → ★★★             │  │
│  └─────────────────────┘  └──────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  WHY THIS WORKED (or didn't)                           ││
│  │                                                        ││
│  │  Your rocket delivered 9,420 m/s of Δv. The minimum    ││
│  │  to reach a 200km orbit is ~9,400 m/s (including       ││
│  │  gravity and drag losses). Here's how that breaks      ││
│  │  down:                                                 ││
│  │                                                        ││
│  │  Tsiolkovsky Rocket Equation:                          ││
│  │  Δv = Isp × g₀ × ln(m_wet / m_dry)                    ││
│  │                                                        ││
│  │  Your Stage 1: 311s × 9.81 × ln(312400/62400)         ││
│  │             = 311 × 9.81 × 1.61 = 4,912 m/s ✓         ││
│  │                                                        ││
│  │  [Read more about the Tsiolkovsky equation →]          ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  [RETRY MISSION]    [NEXT MISSION →]    [MISSION SELECT]    │
└─────────────────────────────────────────────────────────────┘
```

### 9.3 Educational Topics by Tier

| Tier | Topics Introduced |
|------|-------------------|
| 1 | Tsiolkovsky equation, TWR, gravity, drag losses, what is an orbit |
| 2 | Hohmann transfers, orbital velocity, staging optimization, specific impulse |
| 3 | Patched conics, lunar transfer, gravity assists, three-body problem (simplified) |
| 4 | Transfer windows, interplanetary Δv budgets, aerobraking |
| 5 | Gravity slingshots, escape velocity, multi-flyby trajectories |

### 9.4 Trajectory Replay

- Replay the flight at adjustable speed
- Show actual trajectory vs. computed optimal
- Annotate key moments: "Here your gravity turn was too aggressive — you lost 200 m/s to atmospheric drag"
- Overlay orbital elements changing in real-time

### 9.5 Phase 5 Deliverables

- [ ] Scoring algorithm with three-category breakdown
- [ ] Star rating calculation
- [ ] Debrief page with trajectory comparison
- [ ] Educational content for each mission (15 debrief write-ups)
- [ ] Trajectory replay with annotations
- [ ] "What went wrong" analysis engine (compare flight data to optimal)

---

## 10. Phase 6 — Leaderboard & Auth (Future)

**Goal:** Add Supabase for user accounts, saved progress, and competitive leaderboards.

### 10.1 Supabase Schema

```sql
-- Users (managed by Supabase Auth)

create table profiles (
  id uuid references auth.users primary key,
  username text unique not null,
  avatar_url text,
  created_at timestamptz default now()
);

create table mission_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) not null,
  mission_id text not null,
  stars integer not null check (stars between 0 and 3),
  score integer not null,
  efficiency_score integer,
  budget_score integer,
  accuracy_score integer,
  rocket_config jsonb not null,
  flight_summary jsonb,
  completed_at timestamptz default now()
);

create table leaderboard (
  mission_id text not null,
  user_id uuid references profiles(id) not null,
  best_score integer not null,
  best_stars integer not null,
  rocket_config jsonb,
  updated_at timestamptz default now(),
  primary key (mission_id, user_id)
);
```

### 10.2 Data Access Abstraction

The `lib/persistence.ts` layer will already exist from Phase 1:

```typescript
interface PersistenceProvider {
  saveProgress(data: ProgressionState): Promise<void>;
  loadProgress(): Promise<ProgressionState | null>;
  saveMissionResult(missionId: string, result: MissionResult): Promise<void>;
  getLeaderboard(missionId: string): Promise<LeaderboardEntry[]>;
}

// Phase 1-5: LocalStorageProvider
// Phase 6: SupabaseProvider (swap via environment variable)
```

### 10.3 Phase 6 Deliverables

- [ ] Supabase project setup and schema migration
- [ ] Auth flow (email/password + OAuth with GitHub/Google)
- [ ] Cloud save/sync for progression
- [ ] Per-mission leaderboard with pagination
- [ ] Profile page with stats and history
- [ ] Migrate from localStorage to Supabase provider

---

## 11. Data Architecture

### Save Data Shape (localStorage)

```typescript
interface SaveData {
  version: 1;
  progression: {
    unlockedTiers: number[];
    missionResults: Record<string, {
      stars: number;
      bestScore: number;
      bestRocketConfig: RocketConfig;
      bonusCompleted: string[];
      completedAt: number;
    }>;
  };
  settings: {
    units: 'metric' | 'imperial';
    timeFormat: '24h' | '12h';
    cameraMode: 'follow' | 'orbital' | 'ground';
    audioEnabled: boolean;
  };
  savedRockets: Record<string, RocketConfig>; // Named rocket designs
}
```

### localStorage Keys

```
mission-control:save     — Main save data
mission-control:settings — User preferences
mission-control:rockets  — Saved rocket designs
```

---

## 12. Physics Reference

Quick-reference for the key equations implemented in the engine.

### Tsiolkovsky Rocket Equation
```
Δv = Isp × g₀ × ln(m₀ / mf)

Where:
  Δv  = change in velocity (m/s)
  Isp = specific impulse (seconds)
  g₀  = 9.80665 m/s²
  m₀  = initial (wet) mass
  mf  = final (dry) mass
```

### Orbital Velocity
```
v = √(μ / r)

Where:
  μ = G × M_earth = 3.986e14 m³/s²
  r = orbital radius from Earth center (meters)
```

### Vis-Viva Equation
```
v² = μ × (2/r - 1/a)

Where:
  a = semi-major axis (meters)
```

### Hohmann Transfer
```
Δv₁ = √(μ/r₁) × (√(2r₂/(r₁+r₂)) - 1)
Δv₂ = √(μ/r₂) × (1 - √(2r₁/(r₁+r₂)))
```

### Atmospheric Drag
```
F_drag = ½ × ρ × v² × Cd × A

Where:
  ρ  = atmospheric density (exponential model)
  Cd = drag coefficient (~0.2 for rockets)
  A  = cross-sectional area (m²)
```

### Thrust-to-Weight Ratio
```
TWR = F_thrust / (m × g)

Must be > 1.0 to leave the launch pad
```

---

## 13. Component Map

### Page-level routing

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `MissionGrid` | Mission select + progression overview |
| `/builder/[missionId]` | Builder page | Rocket assembly |
| `/launch/[missionId]` | Launch page | Flight simulation |
| `/debrief/[missionId]` | Debrief page | Scoring + education |

### Key component relationships

```
App Layout
├── Navigation (mission select, saved rockets, settings)
│
├── MissionGrid
│   ├── MissionCard (×15)
│   └── MissionBrief (modal)
│
├── Builder Page
│   ├── PartsPanel (drag sources)
│   │   └── PartCard (×N)
│   ├── StageStack (drop target, sortable)
│   │   └── StageRow (×N)
│   │       ├── EngineSlot
│   │       ├── FuelSlider
│   │       └── PartsList
│   ├── RocketCanvas (R3F)
│   │   └── RocketModel3D
│   ├── StatsPanel (Δv, TWR, mass, cost)
│   └── BudgetBar
│
├── Launch Page
│   ├── FlightScene (R3F)
│   │   ├── Earth
│   │   ├── RocketFlight
│   │   ├── TrajectoryLine
│   │   └── OptimalTrajectory (ghost)
│   ├── TrajectoryOverlay (2D HUD)
│   ├── Telemetry
│   ├── FlightControls
│   │   ├── ThrottleSlider
│   │   ├── PitchDial
│   │   ├── StageButton
│   │   └── AbortButton
│   └── Timeline (event markers)
│
└── Debrief Page
    ├── ScoreCard (3 categories + stars)
    ├── TrajectoryReplay (R3F)
    ├── PhysicsExplainer (educational content)
    └── ActionButtons (retry, next, select)
```

---

## 14. Asset Requirements

### 3D Models (Priority Order)

| Asset | Format | Notes |
|-------|--------|-------|
| Rocket body segments | `.glb` | Cylindrical, multiple diameters |
| Engine bells (5 types) | `.glb` | Unique silhouettes per engine type |
| Fairings (2 sizes) | `.glb` | Nose cone shapes |
| Interstage adapters | `.glb` | Connecting rings |
| Earth (low-poly) | `.glb` + texture | Blue marble texture, atmosphere shader |
| Moon | `.glb` + texture | For Tier 3 missions |
| Mars | `.glb` + texture | For Tier 4 missions |
| Flame/exhaust | Particle system | Bloom postprocessing, no model needed |
| Star field | Cubemap/skybox | Can use drei's `<Stars>` |

**v1 Strategy:** Start with parametric geometry (cylinders, cones, spheres built in code using Three.js primitives). Add detailed `.glb` models as polish.

### Textures

- Earth: 4K blue marble (NASA public domain)
- Moon: 2K surface (NASA public domain)
- Mars: 2K surface (NASA public domain)
- Metal/structural: Procedural or simple PBR materials

### Audio (Optional, Low Priority)

- Engine ignition
- Stage separation
- UI clicks
- Mission success fanfare
- Mission failure tone

---

## 15. Testing Strategy

### Unit Tests (Vitest)

**Physics engine** — Most critical to test:

```typescript
// Example: tsiolkovsky.test.ts
describe('deltaV', () => {
  it('calculates Saturn V first stage correctly', () => {
    // Saturn V S-IC: Isp 263s, wet 2,290,000 kg, dry 131,000 kg + upper stages
    const dv = deltaV(263, 2290000, 750000);
    expect(dv).toBeCloseTo(2880, -1); // ~2,880 m/s within 10 m/s
  });

  it('returns 0 for invalid inputs', () => {
    expect(deltaV(300, 100, 100)).toBe(0);  // No fuel
    expect(deltaV(300, 100, 200)).toBe(0);  // Dry > wet
  });
});

describe('orbitalElementsFromState', () => {
  it('computes circular LEO correctly', () => {
    const r = EARTH_RADIUS + 200e3;
    const v = Math.sqrt(EARTH_MU / r);
    const elements = orbitalElementsFromState(
      { x: r, y: 0 },
      { x: 0, y: v }
    );
    expect(elements.eccentricity).toBeCloseTo(0, 2);
    expect(elements.apoapsis).toBeCloseTo(200e3, -3);
    expect(elements.periapsis).toBeCloseTo(200e3, -3);
  });
});
```

### Component Tests (React Testing Library)

- Builder: Parts drag correctly, stats update, budget enforced
- Flight controls: Throttle, staging, abort behave correctly
- Mission grid: Locked/unlocked states render correctly

### E2E Tests (Playwright)

- Full flow: Select mission → Build rocket → Launch → Score
- Progression: Complete Tier 1, verify Tier 2 unlocks
- Edge cases: Launch with no fuel, exceed budget, abort mid-flight

### Performance Benchmarks

- Physics sim: 10,000 RK4 steps < 100ms (for time warp)
- Builder: 60fps with 3D preview during drag operations
- Launch scene: 60fps with trajectory trail + postprocessing

---

## Development Timeline (Suggested Order)

| Phase | Focus | Key Outcome |
|-------|-------|-------------|
| **Phase 1** | Foundation + Physics | Verified physics engine, project scaffold |
| **Phase 2** | Rocket Builder | Playable builder with real-time feedback |
| **Phase 3** | Launch Simulation | Fly rockets with manual controls |
| **Phase 4** | Missions & Progression | 15 missions across 5 tiers |
| **Phase 5** | Scoring & Education | Debrief screens, star ratings, learning content |
| **Phase 6** | Auth & Leaderboard | Supabase integration (future) |

Each phase builds on the previous one and produces a usable increment. After Phase 3, you have a playable prototype. After Phase 5, you have a complete game.

---

## Quick Start

```bash
# Create the project
npx create-next-app@latest mission-control --typescript --tailwind --app

# Install core dependencies
npm install three @react-three/fiber @react-three/drei @react-three/postprocessing
npm install zustand @dnd-kit/core @dnd-kit/sortable recharts
npm install -D vitest @testing-library/react playwright sass

# Start development
npm run dev
```

Begin with `engine/physics/constants.ts` and `engine/physics/tsiolkovsky.ts`, write the tests first, then build up from there.
