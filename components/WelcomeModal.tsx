"use client";

import { useEffect, useCallback } from "react";

interface WelcomeModalProps {
  onClose: () => void;
}

export default function WelcomeModal({ onClose }: WelcomeModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="panel w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto animate-scale-in">
        {/* Header */}
        <div className="p-5 border-b border-[var(--border)]">
          <span className="font-mono text-[0.7rem] tracking-[0.2em] uppercase text-[var(--nasa-red)] block mb-1">
            Welcome to
          </span>
          <h3 className="text-xl font-bold tracking-tight">Mission Control</h3>
          <p className="text-[0.85rem] text-[var(--muted)] mt-1">
            Design rockets, launch missions, and explore the solar system.
          </p>
        </div>

        {/* Desktop notice */}
        <div className="mx-5 mt-5 px-3 py-2.5 rounded-sm bg-[var(--nasa-gold)]/10 border border-[var(--nasa-gold)]/30">
          <p className="font-mono text-[0.75rem] tracking-wider text-[var(--nasa-gold)] text-center">
            This app is designed for desktop browsers with a keyboard.
          </p>
        </div>

        {/* How it works */}
        <div className="p-5 border-b border-[var(--border)]">
          <span className="font-mono text-[0.6rem] tracking-[0.15em] uppercase text-[var(--nasa-red)] block mb-3">
            How It Works
          </span>
          <div className="space-y-3">
            <Step
              number="01"
              title="Select a Mission"
              description="Choose from increasingly challenging missions — from suborbital hops to interplanetary transfers."
            />
            <Step
              number="02"
              title="Build Your Rocket"
              description='Use the vehicle assembly tool to configure your rocket, or hit "Build It for Me" to auto-generate a flight-ready vehicle.'
            />
            <Step
              number="03"
              title="Launch & Fly"
              description="Control throttle, pitch, and staging to reach your target orbit. Earn up to 3 stars per mission."
            />
          </div>
        </div>

        {/* Tips */}
        <div className="p-5 border-b border-[var(--border)]">
          <span className="font-mono text-[0.6rem] tracking-[0.15em] uppercase text-[var(--nasa-red)] block mb-3">
            Tips
          </span>
          <div className="space-y-2">
            <Tip text='New to rockets? Use "Build It for Me" in the assembly screen to get a pre-built vehicle tuned for the mission.' />
            <Tip text="Auto Pilot is on by default and will fly the mission for you — sit back and watch, or take manual control any time." />
            <Tip text="For a real challenge, turn off Auto Pilot and fly the rocket yourself. You control throttle, pitch, and staging." />
            <Tip text="Use Time Warp (keys 1–7) to speed through long coasts." />
          </div>
        </div>

        {/* Actions */}
        <div className="p-5">
          <button
            onClick={onClose}
            className="w-full text-center font-mono text-[0.8rem] tracking-[0.1em] uppercase py-2.5 bg-[var(--nasa-red)] hover:bg-[var(--nasa-red-dark)] text-white rounded-sm transition-colors"
          >
            Start Flying
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3">
      <span className="font-mono text-[0.7rem] tracking-wider text-[var(--nasa-blue-light)] mt-0.5 shrink-0">
        {number}
      </span>
      <div>
        <h4 className="text-[0.85rem] font-semibold">{title}</h4>
        <p className="text-[0.8rem] leading-relaxed text-[var(--muted)]">
          {description}
        </p>
      </div>
    </div>
  );
}

function Tip({ text }: { text: string }) {
  return (
    <div className="flex gap-2 items-start">
      <span className="text-[var(--nasa-gold)] text-[0.7rem] mt-0.5 shrink-0">&#9656;</span>
      <p className="text-[0.8rem] leading-relaxed text-[var(--muted)]">{text}</p>
    </div>
  );
}
