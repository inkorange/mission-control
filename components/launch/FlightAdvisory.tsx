"use client";

import { useEffect, useState, useRef } from "react";
import type { FlightSnapshot } from "@/types/physics";

interface FlightAdvisoryProps {
  snapshot: FlightSnapshot | null;
  pitch: number;
  hasResult: boolean;
}

interface Advisory {
  id: string;
  message: string;
  priority: "info" | "warning" | "action";
}

/**
 * Flight director advisories — contextual hints and callouts
 * based on current flight state, like real mission control guidance.
 */
export default function FlightAdvisory({
  snapshot,
  pitch,
  hasResult,
}: FlightAdvisoryProps) {
  const [advisory, setAdvisory] = useState<Advisory | null>(null);
  const [visible, setVisible] = useState(false);
  const lastAdvisoryId = useRef("");
  const dismissedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!snapshot || hasResult) {
      setVisible(false);
      return;
    }

    const alt = snapshot.altitude;
    const vel = snapshot.velocity;
    const time = snapshot.time;

    let next: Advisory | null = null;

    // Phase 1: Just after launch, remind about gravity turn
    if (alt > 1_000 && alt < 8_000 && pitch === 0 && time > 5) {
      next = {
        id: "start-pitch",
        message: "GUIDANCE — Begin gravity turn. Pitch to 10-15° to start building horizontal velocity.",
        priority: "action",
      };
    }
    // Phase 2: Getting higher, should be pitching more
    else if (alt >= 8_000 && alt < 30_000 && pitch < 20) {
      next = {
        id: "increase-pitch",
        message: "GUIDANCE — Increase pitch. Target 30-45° by 30 km altitude for efficient orbit insertion.",
        priority: "warning",
      };
    }
    // Phase 3: Above 30km, should be well into gravity turn
    else if (alt >= 30_000 && alt < 70_000 && pitch < 40) {
      next = {
        id: "pitch-aggressive",
        message: "GUIDANCE — Pitch too shallow. Recommend 45-60° to build orbital velocity before reaching target altitude.",
        priority: "warning",
      };
    }
    // Phase 4: Approaching Kármán line, should be nearly horizontal
    else if (alt >= 70_000 && alt < 120_000 && pitch < 60) {
      next = {
        id: "go-horizontal",
        message: "GUIDANCE — Approaching space. Pitch toward 70-80° to prioritize horizontal velocity.",
        priority: "warning",
      };
    }
    // Phase 5: In space, need orbital velocity
    else if (alt >= 120_000 && vel < 5_000 && pitch < 80) {
      next = {
        id: "orbital-velocity",
        message: "GUIDANCE — In space but below orbital velocity. Pitch to 85-90° and burn horizontal.",
        priority: "action",
      };
    }
    // Phase 6: Good orbital velocity building
    else if (alt >= 100_000 && vel >= 5_000 && vel < 7_500 && pitch >= 70) {
      next = {
        id: "velocity-building",
        message: "FIDO — Velocity building. Maintain heading. Orbital velocity at ~7,800 m/s.",
        priority: "info",
      };
    }
    // Phase 7: Near orbital velocity
    else if (alt >= 100_000 && vel >= 7_500 && vel < 7_800) {
      next = {
        id: "almost-orbital",
        message: "FIDO — Approaching orbital velocity. Stand by for orbit confirmation.",
        priority: "info",
      };
    }

    if (next && next.id !== lastAdvisoryId.current && !dismissedIds.current.has(next.id)) {
      lastAdvisoryId.current = next.id;
      setAdvisory(next);
      setVisible(true);

      // Auto-dismiss info messages after 8s, warnings/actions stay longer
      const timeout = next.priority === "info" ? 8000 : 15000;
      const timer = setTimeout(() => {
        setVisible(false);
        dismissedIds.current.add(next!.id);
      }, timeout);
      return () => clearTimeout(timer);
    }
  }, [snapshot, pitch, hasResult]);

  if (!visible || !advisory) return null;

  const colors = {
    info: {
      bg: "bg-[#1565C0]",
      border: "border-[#1E88E5]",
    },
    warning: {
      bg: "bg-[#E65100]",
      border: "border-[#FF8F00]",
    },
    action: {
      bg: "bg-[#B71C1C]",
      border: "border-[#E53935]",
    },
  };

  const c = colors[advisory.priority];

  return (
    <div className="absolute top-[140px] left-1/2 -translate-x-1/2 z-20 animate-slide-down max-w-[90%]">
      <div
        className={`flex items-center gap-3 px-5 py-3 rounded ${c.bg} ${c.border} border-2 shadow-lg`}
      >
        <span className={`w-2.5 h-2.5 rounded-full bg-white flex-shrink-0 ${advisory.priority === "action" ? "animate-pulse" : ""}`} />
        <span className="font-mono text-[0.8rem] tracking-wide text-white font-medium leading-snug">
          {advisory.message}
        </span>
        <button
          onClick={() => {
            setVisible(false);
            dismissedIds.current.add(advisory.id);
          }}
          className="ml-1 flex-shrink-0 text-white/60 hover:text-white transition-colors text-base font-bold"
        >
          ×
        </button>
      </div>
    </div>
  );
}
