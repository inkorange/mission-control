import { EARTH_RADIUS, EARTH_MU, FIXED_DT, DEFAULT_DRAG_COEFFICIENT, DEFAULT_CROSS_SECTION, G0 } from "../physics/constants";
import { rk4Step, createLaunchState } from "../physics/trajectory";
import type { GravBody } from "../physics/trajectory";
import { massFlowRate } from "../physics/tsiolkovsky";
import { orbitalElementsFromState, isOrbitStable } from "../physics/orbit";
import {
  getActiveBodies,
  getBodyPosition,
  getBodyVelocity,
  computeBodyPositions,
  getSOIBody,
  distanceToBody,
} from "../physics/bodies";
import type { CelestialBody } from "../physics/bodies";
import { magnitude, normalize, scale, rotate, dot, sub } from "@/lib/math";
import { degToRad } from "@/lib/math";
import type { Vector2D, SimState, FlightSnapshot, FlightResult, FlightOutcome, OrbitalElements } from "@/types/physics";
import type { RocketConfig, EngineDef } from "@/types/rocket";
import type { Mission, OrbitalTarget } from "@/types/mission";

export interface FlightEvent {
  time: number;
  type: "ignition" | "stage_separation" | "fuel_depleted" | "burn_start" | "burn_stop" | "abort" | "orbit_achieved" | "soi_enter" | "soi_exit" | "target_reached";
  stageIndex?: number;
  description: string;
}

interface StageRuntime {
  engines: { def: EngineDef; count: number }[];
  fuelRemaining: number;
  dryMass: number;
  totalThrust: number; // Newtons (vacuum)
  totalThrustSL: number; // Newtons (sea level)
  avgIspVacuum: number;
  avgIspSeaLevel: number;
  flowRate: number; // kg/s total
}

export class FlightSimulator {
  private state: SimState;
  private config: RocketConfig;
  private mission: Mission;
  private currentStageIndex: number;
  private stages: StageRuntime[];
  private events: FlightEvent[];
  private history: FlightSnapshot[];
  private timeScale: number;
  private throttle: number;
  private pitchAngle: number; // degrees from vertical (0 = straight up, 90 = horizontal)
  private isRunning: boolean;
  private outcome: FlightOutcome | null;
  private totalDeltaVUsed: number;
  private lastVelocity: number;
  private engineLookup: Map<string, EngineDef>;
  private suborbitalTargetReached: boolean;
  private validationTriggered: boolean;
  private validationApoapsis: number;
  private outcomeReached: boolean; // Prevents re-triggering success after resume
  private launchAngle: number;

  // Multi-body
  private activeBodies: CelestialBody[];
  private currentSOIBody: string;
  private lastSOIBody: string;
  private bodyPositions: Record<string, Vector2D>;
  private lastTargetDistance: number | null;
  private targetApproaching: boolean;

  constructor(
    config: RocketConfig,
    mission: Mission,
    engineDefs: EngineDef[]
  ) {
    this.config = config;
    this.mission = mission;
    this.engineLookup = new Map(engineDefs.map((e) => [e.id, e]));

    // Build runtime stage data
    this.stages = config.stages.map((stage) => {
      const engines = stage.engines.map((ec) => ({
        def: this.engineLookup.get(ec.engineId)!,
        count: ec.count,
      }));

      const totalThrustVac = engines.reduce(
        (sum, e) => sum + e.def.thrustVacuum * e.count,
        0
      );
      const totalThrustSL = engines.reduce(
        (sum, e) => sum + e.def.thrustSeaLevel * e.count,
        0
      );

      // Weighted average Isp (by thrust)
      const avgIspVac =
        totalThrustVac > 0
          ? engines.reduce(
              (sum, e) => sum + e.def.ispVacuum * e.def.thrustVacuum * e.count,
              0
            ) / totalThrustVac
          : 0;
      const avgIspSL =
        totalThrustSL > 0
          ? engines.reduce(
              (sum, e) =>
                sum + e.def.ispSeaLevel * e.def.thrustSeaLevel * e.count,
              0
            ) / totalThrustSL
          : 0;

      const flowRate = massFlowRate(totalThrustVac, avgIspVac);

      return {
        engines,
        fuelRemaining: stage.fuelMass,
        dryMass: stage.structuralMass + engines.reduce(
          (sum, e) => sum + e.def.mass * e.count, 0
        ),
        totalThrust: totalThrustVac,
        totalThrustSL: totalThrustSL,
        avgIspVacuum: avgIspVac,
        avgIspSeaLevel: avgIspSL,
        flowRate,
      };
    });

    // Total fuel across all stages
    const totalFuel = config.stages.reduce((sum, s) => sum + s.fuelMass, 0);

    this.state = createLaunchState(config.totalMass, totalFuel);
    this.currentStageIndex = 0;
    this.events = [];
    this.history = [];
    this.timeScale = 1;
    this.throttle = 1;
    this.pitchAngle = 0;
    this.isRunning = false;
    this.outcome = null;
    this.totalDeltaVUsed = 0;
    this.lastVelocity = magnitude(this.state.velocity);
    this.suborbitalTargetReached = false;
    this.validationTriggered = false;
    this.validationApoapsis = 0;
    this.outcomeReached = false;
    this.launchAngle = Math.atan2(this.state.position.y, this.state.position.x);

    // Multi-body setup
    this.activeBodies = getActiveBodies(mission);
    this.currentSOIBody = "earth";
    this.lastSOIBody = "earth";
    this.bodyPositions = computeBodyPositions(this.activeBodies, 0);
    this.lastTargetDistance = null;
    this.targetApproaching = false;

    this.events.push({
      time: 0,
      type: "ignition",
      stageIndex: 0,
      description: "Main engine ignition",
    });
  }

