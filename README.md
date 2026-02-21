# Mission Control: Rocket Engineering Challenge

Design, build, and launch rockets to complete progressively harder space missions — from suborbital hops to interplanetary transfers. Learn real orbital mechanics by failing and iterating, not by reading.

## How It Works

1. **Mission Brief** — You're given a destination, payload, and budget
2. **Rocket Builder** — Drag-and-drop assembly: pick engines, stack stages, set fuel loads
3. **Launch** — Fly your rocket with manual controls: gravity turns, staging, throttle
4. **Debrief** — See why your design worked (or didn't) with real physics explanations

## Tech Stack

- **Next.js 16** — App Router, TypeScript, React 19
- **Three.js / React Three Fiber** — 3D rocket preview and flight visualization
- **Zustand** — Lightweight state management
- **@dnd-kit** — Drag-and-drop rocket assembly
- **Tailwind CSS** — Styling
- **Vitest** — Unit testing
- **Vercel** — Deployment

## Physics Engine

The simulation uses real orbital mechanics equations — no faking it:

- **Tsiolkovsky Rocket Equation** — `Δv = Isp × g₀ × ln(m_wet / m_dry)` — the fundamental relationship between fuel, exhaust velocity, and achievable velocity change
- **Keplerian Orbital Mechanics** — Vis-viva equation, orbital elements from state vectors, Hohmann transfers
- **4th-Order Runge-Kutta Integration** — Numerical trajectory propagation with gravity, atmospheric drag, and thrust
- **Exponential Atmosphere Model** — Realistic drag that fades with altitude
- **Inverse-Square Gravity** — `g = μ / r²` — no flat-Earth shortcuts

## Getting Started

```bash
npm install
npm run dev     # Start development server
npm test        # Run physics engine tests
```

## Project Status

Phase 1 (Foundation & Physics Engine) is complete. The physics engine is verified against known values — Saturn V delta-v, LEO orbital velocities, Hohmann transfer costs, and atmospheric density profiles all check out.
