import type { FlightResult, FlightSnapshot } from "@/types/physics";
import type { Mission } from "@/types/mission";
import type { ScoreBreakdown } from "@/types/scoring";
import { atmosphericDensity } from "@/engine/physics/atmosphere";
import { gravitationalAcceleration } from "@/engine/physics/gravity";
import {
  KARMAN_LINE,
  DEFAULT_DRAG_COEFFICIENT,
  DEFAULT_CROSS_SECTION,
} from "@/engine/physics/constants";

// --- Types ---

export interface FlightInsight {
  type: "positive" | "warning" | "info";
  title: string;
  detail: string;
}

export interface FlightKeyEvent {
  time: number;
  altitude: number;
  velocity: number;
  label: string;
  type:
    | "stage_separation"
    | "orbit_achieved"
    | "max_q"
    | "karman_line"
    | "max_altitude"
    | "fuel_depleted";
}

export interface FlightAnalysis {
  insights: FlightInsight[];
  keyEvents: FlightKeyEvent[];
  gravityLossEstimate: number;
  dragLossEstimate: number;
}

// --- Main analysis function ---

export function analyzeFlightData(
  flight: FlightResult,
  mission: Mission,
  score: ScoreBreakdown
): FlightAnalysis {
  const { history } = flight;
  const keyEvents = detectKeyEvents(history);
  const gravityLossEstimate = estimateGravityLoss(history);
  const dragLossEstimate = estimateDragLoss(history);
  const insights = generateInsights(flight, mission, score, history, gravityLossEstimate);

  return { insights, keyEvents, gravityLossEstimate, dragLossEstimate };
}

// --- Key event detection ---

function detectKeyEvents(history: FlightSnapshot[]): FlightKeyEvent[] {
  if (history.length === 0) return [];

  const events: FlightKeyEvent[] = [];

  // Karman line crossing
  const karman = history.find((s) => s.altitude >= KARMAN_LINE);
  if (karman) {
    events.push({
      time: karman.time,
      altitude: karman.altitude,
      velocity: karman.velocity,
      label: "Karman Line",
      type: "karman_line",
    });
  }

  // Max dynamic pressure (Max-Q)
  let maxQ = 0;
  let maxQSnapshot: FlightSnapshot | null = null;
  for (const s of history) {
    if (s.altitude > KARMAN_LINE) continue;
    const rho = atmosphericDensity(s.altitude);
    const q = 0.5 * rho * s.velocity * s.velocity;
    if (q > maxQ) {
      maxQ = q;
      maxQSnapshot = s;
    }
  }
  if (maxQSnapshot && maxQ > 1000) {
    events.push({
      time: maxQSnapshot.time,
      altitude: maxQSnapshot.altitude,
      velocity: maxQSnapshot.velocity,
      label: "Max-Q",
      type: "max_q",
    });
  }

  // Stage separations
  for (let i = 1; i < history.length; i++) {
    if (history[i].currentStage !== history[i - 1].currentStage) {
      events.push({
        time: history[i].time,
        altitude: history[i].altitude,
        velocity: history[i].velocity,
        label: `Stage ${history[i - 1].currentStage + 1} Sep`,
        type: "stage_separation",
      });
    }
  }

  // Max altitude
  let maxAlt = 0;
  let maxAltSnapshot: FlightSnapshot | null = null;
  for (const s of history) {
    if (s.altitude > maxAlt) {
      maxAlt = s.altitude;
      maxAltSnapshot = s;
    }
  }
  if (maxAltSnapshot) {
    events.push({
      time: maxAltSnapshot.time,
      altitude: maxAltSnapshot.altitude,
      velocity: maxAltSnapshot.velocity,
      label: "Max Altitude",
      type: "max_altitude",
    });
  }

  // Orbit achieved (first snapshot with stable orbit)
  const orbitAchieved = history.find(
    (s) =>
      s.orbitalElements &&
      s.orbitalElements.periapsis > 0 &&
      s.orbitalElements.eccentricity < 1
  );
  if (orbitAchieved) {
    events.push({
      time: orbitAchieved.time,
      altitude: orbitAchieved.altitude,
      velocity: orbitAchieved.velocity,
      label: "Orbit Achieved",
      type: "orbit_achieved",
    });
  }

  // Sort by time
  events.sort((a, b) => a.time - b.time);
  return events;
}

// --- Loss estimates ---

function estimateGravityLoss(history: FlightSnapshot[]): number {
  let loss = 0;
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];
    // Only count while thrusting (throttle > 0)
    if (prev.throttle <= 0) continue;

    const dt = curr.time - prev.time;
    if (dt <= 0) continue;

    const g = gravitationalAcceleration(prev.altitude);
    const pitchRad = (prev.pitchAngle * Math.PI) / 180;
    // Gravity loss = g * dt * cos(pitch from horizontal)
    // pitchAngle is from vertical, so cos(pitchAngle) gives the vertical component
    loss += g * dt * Math.cos(pitchRad);
  }
  return Math.max(0, loss);
}

