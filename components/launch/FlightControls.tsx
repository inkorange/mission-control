"use client";

import { useState } from "react";
import { useFlightStore } from "@/stores/useFlightStore";

interface FlightControlsProps {
  onThrottleChange: (value: number) => void;
  onPitchChange: (degrees: number) => void;
  onStaging: () => void;
  onAbort: () => void;
  onWarpChange: (scale: number) => void;
  stageCount: number;
  currentStage: number;
}

const WARP_OPTIONS = [1, 5, 10, 50, 100];

export default function FlightControls({
  onThrottleChange,
  onPitchChange,
  onStaging,
  onAbort,
  onWarpChange,
  stageCount,
  currentStage,
}: FlightControlsProps) {
  const { isPaused, pause, resume, timeScale, isActive } = useFlightStore();
  const [throttle, setThrottle] = useState(100);
  const [pitch, setPitch] = useState(0);

  const handleThrottleChange = (value: number) => {
    setThrottle(value);
    onThrottleChange(value / 100);
  };

  const handlePitchChange = (value: number) => {
    setPitch(value);
    onPitchChange(value);
  };

  const canStage = currentStage < stageCount - 1;

  return (
    <div className="space-y-3">
      {/* Throttle */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-[var(--muted)]">
            Throttle
          </span>
          <span className="font-mono text-[0.7rem] text-[var(--data)]">
            {throttle}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={throttle}
          onChange={(e) => handleThrottleChange(Number(e.target.value))}
          className="w-full h-1.5 appearance-none bg-[var(--border)] rounded-full cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--nasa-red)] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer
            [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:bg-[var(--nasa-red)] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
        />
        <div className="flex justify-between mt-0.5">
          <button
            onClick={() => handleThrottleChange(0)}
            className="font-mono text-[0.55rem] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            CUT
          </button>
          <button
            onClick={() => handleThrottleChange(100)}
            className="font-mono text-[0.55rem] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            MAX
          </button>
        </div>
      </div>

      {/* Pitch */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-[var(--muted)]">
            Pitch
          </span>
          <span className="font-mono text-[0.7rem] text-[var(--data)]">
            {pitch}°
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={90}
          step={1}
          value={pitch}
          onChange={(e) => handlePitchChange(Number(e.target.value))}
          className="w-full h-1.5 appearance-none bg-[var(--border)] rounded-full cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[var(--nasa-blue-light)] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer
            [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:bg-[var(--nasa-blue-light)] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
        />
        <div className="flex justify-between mt-0.5">
          <span className="font-mono text-[0.55rem] text-[var(--muted)]">
            Vertical
          </span>
          <span className="font-mono text-[0.55rem] text-[var(--muted)]">
            Horizontal
          </span>
        </div>
      </div>

      {/* Time Warp */}
      <div>
        <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-[var(--muted)] block mb-1.5">
          Time Warp
        </span>
        <div className="flex gap-1">
          {WARP_OPTIONS.map((w) => (
            <button
              key={w}
              onClick={() => onWarpChange(w)}
              className={`flex-1 py-1 font-mono text-[0.7rem] rounded-sm border transition-colors ${
                timeScale === w
                  ? "border-[var(--nasa-blue-light)] bg-[var(--nasa-blue)]/20 text-[var(--nasa-blue-light)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--foreground)]/30"
              }`}
            >
              {w}x
            </button>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2 pt-2 border-t border-[var(--border)]">
        {/* Pause / Resume */}
        <button
          onClick={() => (isPaused ? resume() : pause())}
          className="w-full py-2 font-mono text-[0.75rem] tracking-[0.1em] uppercase rounded-sm border border-[var(--border)] hover:border-[var(--foreground)]/30 text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors"
        >
          {isPaused ? "Resume" : "Pause"}
        </button>

        {/* Stage Separation */}
        <button
          onClick={onStaging}
          disabled={!canStage}
          className={`w-full py-2 font-mono text-[0.75rem] tracking-[0.1em] uppercase rounded-sm border transition-colors ${
            canStage
              ? "border-[var(--nasa-gold)]/40 text-[var(--nasa-gold)] hover:bg-[var(--nasa-gold)]/10 hover:border-[var(--nasa-gold)]"
              : "border-[var(--border)] text-[var(--muted)] cursor-not-allowed opacity-50"
          }`}
        >
          Stage Separation
        </button>

        {/* Abort */}
        <button
          onClick={onAbort}
          className="w-full py-2 font-mono text-[0.75rem] tracking-[0.1em] uppercase rounded-sm border border-[var(--nasa-red)]/40 text-[var(--nasa-red)] hover:bg-[var(--nasa-red)]/10 hover:border-[var(--nasa-red)] transition-colors"
        >
          Abort Mission
        </button>
      </div>
    </div>
  );
}
