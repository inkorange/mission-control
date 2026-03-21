"use client";

import { useMemo, useRef, useEffect, useCallback } from "react";
import { useFlightStore } from "@/stores/useFlightStore";
import { formatDistance, formatVelocity, formatMissionTime } from "@/lib/formatters";

interface MissionTickerProps {
  missionName: string;
  missionCodename: string;
  missionDescription: string;
}

/**
 * NASA TV–style scrolling ticker.
 * Sits inline in the header bar, filling available horizontal space.
 * Uses requestAnimationFrame for smooth, uninterrupted scrolling.
 */
export default function MissionTicker({
  missionName,
  missionCodename,
  missionDescription,
}: MissionTickerProps) {
  const { currentSnapshot, events } = useFlightStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const rafRef = useRef(0);
  const lastTimeRef = useRef(0);

  // Build ticker text from stable + event data (avoid rebuilding on every snapshot)
  const stableText = useMemo(() => {
    const entries: string[] = [];
    entries.push(`MISSION ${missionCodename} — ${missionName}`);
    entries.push(missionDescription.toUpperCase());
    return entries;
  }, [missionCodename, missionName, missionDescription]);

  const eventText = useMemo(() => {
    const entries: string[] = [];
    const recentEvents = [...events].reverse().slice(0, 6);
    for (const evt of recentEvents) {
      entries.push(`T+${formatMissionTime(evt.time)} — ${evt.description}`);
    }
    return entries;
  }, [events]);

  // Live telemetry — update via ref to avoid re-render
  const liveRef = useRef("");
  if (currentSnapshot) {
    const parts: string[] = [];
    parts.push(
      `ALT ${formatDistance(currentSnapshot.altitude)} — VEL ${formatVelocity(currentSnapshot.velocity)}`
    );
    parts.push(
      `MET ${formatMissionTime(currentSnapshot.time)} — STAGE ${currentSnapshot.currentStage + 1} ACTIVE`
    );
    if (currentSnapshot.orbitalElements && currentSnapshot.altitude > 100_000) {
      const orb = currentSnapshot.orbitalElements;
      if (orb.eccentricity < 1) {
        parts.push(
          `ORBIT — PE ${formatDistance(orb.periapsis)} × AP ${formatDistance(orb.apoapsis)}`
        );
      }
    }
    liveRef.current = parts.join("   ●   ");
  }

  const buildFullText = useCallback(() => {
    const sep = "   ●   ";
    const all = [...stableText, ...eventText];
    let text = all.join(sep);
    if (liveRef.current) {
      text += sep + liveRef.current;
    }
    return text;
  }, [stableText, eventText]);

  // rAF scroll loop — runs continuously, never resets
  useEffect(() => {
    const speed = 40; // pixels per second

    const tick = (now: number) => {
      if (!innerRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (lastTimeRef.current === 0) lastTimeRef.current = now;
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      offsetRef.current += speed * dt;

      // Reset when first copy has fully scrolled off
      const halfWidth = innerRef.current.scrollWidth / 2;
      if (halfWidth > 0 && offsetRef.current >= halfWidth) {
        offsetRef.current -= halfWidth;
      }

      innerRef.current.style.transform = `translateX(-${offsetRef.current}px)`;
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Update the text content in the DOM directly to avoid re-render killing the scroll
  useEffect(() => {
    if (!innerRef.current) return;
    const text = buildFullText();
    const sep = "   ●   ";
    // Double it for seamless loop
    const full = text + sep + text + sep;
    const spans = innerRef.current.querySelectorAll("span");
    spans.forEach((s) => { s.textContent = full; });
  }, [buildFullText]);

  const initialText = buildFullText();
  const sep = "   ●   ";
  const doubled = initialText + sep + initialText + sep;

  return (
    <div
      ref={containerRef}
      className="overflow-hidden whitespace-nowrap relative flex items-stretch rounded-sm"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.1)" }}
    >
      {/* "LIVE" badge — stretches full height */}
      <div className="flex-shrink-0 z-10 flex items-center gap-1.5 px-2.5 bg-[var(--nasa-red)] rounded-l-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
        <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-white font-bold">
          Live: {missionName}
        </span>
      </div>

      {/* Scrolling content */}
      <div className="flex-1 overflow-hidden relative flex items-center py-1.5 px-1">
        {/* Fade edges */}
        <div className="absolute left-0 top-0 bottom-0 w-6 z-10 pointer-events-none" style={{ background: "linear-gradient(to right, rgba(0,0,0,0.1), transparent)" }} />
        <div className="absolute right-0 top-0 bottom-0 w-6 z-10 pointer-events-none" style={{ background: "linear-gradient(to left, rgba(0,0,0,0.1), transparent)" }} />

        <div ref={innerRef} className="inline-block will-change-transform">
          <span className="font-mono text-[1.05rem] tracking-wide text-[var(--muted)]">
            {doubled}
          </span>
        </div>
      </div>
    </div>
  );
}
