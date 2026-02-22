import { EARTH_RADIUS, FIXED_DT, DEFAULT_DRAG_COEFFICIENT, DEFAULT_CROSS_SECTION, G0 } from "../physics/constants";
import { rk4Step, createLaunchState } from "../physics/trajectory";
import { massFlowRate } from "../physics/tsiolkovsky";
import { orbitalElementsFromState, isOrbitStable } from "../physics/orbit";
import { magnitude, normalize, scale, rotate } from "@/lib/math";
import { degToRad } from "@/lib/math";
import type { Vector2D, SimState, FlightSnapshot, FlightResult, FlightOutcome, OrbitalElements } from "@/types/physics";
import type { RocketConfig, EngineDef } from "@/types/rocket";
import type { Mission, OrbitalTarget } from "@/types/mission";

export interface FlightEvent {
  time: number;
  type: "ignition" | "stage_separation" | "fuel_depleted" | "burn_start" | "burn_stop" | "abort" | "orbit_achieved";
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

  /** Check if sim is still running */
  get running(): boolean {
    return this.isRunning;
  }

  /** Get current outcome (null if still running) */
  get currentOutcome(): FlightOutcome | null {
    return this.outcome;
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

  /** Set time warp */
  setTimeScale(scale: number): void {
    this.timeScale = Math.max(1, Math.min(100, scale));
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
    if (!this.isRunning || this.outcome) return;

    const dtSim = dtReal * this.timeScale;
    const steps = Math.max(1, Math.ceil(dtSim / FIXED_DT));
    const actualDt = dtSim / steps;

    for (let i = 0; i < steps; i++) {
      this.physicsStep(actualDt);
      if (this.outcome) break;
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

    // Determine effective thrust and Isp based on altitude
    const altFraction = Math.min(1, this.state.altitude / 100_000);
    const effectiveThrust =
      stage.totalThrustSL + (stage.totalThrust - stage.totalThrustSL) * altFraction;
    const effectiveIsp =
      stage.avgIspSeaLevel +
      (stage.avgIspVacuum - stage.avgIspSeaLevel) * altFraction;

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

    // RK4 integration
    this.state = rk4Step(
      this.state,
      dt,
      thrustVec,
      DEFAULT_DRAG_COEFFICIENT,
      DEFAULT_CROSS_SECTION
    );

    // Track delta-v used
    const currentVelocity = magnitude(this.state.velocity);
    this.totalDeltaVUsed += Math.abs(currentVelocity - this.lastVelocity);
    this.lastVelocity = currentVelocity;

    // Check termination conditions
    this.checkTermination();
  }

  private checkTermination(): void {
    // Crash check
    if (this.state.altitude < 0) {
      this.outcome = "crash";
      this.isRunning = false;
      return;
    }

    // Suborbital mission check: if the mission only requires reaching an altitude
    // (periapsis.min is -Infinity), check altitude directly without requiring a stable orbit
    if (this.mission.requirements.targetOrbit) {
      const target = this.mission.requirements.targetOrbit;
      const isSuborbitalMission = target.periapsis.min === -Infinity;

      if (isSuborbitalMission && this.state.altitude >= target.apoapsis.min) {
        this.outcome = "mission_complete";
        this.isRunning = false;
        this.events.push({
          time: this.state.time,
          type: "orbit_achieved",
          description: `Altitude ${(this.state.altitude / 1000).toFixed(0)}km reached — mission complete!`,
        });
        return;
      }
    }

    // Check orbital status when above atmosphere
    if (this.state.altitude > 100_000) {
      const elements = orbitalElementsFromState(
        this.state.position,
        this.state.velocity
      );

      // Check if we've achieved a stable orbit
      if (isOrbitStable(elements)) {
        // Check if it matches mission target
        if (this.mission.requirements.targetOrbit) {
          const target = this.mission.requirements.targetOrbit;
          if (
            elements.periapsis >= target.periapsis.min &&
            elements.periapsis <= target.periapsis.max &&
            elements.apoapsis >= target.apoapsis.min &&
            elements.apoapsis <= target.apoapsis.max
          ) {
            this.outcome = "mission_complete";
            this.isRunning = false;
            this.events.push({
              time: this.state.time,
              type: "orbit_achieved",
              description: "Target orbit achieved!",
            });
            return;
          }
        }

        // Generic orbit achieved (periapsis above atmosphere)
        if (elements.periapsis > 100_000) {
          // If no specific target, any stable orbit counts
          if (!this.mission.requirements.targetOrbit) {
            this.outcome = "orbit_achieved";
            this.isRunning = false;
            this.events.push({
              time: this.state.time,
              type: "orbit_achieved",
              description: "Stable orbit achieved",
            });
            return;
          }
        }
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
      if (elements.periapsis < 0) {
        this.outcome = "suborbital";
        this.isRunning = false;
      }
    }
  }

  private recordSnapshot(): void {
    let orbitalElements: OrbitalElements | null = null;
    if (this.state.altitude > 50_000) {
      orbitalElements = orbitalElementsFromState(
        this.state.position,
        this.state.velocity
      );
    }

    this.history.push({
      time: this.state.time,
      altitude: this.state.altitude,
      velocity: magnitude(this.state.velocity),
      downrangeDistance: 0, // Simplified for now
      mass: this.state.mass,
      fuel: this.state.fuel,
      currentStage: this.currentStageIndex,
      throttle: this.throttle,
      pitchAngle: this.pitchAngle,
      orbitalElements,
      position: { ...this.state.position },
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
    };
  }

  /** Get current orbital elements (null if below 50km) */
  getCurrentOrbit(): OrbitalElements | null {
    if (this.state.altitude < 50_000) return null;
    return orbitalElementsFromState(this.state.position, this.state.velocity);
  }
}