  /** Start the simulation */
  start(): void {
    this.isRunning = true;
    this.recordSnapshot();
  }

  /** Resume the simulation after success (so player can watch the orbit) */
  resume(): void {
    this.isRunning = true;
    this.outcomeReached = true; // Skip further termination checks
  }

  /** Check if sim is still running */
  get running(): boolean {
    return this.isRunning;
  }

  /** Get current outcome (null if still running) */
  get currentOutcome(): FlightOutcome | null {
    return this.outcome;
  }

  /** Whether orbit validation is in progress (coasting to apoapsis) */
  get isValidating(): boolean {
    return this.validationTriggered;
  }

  /** Get the current sim state */
  get currentState(): SimState {
    return { ...this.state };
  }

  /** Get the current stage index */
  get activeStageIndex(): number {
    return this.currentStageIndex;
  }

  /** Get the flight events log */
  get flightEvents(): FlightEvent[] {
    return [...this.events];
  }

  /** Get the current SOI body */
  get soiBody(): string {
    return this.currentSOIBody;
  }

  /** Get body positions */
  get currentBodyPositions(): Record<string, Vector2D> {
    return { ...this.bodyPositions };
  }

  /** Set time warp — allows up to 10000x for interplanetary missions */
  setTimeScale(scale: number): void {
    this.timeScale = Math.max(1, Math.min(10000, scale));
  }

  /** Set throttle (0-1) */
  setThrottle(value: number): void {
    const stage = this.stages[this.currentStageIndex];
    if (!stage) return;

    const engine = stage.engines[0]?.def;
    if (engine?.throttleable) {
      this.throttle = Math.max(engine.minThrottle, Math.min(1, value));
    } else {
      this.throttle = value > 0 ? 1 : 0;
    }
  }

  /** Set pitch angle in degrees from vertical */
  setPitchAngle(degrees: number): void {
    this.pitchAngle = Math.max(0, Math.min(90, degrees));
  }

  /** Trigger stage separation */
  triggerStageSeparation(): void {
    if (this.currentStageIndex >= this.stages.length - 1) return;

    this.events.push({
      time: this.state.time,
      type: "stage_separation",
      stageIndex: this.currentStageIndex,
      description: `Stage ${this.currentStageIndex + 1} separated`,
    });

    // Discard current stage mass from total
    const discardedStage = this.stages[this.currentStageIndex];
    const discardedMass = discardedStage.dryMass + discardedStage.fuelRemaining;
    this.state.mass -= discardedMass;

    this.currentStageIndex++;
    this.state.fuel = this.stages[this.currentStageIndex].fuelRemaining;
  }

  /** Abort the mission */
  abort(): void {
    this.outcome = "aborted";
    this.isRunning = false;
    this.events.push({
      time: this.state.time,
      type: "abort",
      description: "Mission aborted",
    });
  }

