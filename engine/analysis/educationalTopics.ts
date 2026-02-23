import type { FlightResult } from "@/types/physics";
import type { Mission } from "@/types/mission";
import type { ScoreBreakdown } from "@/types/scoring";

export interface TopicContext {
  flight: FlightResult;
  mission: Mission;
  score: ScoreBreakdown;
}

export interface TopicContent {
  id: string;
  title: string;
  equation?: string;
  description: string;
  dynamicDetail?: (ctx: TopicContext) => string | null;
}

/**
 * Educational topic catalog — 33 topics covering all mission tiers.
 * Each entry has a description and optional equation + dynamic detail function
 * that plugs in the player's actual flight data.
 */
export const TOPIC_CATALOG: Record<string, TopicContent> = {
  // === TIER 1: Foundations ===
  what_is_space: {
    id: "what_is_space",
    title: "What Is Space?",
    equation: "Karman Line = 100 km altitude",
    description:
      "Space begins at the Karman line, 100km above sea level. Above this altitude, the atmosphere is too thin for aerodynamic lift — only orbital velocity keeps you from falling back.",
    dynamicDetail: ({ flight }) => {
      const km = flight.maxAltitude / 1000;
      return flight.maxAltitude >= 100_000
        ? `Your rocket reached ${km.toFixed(1)}km — ${(km - 100).toFixed(1)}km above the Karman line.`
        : `Your rocket reached ${km.toFixed(1)}km — ${(100 - km).toFixed(1)}km short of space.`;
    },
  },
  thrust_to_weight: {
    id: "thrust_to_weight",
    title: "Thrust-to-Weight Ratio",
    equation: "TWR = F_thrust / (m × g₀)",
    description:
      "A rocket must produce more thrust than its own weight to leave the pad. TWR > 1.0 means liftoff. Typical values are 1.2–1.8 — too high wastes fuel on drag, too low wastes fuel fighting gravity.",
  },
  gravity: {
    id: "gravity",
    title: "Gravity",
    equation: "g(h) = GM / (R + h)²",
    description:
      "Gravity weakens with altitude following the inverse-square law. At the surface, g ≈ 9.81 m/s². At 200km altitude, it's still ~9.2 m/s² — you don't escape gravity in orbit, you fall around Earth fast enough to miss.",
  },
  tsiolkovsky: {
    id: "tsiolkovsky",
    title: "The Rocket Equation",
    equation: "Δv = Isp × g₀ × ln(m_wet / m_dry)",
    description:
      "The Tsiolkovsky rocket equation is the fundamental law of spaceflight. It relates the change in velocity (Δv) to the exhaust efficiency (Isp) and mass ratio. Higher Isp or more fuel means more Δv — but more fuel means more mass, creating a diminishing return.",
    dynamicDetail: ({ score }) =>
      `Your flight used ${score.efficiency.deltaVUsed.toFixed(0)} m/s of Δv. The theoretical optimum for this mission is ~${score.efficiency.deltaVOptimal.toFixed(0)} m/s.`,
  },
  orbital_velocity: {
    id: "orbital_velocity",
    title: "Orbital Velocity",
    equation: "v_circ = √(μ / r)",
    description:
      "To orbit Earth at 200km altitude, you need about 7,784 m/s of horizontal velocity. At this speed, your forward momentum exactly matches the curvature of the Earth — you're perpetually falling but never hitting the ground.",
    dynamicDetail: ({ flight }) => {
      const last = flight.history[flight.history.length - 1];
      return last
        ? `Your final velocity was ${last.velocity.toFixed(0)} m/s at ${(last.altitude / 1000).toFixed(0)}km altitude.`
        : null;
    },
  },
  gravity_turn: {
    id: "gravity_turn",
    title: "The Gravity Turn",
    description:
      "A gravity turn is the most efficient way to reach orbit. Instead of flying straight up then turning, you gradually pitch sideways, letting gravity bend your trajectory. Start pitching ~5° at 1–2km altitude and reach ~45° by 30km. By 100km, you should be nearly horizontal.",
  },
  staging: {
    id: "staging",
    title: "Staging",
    description:
      "Dropping empty fuel tanks mid-flight dramatically improves performance. Each stage separation sheds dead weight, improving the mass ratio for the remaining stages. The rocket equation shows why: the same fuel gives more Δv when the vehicle is lighter.",
    dynamicDetail: ({ flight }) => {
      const stages = new Set(flight.history.map((s) => s.currentStage));
      return `Your rocket used ${stages.size} stage${stages.size !== 1 ? "s" : ""} during flight.`;
    },
  },
  mass_ratio: {
    id: "mass_ratio",
    title: "Mass Ratio",
    equation: "MR = m_wet / m_dry",
    description:
      "The mass ratio is the ratio of a rocket's fueled mass to its empty mass. Higher mass ratios mean more Δv. A mass ratio of 10 with Isp 300s gives ~6,800 m/s — enough for low Earth orbit with some margin.",
  },
  drag_losses: {
    id: "drag_losses",
    title: "Drag Losses",
    equation: "F_drag = ½ × ρ × v² × Cd × A",
    description:
      "Atmospheric drag opposes motion and scales with the square of velocity. Flying too fast too low wastes energy. Most rockets throttle down during 'Max-Q' — the moment of maximum aerodynamic pressure — typically around 10–15km altitude.",
  },

  // === TIER 2: Working Orbits ===
  specific_impulse: {
    id: "specific_impulse",
    title: "Specific Impulse (Isp)",
    equation: "Isp = F_thrust / (ṁ × g₀)",
    description:
      "Specific impulse measures engine efficiency — how many seconds one kilogram of propellant can produce one kilogram of thrust. Solid motors: ~250s. Kerolox: ~310s. Hydrolox: ~450s. Ion: ~3,000s. Higher Isp means less fuel needed for the same Δv.",
  },
  upper_stages: {
    id: "upper_stages",
    title: "Upper Stages",
    description:
      "Upper stages prioritize efficiency (high Isp) over raw thrust. In the vacuum of space, there's no atmosphere to fight, so a small but efficient engine like a hydrolox upper stage can do more work per kilogram of propellant than a powerful first-stage engine.",
  },
  engine_types: {
    id: "engine_types",
    title: "Engine Types",
    description:
      "Different propellants offer different trade-offs. Solid motors are cheap and simple but can't be throttled. Kerolox (kerosene/LOX) balances thrust and efficiency. Hydrolox (hydrogen/LOX) has the highest chemical Isp. Methalox (methane/LOX) splits the difference with reusability benefits.",
  },
  hohmann_transfer: {
    id: "hohmann_transfer",
    title: "Hohmann Transfer",
    equation: "Δv_total = Δv₁ + Δv₂",
    description:
      "A Hohmann transfer is the most fuel-efficient way to move between two circular orbits. It uses two burns: one to enter an elliptical transfer orbit, and another at the destination to circularize. The trade-off is time — it's slow but cheap.",
    dynamicDetail: ({ score }) =>
      score.efficiency.deltaVOptimal > 9500
        ? `The optimal Hohmann transfer for this mission requires ~${(score.efficiency.deltaVOptimal - 9400).toFixed(0)} m/s beyond LEO insertion.`
        : null,
  },
  vis_viva: {
    id: "vis_viva",
    title: "Vis-Viva Equation",
    equation: "v² = μ × (2/r − 1/a)",
    description:
      "The vis-viva equation relates orbital velocity to position and orbit shape. It's the Swiss army knife of orbital mechanics — given any orbit's semi-major axis and your current distance from the center, it tells you exactly how fast you're moving.",
  },
  elliptical_orbits: {
    id: "elliptical_orbits",
    title: "Elliptical Orbits",
    description:
      "Most orbits are ellipses, not circles. The closest point to Earth is periapsis, the farthest is apoapsis. A satellite moves fastest at periapsis and slowest at apoapsis — this is Kepler's second law (equal areas in equal times).",
    dynamicDetail: ({ flight }) =>
      flight.finalOrbit
        ? `Your final orbit: ${(flight.finalOrbit.periapsis / 1000).toFixed(0)}km × ${(flight.finalOrbit.apoapsis / 1000).toFixed(0)}km (eccentricity: ${flight.finalOrbit.eccentricity.toFixed(4)}).`
        : null,
  },
  circularization: {
    id: "circularization",
    title: "Circularization",
    description:
      "To circularize an orbit, burn prograde at apoapsis to raise periapsis until it matches apoapsis. The smaller the difference between the two, the lower the eccentricity. A perfectly circular orbit has eccentricity = 0.",
  },
  geostationary_orbit: {
    id: "geostationary_orbit",
    title: "Geostationary Orbit",
    equation: "GEO altitude = 35,786 km",
    description:
      "At exactly 35,786km above the equator, a satellite's orbital period matches Earth's rotation — it appears to hover over one spot. This is invaluable for communications and weather satellites. Getting there requires a Hohmann transfer from LEO.",
  },
  restartable_engines: {
    id: "restartable_engines",
    title: "Restartable Engines",
    description:
      "Some engines can be shut down and restarted in space. This is essential for complex maneuvers: coast to apoapsis, then restart for circularization. Solid motors can't restart. Most hydrolox and methalox engines can.",
  },

  // === TIER 3: Deep Space ===
  patched_conics: {
    id: "patched_conics",
    title: "Patched Conics",
    description:
      "Interplanetary trajectories are simplified by treating them as a series of two-body problems. Near Earth, you're in Earth's sphere of influence. After escape, you're in the Sun's. Near the Moon, you're in the Moon's. Each 'patch' uses simple Keplerian math.",
  },
  lunar_transfer: {
    id: "lunar_transfer",
    title: "Lunar Transfer",
    equation: "TLI Δv ≈ 3,100 m/s from LEO",
    description:
      "A trans-lunar injection (TLI) burn from low Earth orbit sends you on a trajectory to the Moon, 384,400km away. The trip takes about 3 days. You need ~3,100 m/s of Δv beyond LEO — roughly a third of the Δv needed to reach orbit in the first place.",
  },
  sphere_of_influence: {
    id: "sphere_of_influence",
    title: "Sphere of Influence",
    description:
      "Each celestial body has a sphere of influence (SOI) where its gravity dominates. Earth's SOI is about 925,000km. The Moon's is ~66,000km. When your spacecraft crosses from one SOI to another, the dominant gravitational force changes.",
  },
  orbital_insertion: {
    id: "orbital_insertion",
    title: "Orbital Insertion",
    description:
      "To enter orbit around a body, you must slow down enough for gravity to capture you. Without a braking burn, you'd fly past in a hyperbolic trajectory. The required Δv depends on your approach speed and target orbit altitude.",
  },
  capture_burns: {
    id: "capture_burns",
    title: "Capture Burns",
    description:
      "A capture burn decelerates your spacecraft to enter orbit around a target body. Burn at the closest approach (periapsis) for maximum efficiency — this is the Oberth effect. Arriving slower means less fuel needed for capture.",
  },
  three_body_simplified: {
    id: "three_body_simplified",
    title: "Three-Body Problem",
    description:
      "With two gravitational bodies (Earth and Moon), trajectories become complex. There's no simple formula — we use numerical integration. But special solutions like Lagrange points exist, where gravitational forces balance.",
  },
  landing_burns: {
    id: "landing_burns",
    title: "Landing Burns",
    description:
      "On airless bodies like the Moon, the only way to slow down is with rockets. A powered descent must carefully manage thrust to reach zero velocity at zero altitude. Too early wastes fuel hovering; too late means a crash.",
  },
  suicide_burn: {
    id: "suicide_burn",
    title: "Suicide Burn",
    description:
      "The most fuel-efficient landing technique: fall freely until the last possible moment, then fire engines at maximum thrust to decelerate to zero just at the surface. It's called a 'suicide burn' because there's no margin for error.",
  },
  lunar_gravity: {
    id: "lunar_gravity",
    title: "Lunar Gravity",
    equation: "g_moon = 1.62 m/s² (≈ 1/6 Earth)",
    description:
      "The Moon's gravity is about one-sixth of Earth's. This means less Δv for landing and takeoff, but also means orbital velocities are much lower (~1,680 m/s for low lunar orbit vs. ~7,800 m/s for LEO).",
  },

  // === TIER 4: Interplanetary ===
  transfer_windows: {
    id: "transfer_windows",
    title: "Transfer Windows",
    description:
      "Interplanetary transfers depend on planetary alignment. Earth-Mars Hohmann transfer windows open every ~26 months. Missing the window means either waiting or spending significantly more Δv on a faster trajectory.",
  },
  interplanetary_dv: {
    id: "interplanetary_dv",
    title: "Interplanetary Δv",
    description:
      "Getting to Mars requires ~3,600 m/s beyond LEO for trans-Mars injection, plus ~1,000 m/s for Mars orbit insertion. Total from Earth's surface to Mars orbit: ~13,000–15,000 m/s. Every kilogram matters at these scales.",
    dynamicDetail: ({ score }) =>
      `Your total Δv used: ${score.efficiency.deltaVUsed.toFixed(0)} m/s.`,
  },
  escape_velocity: {
    id: "escape_velocity",
    title: "Escape Velocity",
    equation: "v_esc = √(2μ / r)",
    description:
      "Escape velocity is the speed needed to leave a body's gravitational influence permanently. From Earth's surface: 11,186 m/s. From LEO: ~10,900 m/s. From the Moon's surface: 2,376 m/s. Reaching escape velocity puts you on a parabolic trajectory.",
  },
  mars_orbit_insertion: {
    id: "mars_orbit_insertion",
    title: "Mars Orbit Insertion",
    description:
      "Arriving at Mars, your spacecraft approaches on a hyperbolic trajectory. A retrograde burn at closest approach captures into Mars orbit. Mars's thin atmosphere can also be used for aerobraking to save fuel.",
  },
  aerobraking_concept: {
    id: "aerobraking_concept",
    title: "Aerobraking",
    description:
      "Aerobraking uses atmospheric drag to slow down instead of burning fuel. By repeatedly dipping into the upper atmosphere, a spacecraft can gradually lower its orbit. Mars's thin atmosphere makes this a slow but fuel-free process.",
  },
  interplanetary_navigation: {
    id: "interplanetary_navigation",
    title: "Interplanetary Navigation",
    description:
      "Navigating between planets requires extreme precision. A 1 m/s error at Earth translates to thousands of kilometers of error at Mars. Course corrections (trajectory correction maneuvers) are planned throughout the journey.",
  },
  mars_edl: {
    id: "mars_edl",
    title: "Mars EDL",
    description:
      "Entry, Descent, and Landing (EDL) at Mars is notoriously difficult. The atmosphere is thick enough to generate extreme heating but too thin for parachutes alone. The 'seven minutes of terror' requires heat shields, parachutes, AND powered descent.",
  },
  powered_descent: {
    id: "powered_descent",
    title: "Powered Descent",
    description:
      "When parachutes aren't enough (Mars) or don't exist (Moon), powered descent uses rocket thrust to achieve a soft landing. The challenge is fuel efficiency — every second of hovering wastes precious propellant.",
  },
  mars_atmosphere: {
    id: "mars_atmosphere",
    title: "Mars Atmosphere",
    description:
      "Mars has an atmosphere ~1% as dense as Earth's. It's mostly CO₂ with surface pressure around 600 Pa. Too thin for wings or pure parachute landings, but enough to cause significant heating on entry at interplanetary speeds.",
  },

  // === TIER 5: Grand Tour ===
  gravity_assist: {
    id: "gravity_assist",
    title: "Gravity Assist",
    description:
      "A gravity assist (slingshot) uses a planet's gravity and orbital motion to change a spacecraft's speed and direction. By carefully choosing the flyby geometry, you can gain thousands of m/s for free — the energy comes from the planet's orbital motion.",
  },
  flyby_mechanics: {
    id: "flyby_mechanics",
    title: "Flyby Mechanics",
    description:
      "During a flyby, the spacecraft's speed relative to the planet is unchanged — but its direction changes. Since the planet is moving, this direction change translates to a net velocity gain (or loss) relative to the Sun.",
  },
  oberth_effect: {
    id: "oberth_effect",
    title: "Oberth Effect",
    equation: "ΔKE = Δv × v (more efficient at high speed)",
    description:
      "Burning propellant at high velocity is more efficient than at low velocity. A burn deep in a gravity well (moving fast) produces more orbital energy change than the same burn far from any body. This is why you burn at periapsis.",
  },
  multi_flyby: {
    id: "multi_flyby",
    title: "Multi-Flyby Trajectories",
    description:
      "Complex missions use multiple gravity assists to reach distant targets. Cassini used Venus-Venus-Earth-Jupiter assists to reach Saturn. Each flyby redirects and accelerates the spacecraft, sometimes requiring years of patient trajectory design.",
  },
  saturn_system: {
    id: "saturn_system",
    title: "The Saturn System",
    description:
      "Saturn orbits at 9.5 AU from the Sun. Its system includes the spectacular rings, 146 known moons, and Titan — the only moon with a thick atmosphere. Reaching Saturn orbit requires either enormous Δv or creative use of gravity assists.",
  },
  deep_space_navigation: {
    id: "deep_space_navigation",
    title: "Deep Space Navigation",
    description:
      "At interplanetary distances, communication delays make real-time control impossible. Spacecraft must navigate autonomously between ground-computed trajectory updates. The Deep Space Network tracks spacecraft using radio signals across billions of kilometers.",
  },
  solar_escape: {
    id: "solar_escape",
    title: "Solar Escape Velocity",
    equation: "v_esc(Sun, 1AU) ≈ 42.1 km/s",
    description:
      "To leave the solar system, a spacecraft must exceed the Sun's escape velocity at its current distance. At Earth's orbit (1 AU), that's ~42.1 km/s. Earth's orbital velocity is ~29.8 km/s, so you need ~12.3 km/s extra relative to Earth.",
  },
  c3_energy: {
    id: "c3_energy",
    title: "C3 Energy",
    equation: "C3 = v_inf² (km²/s²)",
    description:
      "C3 is the characteristic energy — the square of the hyperbolic excess velocity. C3 = 0 means exactly at escape velocity. C3 > 0 means you'll leave the body's influence with residual velocity. Launch vehicles are rated by the C3 they can achieve for a given payload mass.",
  },
  voyager_golden_record: {
    id: "voyager_golden_record",
    title: "The Voyager Golden Record",
    description:
      "Voyager 1 and 2, launched in 1977, used gravity assists past Jupiter and Saturn (and Neptune for Voyager 2) to reach solar escape velocity. Each carries a golden record with sounds and images of Earth — a message in a bottle for the cosmos.",
  },
};

/** Look up topics by ID, returning only those that exist in the catalog. */
export function getTopics(ids: string[]): TopicContent[] {
  return ids
    .map((id) => TOPIC_CATALOG[id])
    .filter((t): t is TopicContent => t !== undefined);
}
