"use client";

import { useState, useEffect, useCallback } from "react";
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

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't capture when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key.toLowerCase()) {
        case " ":
          e.preventDefault();
          isPaused ? resume() : pause();
          break;
        case "z":
          handleThrottleChange(Math.max(0, throttle - 10));
          break;
        case "x":
          handleThrottleChange(Math.min(100, throttle + 10));
          break;
        case "s":
          if (canStage) onStaging();
          break;
        case "1":
          onWarpChange(1);
          break;
        case "2":
          onWarpChange(5);
          break;
        case "3":
          onWarpChange(10);
          break;
        case "4":
          onWarpChange(50);
          break;
        case "5":
          onWarpChange(100);
          break;
      }
    },
    [isPaused, pause, resume, throttle, canStage, onStaging, onWarpChange, handleThrottleChange]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

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
          className="slider-filled"
          style={{
            '--fill': `${throttle}%`,
            '--slider-color': 'var(--nasa-red)',
          } as React.CSSProperties}
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
          className="slider-filled"
          style={{
            '--fill': `${(pitch / 90) * 100}%`,
            '--slider-color': 'var(--nasa-blue-light)',
          } as React.CSSProperties}
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

      {/* Keyboard shortcuts hint */}
      <div className="pt-2 border-t border-[var(--border)]">
        <p className="font-mono text-[0.5rem] tracking-wider text-[var(--muted)]/60 leading-relaxed">
          SPC=Pause &middot; Z/X=Throttle &middot; S=Stage &middot; 1-5=Warp
        </p>
      </div>
    </div>
  );
}