  /**
   * Main simulation tick — called per animation frame.
   * Runs multiple fixed-timestep physics steps per frame based on timeScale.
   */
  tick(dtReal: number): void {
    if (!this.isRunning) return;
    // After success, keep ticking for visualization but skip termination checks
    // (outcomeReached is set by resume())

    const dtSim = dtReal * this.timeScale;
    // Use larger timestep at high warp to avoid excessive substeps
    const physDt = this.timeScale > 100 ? 0.1 : FIXED_DT;
    const steps = Math.max(1, Math.ceil(dtSim / physDt));
    const actualDt = dtSim / steps;

    for (let i = 0; i < steps; i++) {
      this.physicsStep(actualDt);
      if (this.outcome && !this.outcomeReached) break;
    }

    this.recordSnapshot();
  }

  private physicsStep(dt: number): void {
    const stage = this.stages[this.currentStageIndex];
    if (!stage) {
      this.outcome = "fuel_exhausted";
      this.isRunning = false;
      return;
    }

    // Update body positions for current sim time
    this.bodyPositions = computeBodyPositions(this.activeBodies, this.state.time);

    // Build gravity bodies for N-body integration
    const extraBodies: GravBody[] = this.activeBodies.map((body) => ({
      mu: body.mu,
      position: this.bodyPositions[body.id],
    }));

    // Determine effective thrust and Isp based on altitude
    const altFraction = Math.min(1, this.state.altitude / 100_000);
    const effectiveThrust =
      stage.totalThrustSL + (stage.totalThrust - stage.totalThrustSL) * altFraction;
    const effectiveIsp =
      stage.avgIspSeaLevel +
      (stage.avgIspVacuum - stage.avgIspSeaLevel) * altFraction;

    // Auto-cutoff: if orbit matches target, kill thrust to prevent overshooting
    // This runs every physics step so it catches the target even at high warp
    if (this.state.altitude > 100_000 && this.mission.requirements.targetOrbit && !this.outcomeReached) {
      const target = this.mission.requirements.targetOrbit;
      const apoMax = isFinite(target.apoapsis.max) ? target.apoapsis.max : Infinity;
      if (isFinite(apoMax)) {
        const checkElements = orbitalElementsFromState(this.state.position, this.state.velocity);
        if (checkElements.apoapsis > apoMax * 0.7 && checkElements.periapsis > -100_000) {
          this.throttle = 0;

          // If we haven't reached the target altitude yet, trigger validation (auto-warp coast)
          const targetAltMin = isFinite(target.apoapsis.min) ? target.apoapsis.min : 0;
          if (targetAltMin > 0 && this.state.altitude < targetAltMin && !this.validationTriggered) {
            this.validationTriggered = true;
            this.events.push({
              time: this.state.time,
              type: "orbit_achieved",
              description: `Orbit confirmed — coasting to ${(checkElements.apoapsis / 1000).toFixed(0)}km for validation...`,
            });
          }
        }
      }
    }

    // Compute thrust vector direction
    let thrustVec: Vector2D = { x: 0, y: 0 };
    if (stage.fuelRemaining > 0 && this.throttle > 0) {
      const currentThrust = effectiveThrust * this.throttle;

      // Thrust direction: pitch angle from local vertical (radial direction)
      const radialDir = normalize(this.state.position);
      // Rotate from vertical toward prograde by pitchAngle
      const pitchRad = degToRad(this.pitchAngle);
      const thrustDir = rotate(radialDir, -pitchRad); // Negative to pitch toward prograde (clockwise in our 2D system)

      thrustVec = scale(thrustDir, currentThrust);

      // Consume fuel
      const flowRate = massFlowRate(currentThrust, effectiveIsp);
      const fuelConsumed = Math.min(flowRate * dt, stage.fuelRemaining);
      stage.fuelRemaining -= fuelConsumed;
      this.state.mass -= fuelConsumed;
      this.state.fuel = stage.fuelRemaining;
    }

    // Auto-stage when current stage fuel is depleted and more stages exist
    if (stage.fuelRemaining <= 0 && this.currentStageIndex < this.stages.length - 1) {
      this.events.push({
        time: this.state.time,
        type: "fuel_depleted",
        stageIndex: this.currentStageIndex,
        description: `Stage ${this.currentStageIndex + 1} fuel depleted`,
      });
      this.triggerStageSeparation();
      this.events.push({
        time: this.state.time,
        type: "ignition",
        stageIndex: this.currentStageIndex,
        description: `Stage ${this.currentStageIndex + 1} ignition`,
      });
    }

    // RK4 integration with N-body gravity
    this.state = rk4Step(
      this.state,
      dt,
      thrustVec,
      DEFAULT_DRAG_COEFFICIENT,
      DEFAULT_CROSS_SECTION,
      extraBodies
    );

    // Track delta-v used
    const currentVelocity = magnitude(this.state.velocity);
    this.totalDeltaVUsed += Math.abs(currentVelocity - this.lastVelocity);
    this.lastVelocity = currentVelocity;

    // Update SOI tracking
    this.lastSOIBody = this.currentSOIBody;
    this.currentSOIBody = getSOIBody(this.state.position, this.activeBodies, this.bodyPositions);

    // SOI transition events
    if (this.currentSOIBody !== this.lastSOIBody) {
      if (this.lastSOIBody === "earth" && this.currentSOIBody !== "earth") {
        const body = this.activeBodies.find((b) => b.id === this.currentSOIBody);
        this.events.push({
          time: this.state.time,
          type: "soi_enter",
          description: `Entered ${body?.name ?? this.currentSOIBody} sphere of influence`,
        });
      } else if (this.lastSOIBody !== "earth" && this.currentSOIBody === "earth") {
        const body = this.activeBodies.find((b) => b.id === this.lastSOIBody);
        this.events.push({
          time: this.state.time,
          type: "soi_exit",
          description: `Exited ${body?.name ?? this.lastSOIBody} sphere of influence`,
        });
      }
    }

    // Track closest approach to all bodies
    for (const body of this.activeBodies) {
      const dist = distanceToBody(this.state.position, body.id, this.bodyPositions);
      if (dist !== null) {
        const prev = this.state.closestApproach[body.id];
        if (prev === undefined || dist < prev) {
          this.state.closestApproach[body.id] = dist;
        }
      }
    }

    // Track target body approach/departure for flyby detection
    if (this.mission.requirements.targetBody) {
      const targetId = this.mission.requirements.targetBody;
      const dist = distanceToBody(this.state.position, targetId, this.bodyPositions);
      if (dist !== null) {
        if (this.lastTargetDistance !== null) {
          this.targetApproaching = dist < this.lastTargetDistance;
        }
        this.lastTargetDistance = dist;
      }
    }

    // Check termination conditions
    this.checkTermination();
  }