function estimateDragLoss(history: FlightSnapshot[]): number {
  let loss = 0;
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];
    if (prev.altitude > KARMAN_LINE) continue;

    const dt = curr.time - prev.time;
    if (dt <= 0 || prev.mass <= 0) continue;

    const rho = atmosphericDensity(prev.altitude);
    const dragAccel =
      (0.5 * rho * prev.velocity * prev.velocity * DEFAULT_DRAG_COEFFICIENT * DEFAULT_CROSS_SECTION) /
      prev.mass;
    loss += dragAccel * dt;
  }
  return Math.max(0, loss);
}

// --- Insight generation ---

function generateInsights(
  flight: FlightResult,
  mission: Mission,
  score: ScoreBreakdown,
  history: FlightSnapshot[],
  gravityLoss: number
): FlightInsight[] {
  const insights: FlightInsight[] = [];
  const isSuccess =
    flight.outcome === "mission_complete" || flight.outcome === "orbit_achieved";

  // Failure-specific insights (highest priority)
  if (flight.outcome === "crash") {
    const last = history[history.length - 1];
    insights.push({
      type: "warning",
      title: "Vehicle Lost",
      detail: `Your vehicle impacted the surface at T+${Math.round(last?.time ?? 0)}s. Ensure your orbit's periapsis clears the atmosphere (100km+) before cutting engines.`,
    });
  } else if (flight.outcome === "suborbital") {
    insights.push({
      type: "warning",
      title: "Suborbital Trajectory",
      detail: `Max altitude was ${(flight.maxAltitude / 1000).toFixed(1)}km but orbital velocity was not reached. You need ~7,800 m/s horizontal velocity at 100km+ altitude for a stable orbit.`,
    });
  } else if (flight.outcome === "fuel_exhausted") {
    const last = history[history.length - 1];
    insights.push({
      type: "warning",
      title: "Fuel Exhausted",
      detail: `All fuel was consumed at T+${Math.round(last?.time ?? 0)}s at ${(last?.altitude ?? 0 / 1000).toFixed(0)}km. Consider adding fuel tanks or using higher-Isp engines.`,
    });
  }

  // Delta-v efficiency
  if (score.efficiency.deltaVOptimal > 0) {
    const ratio = score.efficiency.deltaVOptimal / Math.max(score.efficiency.deltaVOptimal, score.efficiency.deltaVUsed);
    if (ratio > 0.9 && isSuccess) {
      insights.push({
        type: "positive",
        title: "Efficient Flight",
        detail: `You used ${score.efficiency.deltaVUsed.toFixed(0)} m/s of delta-v — only ${(score.efficiency.fuelWasted).toFixed(0)} m/s above the theoretical optimum of ${score.efficiency.deltaVOptimal.toFixed(0)} m/s.`,
      });
    } else if (ratio < 0.7) {
      insights.push({
        type: "warning",
        title: "Delta-v Waste",
        detail: `You used ${score.efficiency.deltaVUsed.toFixed(0)} m/s but the optimal is ~${score.efficiency.deltaVOptimal.toFixed(0)} m/s. ${(score.efficiency.fuelWasted).toFixed(0)} m/s was lost to gravity, drag, and trajectory inefficiency.`,
      });
    }
  }

  // Gravity turn analysis
  if (history.length > 10) {
    let verticalTime = 0;
    for (const s of history) {
      if (s.altitude > 5000 && s.pitchAngle < 10 && s.throttle > 0) {
        verticalTime++;
      }
    }
    // Rough estimate: each "snapshot" is some time interval
    const avgDt = history.length > 1
      ? (history[history.length - 1].time - history[0].time) / history.length
      : 1;
    const verticalSeconds = verticalTime * avgDt;

    if (verticalSeconds > 60) {
      insights.push({
        type: "info",
        title: "Gravity Turn Timing",
        detail: `Your rocket spent ~${Math.round(verticalSeconds)}s in near-vertical flight above 5km. Starting your gravity turn earlier (pitch ~10° at 1-2km) reduces gravity losses. Estimated gravity losses: ~${Math.round(gravityLoss)} m/s.`,
      });
    }
  }

  // Drag analysis
  let maxVelBelow30km = 0;
  for (const s of history) {
    if (s.altitude < 30_000 && s.velocity > maxVelBelow30km) {
      maxVelBelow30km = s.velocity;
    }
  }
  if (maxVelBelow30km > 800 && insights.length < 4) {
    insights.push({
      type: "info",
      title: "Aerodynamic Drag",
      detail: `Your rocket reached ${Math.round(maxVelBelow30km)} m/s below 30km altitude where the atmosphere is dense. Throttling back in the lower atmosphere can reduce drag losses.`,
    });
  }

  // Budget
  if (isSuccess && score.budget.percentUnderBudget > 30 && insights.length < 4) {
    insights.push({
      type: "positive",
      title: "Budget Efficiency",
      detail: `Excellent cost management — ${score.budget.percentUnderBudget.toFixed(0)}% under the ${(score.budget.budgetMax / 1e6).toFixed(0)}M budget.`,
    });
  }

  // Ensure 2-4 insights
  if (insights.length === 0) {
    insights.push({
      type: "info",
      title: "Flight Complete",
      detail: `Total delta-v used: ${flight.totalDeltaVUsed.toFixed(0)} m/s over ${Math.round(flight.flightDuration)}s of flight. Max altitude: ${(flight.maxAltitude / 1000).toFixed(1)}km.`,
    });
  }

  return insights.slice(0, 4);
}
