"use client";

import { useFlightStore } from "@/stores/useFlightStore";
import { formatMissionTime } from "@/lib/formatters";

export default function EventLog() {
  const { events } = useFlightStore();

  return (
    <div>
      <span className="font-mono text-[0.55rem] tracking-[0.15em] uppercase text-[var(--muted)] block mb-1.5">
        Flight Events
      </span>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {events.length === 0 ? (
          <p className="font-mono text-[0.625rem] text-[var(--muted)] italic py-1">
            Awaiting launch...
          </p>
        ) : (
          [...events].reverse().map((event, i) => (
            <div
              key={i}
              className="flex items-start gap-2 py-0.5"
            >
              <span className="font-mono text-[0.55rem] text-[var(--muted)] whitespace-nowrap mt-px">
                {formatMissionTime(event.time)}
              </span>
              <span
                className={`font-mono text-[0.625rem] ${
                  event.type === "abort"
                    ? "text-[var(--nasa-red)]"
                    : event.type === "orbit_achieved"
                      ? "text-[var(--nasa-green)]"
                      : event.type === "stage_separation" || event.type === "fuel_depleted"
                        ? "text-[var(--nasa-gold)]"
                        : "text-[var(--foreground)]"
                }`}
              >
                {event.description}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