  private checkTermination(): void {
    // Skip termination checks if outcome already reached and sim was resumed
    if (this.outcomeReached) return;

    // Crash check (Earth surface)
    if (this.state.altitude < 0) {
      this.outcome = "crash";
      this.isRunning = false;
      return;
    }

    // Crash check: impact on a target body
    if (this.currentSOIBody !== "earth") {
      const body = this.activeBodies.find((b) => b.id === this.currentSOIBody);
      if (body) {
        const dist = distanceToBody(this.state.position, body.id, this.bodyPositions);
        if (dist !== null && dist < body.radius) {
          // For landing missions, this counts as success
          if (this.mission.requirements.targetBody === body.id &&
              this.mission.description.toLowerCase().includes("land")) {
            this.outcome = "mission_complete";
            this.isRunning = false;
            this.events.push({
              time: this.state.time,
              type: "target_reached",
              description: `Landed on ${body.name}!`,
            });
            return;
          }
          this.outcome = "crash";
          this.isRunning = false;
          return;
        }
      }
    }

    // Suborbital mission check
    if (this.mission.requirements.targetOrbit && !this.mission.requirements.targetBody) {
      const target = this.mission.requirements.targetOrbit;
      const isSuborbitalMission = target.periapsis.min === -Infinity;

      if (isSuborbitalMission && !this.suborbitalTargetReached && this.state.altitude >= target.apoapsis.min) {
        this.suborbitalTargetReached = true;
        this.events.push({
          time: this.state.time,
          type: "orbit_achieved",
          description: `Altitude ${(this.state.altitude / 1000).toFixed(0)}km reached — mission complete!`,
        });
      }

      if (isSuborbitalMission && this.suborbitalTargetReached) {
        const radialDir = normalize(this.state.position);
        const radialVelocity = dot(radialDir, this.state.velocity);
        if (radialVelocity < 0) {
          this.outcome = "mission_complete";
          this.isRunning = false;
        }
        return;
      }
    }

    // Target body missions (Tier 3+)
    if (this.mission.requirements.targetBody) {
      const targetId = this.mission.requirements.targetBody;
      const body = this.activeBodies.find((b) => b.id === targetId);

      if (body) {
        const dist = distanceToBody(this.state.position, targetId, this.bodyPositions);

        // Flyby detection: inside SOI, was approaching, now receding
        if (this.currentSOIBody === targetId && this.lastTargetDistance !== null && !this.targetApproaching) {
          // Check if this is a flyby mission (has targetBody but no specific orbit requirement for that body)
          const isFlybyMission = !this.mission.requirements.targetOrbit ||
            (this.mission.requirements.targetOrbit.periapsis.min === -Infinity);

          if (isFlybyMission) {
            const closestDist = this.state.closestApproach[targetId] ?? Infinity;
            this.outcome = "target_reached";
            this.isRunning = false;
            this.events.push({
              time: this.state.time,
              type: "target_reached",
              description: `${body.name} flyby complete! Closest approach: ${(closestDist / 1000).toFixed(0)}km`,
            });
            return;
          }
        }

        // Orbit detection around target body
        if (this.currentSOIBody === targetId && dist !== null) {
          const bodyPos = this.bodyPositions[targetId];
          const bodyVel = getBodyVelocity(body, this.state.time);

          const elements = orbitalElementsFromState(
            this.state.position,
            this.state.velocity,
            {
              mu: body.mu,
              bodyCenter: bodyPos,
              bodyVelocity: bodyVel,
              bodyRadius: body.radius,
              bodyId: targetId,
            }
          );

          if (isOrbitStable(elements) && elements.periapsis > 0) {
            this.outcome = "mission_complete";
            this.isRunning = false;
            this.events.push({
              time: this.state.time,
              type: "orbit_achieved",
              description: `Stable ${body.name} orbit achieved!`,
            });
            return;
          }
        }
      }
    }

    // Simple altitude check: if rocket reaches the target altitude with orbital-ish velocity, it's a success
    // This is the primary success check — no complex orbital element matching needed
    if (!this.mission.requirements.targetBody && this.mission.requirements.targetOrbit) {
      const target = this.mission.requirements.targetOrbit;
      const targetAltMin = isFinite(target.apoapsis.min) ? target.apoapsis.min : 0;

      if (targetAltMin > 0 && this.state.altitude >= targetAltMin) {
        const r = magnitude(this.state.position);
        const v = magnitude(this.state.velocity);
        const vCirc = Math.sqrt(EARTH_MU / r);

        // Must have at least 70% of circular velocity (not just floating up on a ballistic arc)
        if (v >= vCirc * 0.7) {
          this.outcome = "mission_complete";
          this.isRunning = false;
          this.events.push({
            time: this.state.time,
            type: "orbit_achieved",
            description: `Target altitude reached at ${(this.state.altitude / 1000).toFixed(0)}km!`,
          });
          return;
        }
      }
    }

    // Earth orbit checks (for missions without targetBody)
    if (!this.mission.requirements.targetBody && this.state.altitude > 100_000) {
      const r = magnitude(this.state.position);
      const v = magnitude(this.state.velocity);
      const vCircular = Math.sqrt(EARTH_MU / r);

      if (!this.mission.requirements.targetOrbit) {
        // No target orbit — any stable orbit counts
        const rDir = normalize(this.state.position);
        const radialV = dot(rDir, this.state.velocity);
        const tangentialV = Math.sqrt(Math.max(0, v * v - radialV * radialV));

        if (tangentialV >= vCircular * 0.99 && Math.abs(radialV) < vCircular * 0.15) {
          this.outcome = "orbit_achieved";
          this.isRunning = false;
          this.events.push({
            time: this.state.time,
            type: "orbit_achieved",
            description: `Orbit achieved at ${(this.state.altitude / 1000).toFixed(0)}km!`,
          });
          return;
        }
      }
      // Missions WITH target orbits use the simple altitude check above — no additional checks here
    }

    // Solar escape detection (for Tier 5 escape mission)
    if (this.mission.tier === 5 && !this.mission.requirements.targetBody) {
      // Earth escape velocity at current distance
      const r = magnitude(this.state.position);
      const v = magnitude(this.state.velocity);
      const escapeV = Math.sqrt(2 * 3.986e14 / r); // Earth mu
      if (v > escapeV && this.state.altitude > 1e7) {
        this.outcome = "escaped";
        this.isRunning = false;
        this.events.push({
          time: this.state.time,
          type: "orbit_achieved",
          description: "Escape velocity achieved!",
        });
        return;
      }
    }

    // All fuel exhausted across all remaining stages and periapsis below surface
    const remainingFuel = this.stages
      .slice(this.currentStageIndex)
      .reduce((sum, s) => sum + s.fuelRemaining, 0);

    if (remainingFuel <= 0 && this.state.altitude > 100_000) {
      const elements = orbitalElementsFromState(
        this.state.position,
        this.state.velocity
      );

      // If orbit will reach the target altitude, trigger validation instead of failure
      if (this.mission.requirements.targetOrbit && !this.validationTriggered) {
        const target = this.mission.requirements.targetOrbit;
        const targetAltMin = isFinite(target.apoapsis.min) ? target.apoapsis.min : 0;
        if (elements.apoapsis >= targetAltMin * 0.9 && elements.periapsis > -50_000) {
          this.validationTriggered = true;
          this.events.push({
            time: this.state.time,
            type: "orbit_achieved",
            description: `Fuel exhausted — coasting to ${(elements.apoapsis / 1000).toFixed(0)}km apoapsis for validation...`,
          });
          return; // Don't declare suborbital — let it coast
        }
      }

      if (elements.periapsis < 0) {
        this.outcome = "suborbital";
        this.isRunning = false;
      }
    }
  }

