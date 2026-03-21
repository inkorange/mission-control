import { EARTH_RADIUS, EARTH_MU, FIXED_DT, DEFAULT_DRAG_COEFFICIENT, DEFAULT_CROSS_SECTION, G0, SUN_MU, SUN_DISTANCE } from "../physics/constants";
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
import type { Vector2D, SimState, FlightSnapshot, FlightResult, FlightOutcome, OrbitalElements, ProjectedPoint } from "@/types/physics";
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
  private throttleLocked: boolean; // Prevents external throttle override after auto-cutoff
  private launchAngle: number;
  private projectedPath: ProjectedPoint[]; // Coast trajectory computed at TLI cutoff

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
    this.throttleLocked = false;
    this.launchAngle = Math.atan2(this.state.position.y, this.state.position.x);
    this.projectedPath = [];

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

  /** Whether the engine has been auto-cut for a transfer orbit (coasting to target body) */
  get isCoasting(): boolean {
    return this.throttleLocked && !this.outcome;
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
    // Auto-cutoff has locked throttle — ignore external changes
    if (this.throttleLocked) return;

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
    if (this.state.altitude > 100_000 && !this.outcomeReached) {
      const target = this.mission.requirements.targetOrbit;
      const targetBody = this.mission.requirements.targetBody;
      const checkElements = orbitalElementsFromState(this.state.position, this.state.velocity);

      if (targetBody) {
        // === TARGET BODY MISSIONS (Moon, Mars, etc.) ===
        // Only cut throttle when the computed apoapsis actually reaches the body's orbital altitude.
        // Do NOT use velocity checks — they fire mid-burn before the orbit is shaped correctly.
        const body = this.activeBodies.find((b) => b.id === targetBody);
        if (body && !this.throttleLocked) {
          // Determine if transfer orbit reaches the target body.
          // For cislunar bodies (Moon): check Earth-centric apoapsis.
          // For interplanetary bodies (Mars, Jupiter, etc.): use C3 energy (hyperbolic excess
          // velocity). Earth-centric apoapsis doesn't work because the target is outside Earth's
          // SOI — the orbit jumps from elliptical to hyperbolic in one timestep, skipping the check.
          const isInterplanetary = body.parentBody === "sun";
          let transferReached = false;

          if (isInterplanetary) {
            // Required C3 for a Hohmann transfer to the target body's heliocentric orbit
            const r_earth = SUN_DISTANCE;
            const r_target = body.orbitRadius;
            const a_transfer = (r_earth + r_target) / 2;
            const v_departure = Math.sqrt(SUN_MU * (2 / r_earth - 1 / a_transfer));
            const v_earth = Math.sqrt(SUN_MU / r_earth);
            const v_infinity = v_departure - v_earth;
            const requiredC3 = v_infinity * v_infinity;

            // Current specific orbital energy relative to Earth
            const r = magnitude(this.state.position);
            const v = magnitude(this.state.velocity);
            const currentEnergy = (v * v) / 2 - EARTH_MU / r;
            const currentC3 = Math.max(0, 2 * currentEnergy);

            transferReached = currentC3 >= requiredC3;
          } else {
            // Cislunar: apoapsis must reach the body's orbital altitude
            const transferApoapsis = body.orbitRadius - EARTH_RADIUS;
            transferReached = checkElements.apoapsis >= transferApoapsis;
          }

          if (transferReached) {
            this.throttle = 0;
            this.throttleLocked = true;

            const bodyName = body.name;

            // Flyby missions: don't declare success yet — coast to the target body
            // and let flyby detection in checkTermination() verify the actual encounter.
            const isFlybyMission = this.mission.requirements.targetOrbit?.periapsis.min === -Infinity;

            if (isFlybyMission) {
              this.events.push({
                time: this.state.time,
                type: "burn_stop",
                description: `Transfer orbit to ${bodyName} established — coasting to target...`,
              });
              // Compute the projected coast path from cutoff state to target body SOI
              this.projectedPath = this.computeProjectedPath();
              // Don't set outcome — let the sim coast and detect the actual flyby
              return;
            }

            // Orbit insertion missions: check if enough remaining ΔV for capture burn
            const remainingStages = this.stages.slice(this.currentStageIndex);
            let remainingDV = 0;
            let mass = this.state.mass;
            for (const s of remainingStages) {
              if (s.fuelRemaining <= 0) continue;
              const isp = s.avgIspVacuum;
              const dryM = mass - s.fuelRemaining;
              if (dryM > 0) remainingDV += isp * 9.80665 * Math.log((dryM + s.fuelRemaining) / dryM);
              mass = dryM;
            }

            const canInsertOrbit = remainingDV >= 600;
            if (canInsertOrbit) {
              this.outcome = "mission_complete";
              this.isRunning = false;
              this.events.push({
                time: this.state.time,
                type: "orbit_achieved",
                description: `Transfer to ${bodyName} confirmed — orbit insertion ΔV available!`,
              });
            } else {
              this.outcome = "target_reached";
              this.isRunning = false;
              this.events.push({
                time: this.state.time,
                type: "target_reached",
                description: `Transfer orbit to ${bodyName} confirmed — insufficient ΔV for orbit insertion`,
              });
            }
            // Compute the projected coast path from cutoff state to target body SOI
            this.projectedPath = this.computeProjectedPath();
            return;
          }
        }
      } else {
        // === EARTH ORBIT MISSIONS ===
        const cutoffApoapsis = target && isFinite(target.apoapsis.max) ? target.apoapsis.max : Infinity;

        if (isFinite(cutoffApoapsis)) {
          const r = magnitude(this.state.position);
          const v = magnitude(this.state.velocity);
          const targetR = cutoffApoapsis + EARTH_RADIUS;
          const aTransfer = (r + targetR) / 2;
          const vNeeded = Math.sqrt(EARTH_MU * (2 / r - 1 / aTransfer));
          const reachedTransferVelocity = v >= vNeeded;
          const apoapsisInRange = checkElements.apoapsis > cutoffApoapsis * 0.7 && checkElements.periapsis > -100_000;

          if (apoapsisInRange && reachedTransferVelocity) {
            this.throttle = 0;
            this.throttleLocked = true;

            if (!this.validationTriggered) {
              const targetAltMin = target && isFinite(target.apoapsis.min) ? target.apoapsis.min : 0;
              if (targetAltMin > 0 && this.state.altitude < targetAltMin) {
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
    // Crash check (Earth surface) — runs even after success so rocket doesn't go underground
    if (this.state.altitude < 0) {
      const isSuborbitalMission =
        this.mission.requirements.targetOrbit?.periapsis.min === -Infinity &&
        !this.mission.requirements.targetBody;
      // If suborbital target was reached, sim was resumed for post-success viewing — stop cleanly
      if (!this.outcomeReached) {
        this.outcome =
          isSuborbitalMission && !this.suborbitalTargetReached ? "suborbital" : "crash";
      }
      this.isRunning = false;
      return;
    }

    // Skip all other termination checks if outcome already reached and sim was resumed for viewing
    if (this.outcomeReached) return;

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
        this.outcome = "mission_complete";
        this.isRunning = false;
        this.events.push({
          time: this.state.time,
          type: "orbit_achieved",
          description: `Altitude ${(this.state.altitude / 1000).toFixed(0)}km reached — mission complete!`,
        });
        return;
      }

      if (isSuborbitalMission) {
        return; // Suborbital mission: no further checks needed
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
          // Check if this is a flyby mission: must have targetOrbit with periapsis.min === -Infinity
          // Missions with no targetOrbit (e.g. Lunar Orbit) require actual orbit insertion
          const isFlybyMission =
            this.mission.requirements.targetOrbit?.periapsis.min === -Infinity;

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

    // ===================================================================
    // UNIFIED MISSION SUCCESS/FAILURE DETECTION
    // Used for ALL missions (Earth orbit AND target body)
    // ===================================================================
    if (this.state.altitude > 80_000) {
      const r = magnitude(this.state.position);
      const v = magnitude(this.state.velocity);
      const vCircular = Math.sqrt(EARTH_MU / r);
      const escapeV = Math.sqrt(2 * EARTH_MU / r);
      const elements = orbitalElementsFromState(this.state.position, this.state.velocity);
      const target = this.mission.requirements.targetOrbit;
      const targetAltMin = target && isFinite(target.apoapsis.min) ? target.apoapsis.min : 0;

      // Remaining fuel across all stages
      const remainingFuel = this.stages
        .slice(this.currentStageIndex)
        .reduce((sum, s) => sum + s.fuelRemaining, 0);

      // --- SUCCESS CHECK 1: Reached target altitude ---
      // For high orbits/transfers, velocity at apoapsis is naturally very low — just check altitude
      if (target && targetAltMin > 0 && this.state.altitude >= targetAltMin) {
        this.outcome = "mission_complete";
        this.isRunning = false;
        this.events.push({
          time: this.state.time,
          type: "orbit_achieved",
          description: `Target altitude reached at ${(this.state.altitude / 1000).toFixed(0)}km!`,
        });
        return;
      }

      // --- SUCCESS CHECK 2: Any stable Earth orbit (no target, or target with min=0 meaning "any orbit") ---
      // Skip for target body missions — they require reaching and orbiting the target, not just any Earth orbit
      const isAnyOrbitOk = (!target || (targetAltMin === 0)) && !this.mission.requirements.targetBody;
      if (isAnyOrbitOk) {
        const rDir = normalize(this.state.position);
        const radialV = dot(rDir, this.state.velocity);
        const tangentialV = Math.sqrt(Math.max(0, v * v - radialV * radialV));

        if (tangentialV >= vCircular * 0.99 && Math.abs(radialV) < vCircular * 0.15) {
          this.outcome = target ? "mission_complete" : "orbit_achieved";
          this.isRunning = false;
          this.events.push({
            time: this.state.time,
            type: "orbit_achieved",
            description: `Orbit achieved at ${(this.state.altitude / 1000).toFixed(0)}km!`,
          });
          return;
        }
      }

      // --- SUCCESS CHECK 3: Solar escape ---
      // Skip for target body missions — escaping Earth is necessary but not sufficient;
      // they need to actually reach the target body.
      if (v > escapeV && this.state.altitude > 1e7 && !this.mission.requirements.targetBody) {
        this.outcome = "escaped";
        this.isRunning = false;
        this.events.push({
          time: this.state.time,
          type: "orbit_achieved",
          description: "Escape velocity achieved!",
        });
        return;
      }

      // --- FUEL EXHAUSTED CHECKS (only when all fuel is gone) ---
      if (remainingFuel <= 0) {

        // Will the orbit reach the target? If so, coast to validate
        // Skip for target body missions — they use the auto-cutoff path instead,
        // and the 90% threshold here would trigger validation before the orbit
        // actually reaches the target body's distance.
        if (target && targetAltMin > 0 && !this.validationTriggered && !this.mission.requirements.targetBody) {
          if (elements.apoapsis >= targetAltMin * 0.9 && elements.periapsis > -50_000) {
            this.validationTriggered = true;
            this.events.push({
              time: this.state.time,
              type: "orbit_achieved",
              description: `Orbit confirmed — coasting to ${(elements.apoapsis / 1000).toFixed(0)}km for validation...`,
            });
            return;
          }
        }

        // Periapsis below surface = suborbital (will crash)
        // Skip for actual suborbital missions — they should coast to their natural apoapsis first
        const isSuborbitalMission =
          this.mission.requirements.targetOrbit?.periapsis.min === -Infinity &&
          !this.mission.requirements.targetBody;
        if (elements.periapsis < 0 && !isSuborbitalMission) {
          this.outcome = "suborbital";
          this.isRunning = false;
          return;
        }

        // Stable orbit
        if (elements.periapsis > 0) {
          // Target body missions: a stable Earth orbit is NOT success — need to reach the target body.
          // Let the sim continue coasting (the time limit will eventually make a determination).
          if (this.mission.requirements.targetBody) {
            // Don't terminate — the rocket is in Earth orbit but hasn't reached the target body yet.
            // The time limit check (below) or the target body detection (above) will handle the outcome.
            return;
          }

          // Check if orbit satisfies the target requirements
          const meetsTarget = target
            ? elements.periapsis >= (isFinite(target.periapsis.min) ? target.periapsis.min : 0) &&
              elements.apoapsis >= (isFinite(target.apoapsis.min) ? target.apoapsis.min : 0) &&
              elements.apoapsis <= (isFinite(target.apoapsis.max) ? target.apoapsis.max : Infinity)
            : false;
          this.outcome = meetsTarget ? "mission_complete" : "orbit_achieved";
          this.isRunning = false;
          this.events.push({
            time: this.state.time,
            type: "orbit_achieved",
            description: targetAltMin > 0 && !meetsTarget
              ? `Orbit achieved (apoapsis: ${(elements.apoapsis / 1000).toFixed(0)}km) — target was ${(targetAltMin / 1000).toFixed(0)}km. Need more delta-v!`
              : `Orbit achieved at ${(this.state.altitude / 1000).toFixed(0)}km!`,
          });
          return;
        }
      }
    }

    // Lost to space — rocket has escaped too far from Earth
    // For non-escape missions, if altitude exceeds 2x the Moon's distance, it's lost
    const maxAlt = this.mission.requirements.targetBody === "mars" ? 300e9
      : this.mission.requirements.targetBody === "jupiter" ? 1e12
      : this.mission.requirements.targetBody === "saturn" ? 2e12
      : 800_000_000; // 800,000 km (2x Moon distance) for lunar / Earth orbit missions

    if (this.state.altitude > maxAlt) {
      this.outcome = "crash"; // "Lost to space"
      this.isRunning = false;
      this.events.push({
        time: this.state.time,
        type: "abort",
        description: `Lost to space — exceeded ${(maxAlt / 1e6).toFixed(0)}Mm from Earth`,
      });
      return;
    }

    // Time limit for target body missions — if coasting for too long, make a determination
    // Lunar transfer ~3 days, Mars ~9 months. Allow generous limits.
    if (this.mission.requirements.targetBody) {
      const targetId = this.mission.requirements.targetBody;
      const maxSimTime: Record<string, number> = {
        moon: 30 * 86400,       // 30 days — full lunar orbit period; slow transfers still succeed
        mars: 400 * 86400,      // 400 days
        jupiter: 2000 * 86400,  // 2000 days
        saturn: 3000 * 86400,   // 3000 days
      };
      const limit = maxSimTime[targetId] ?? 60 * 86400;

      if (this.state.time > limit) {
        const dist = distanceToBody(this.state.position, targetId, this.bodyPositions);
        const body = this.activeBodies.find((b) => b.id === targetId);
        const inSOI = this.currentSOIBody === targetId;
        const bodyRadius = body?.radius ?? 0;
        const soiRadius = body?.soiRadius ?? 0;
        const nearSOI = dist !== null && soiRadius > 0 && dist < soiRadius * 2;

        if (inSOI || nearSOI) {
          // Made it to (or very near) the target's SOI — partial success
          this.outcome = "target_reached";
          this.isRunning = false;
          this.events.push({
            time: this.state.time,
            type: "target_reached",
            description: `Reached ${body?.name ?? targetId} after ${(this.state.time / 86400).toFixed(1)} days`,
          });
        } else {
          // Didn't reach target in time — failed
          this.outcome = "fuel_exhausted";
          this.isRunning = false;
          this.events.push({
            time: this.state.time,
            type: "burn_stop",
            description: `Failed to reach ${body?.name ?? targetId} — distance: ${dist ? (dist / 1000).toFixed(0) + 'km' : 'unknown'}`,
          });
        }
        return;
      }
    }

    // Target body validation is handled by the apoapsis check in the auto-cutoff block above.
    // Do not trigger it here on fuel exhaustion — that fires too early (e.g. when first stage burns out in LEO).
  }

  /**
   * Compute a fast N-body coast trajectory from the current state to the target body's SOI.
   * Uses 1-hour timesteps with no thrust. Runs synchronously at cutoff time.
   */
  private computeProjectedPath(): ProjectedPoint[] {
    const points: ProjectedPoint[] = [];
    const targetId = this.mission.requirements.targetBody;
    if (!targetId) return points;
    const body = this.activeBodies.find((b) => b.id === targetId);
    if (!body) return points;

    // Deep-copy state so we don't mutate the live sim state
    let state: SimState = {
      position: { ...this.state.position },
      velocity: { ...this.state.velocity },
      mass: this.state.mass,
      time: this.state.time,
      altitude: this.state.altitude,
      fuel: this.state.fuel,
      closestApproach: { ...this.state.closestApproach },
    };

    // Cislunar: 1-minute timesteps, up to 30 days (safe at LEO orbital period ~90 min).
    // Interplanetary: 10-minute timesteps, up to 300 days (Mars transfer ~9 months).
    const isInterplanetary = body.parentBody === "sun";
    const dt = isInterplanetary ? 600 : 60;
    const maxDays = isInterplanetary ? 300 : 30;
    const maxSteps = maxDays * 24 * (3600 / dt);
    // Sample rate: ~240-300 points for the trajectory
    const sampleEvery = isInterplanetary ? 144 : 30; // every 24h or 30min

    for (let step = 0; step <= maxSteps; step++) {
      const bodyPositions = computeBodyPositions(this.activeBodies, state.time);

      if (step % sampleEvery === 0 || step === 0) {
        points.push({
          time: state.time,
          position: { ...state.position },
          altitude: state.altitude,
          bodyPositions,
        });
      }

      // Stop when we enter the target body's SOI
      const dist = distanceToBody(state.position, targetId, bodyPositions);
      if (dist !== null && dist < body.soiRadius) {
        // Always include the SOI-entry point
        points.push({
          time: state.time,
          position: { ...state.position },
          altitude: state.altitude,
          bodyPositions,
        });
        break;
      }

      const extraBodies: GravBody[] = this.activeBodies.map((b) => ({
        mu: b.mu,
        position: bodyPositions[b.id],
      }));

      state = rk4Step(state, dt, { x: 0, y: 0 }, 0, 0, extraBodies);
    }

    return points;
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
      projectedPath: this.projectedPath.length > 0 ? [...this.projectedPath] : undefined,
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