  private recordSnapshot(): void {
    // Compute orbital elements relative to current SOI body
    let orbitalElements: OrbitalElements | null = null;
    if (this.currentSOIBody !== "earth") {
      const body = this.activeBodies.find((b) => b.id === this.currentSOIBody);
      if (body) {
        const bodyPos = this.bodyPositions[this.currentSOIBody];
        const bodyVel = getBodyVelocity(body, this.state.time);
        orbitalElements = orbitalElementsFromState(
          this.state.position,
          this.state.velocity,
          {
            mu: body.mu,
            bodyCenter: bodyPos,
            bodyVelocity: bodyVel,
            bodyRadius: body.radius,
            bodyId: this.currentSOIBody,
          }
        );
      }
    } else if (this.state.altitude > 50_000) {
      orbitalElements = orbitalElementsFromState(
        this.state.position,
        this.state.velocity
      );
    }

    // Downrange: arc length along Earth's surface from launch point
    const currentAngle = Math.atan2(this.state.position.y, this.state.position.x);
    const angleTraveled = currentAngle - this.launchAngle;
    const downrangeDistance = Math.abs(angleTraveled) * EARTH_RADIUS;

    // Distance to target body
    const targetId = this.mission.requirements.targetBody;
    const distToTarget = targetId
      ? distanceToBody(this.state.position, targetId, this.bodyPositions)
      : null;

    this.history.push({
      time: this.state.time,
      altitude: this.state.altitude,
      velocity: magnitude(this.state.velocity),
      velocityVector: { ...this.state.velocity },
      downrangeDistance,
      mass: this.state.mass,
      fuel: this.state.fuel,
      currentStage: this.currentStageIndex,
      throttle: this.throttle,
      pitchAngle: this.pitchAngle,
      orbitalElements,
      position: { ...this.state.position },
      currentSOIBody: this.currentSOIBody,
      distanceToTarget: distToTarget,
      bodyPositions: { ...this.bodyPositions },
    });
  }

  /** Get the flight result after simulation completes */
  getResult(): FlightResult {
    const finalOrbit =
      this.state.altitude > 100_000
        ? orbitalElementsFromState(this.state.position, this.state.velocity)
        : null;

    return {
      outcome: this.outcome ?? "fuel_exhausted",
      history: [...this.history],
      finalOrbit,
      totalDeltaVUsed: this.totalDeltaVUsed,
      maxAltitude: Math.max(...this.history.map((s) => s.altitude)),
      flightDuration: this.state.time,
      closestApproach: { ...this.state.closestApproach },
    };
  }

  /** Get current orbital elements (null if below 50km from current SOI body) */
  getCurrentOrbit(): OrbitalElements | null {
    if (this.currentSOIBody !== "earth") {
      const body = this.activeBodies.find((b) => b.id === this.currentSOIBody);
      if (body) {
        const bodyPos = this.bodyPositions[this.currentSOIBody];
        const bodyVel = getBodyVelocity(body, this.state.time);
        return orbitalElementsFromState(
          this.state.position,
          this.state.velocity,
          {
            mu: body.mu,
            bodyCenter: bodyPos,
            bodyVelocity: bodyVel,
            bodyRadius: body.radius,
            bodyId: this.currentSOIBody,
          }
        );
      }
    }
    if (this.state.altitude < 50_000) return null;
    return orbitalElementsFromState(this.state.position, this.state.velocity);
  }
}
