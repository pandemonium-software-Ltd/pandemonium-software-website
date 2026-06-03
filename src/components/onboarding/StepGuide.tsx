"use client";

import { useCallback, useEffect, useRef } from "react";
import { driver, type DriveStep, type Driver } from "driver.js";
import "driver.js/dist/driver.css";

export type GuideStep = {
  selector: string;
  title: string;
  description: string;
  side?: "top" | "bottom" | "left" | "right";
};

type Props = {
  steps: GuideStep[];
  label?: string;
};

export default function StepGuideButton({ steps, label }: Props) {
  const driverRef = useRef<Driver | null>(null);

  useEffect(() => {
    return () => {
      driverRef.current?.destroy();
    };
  }, []);

  const startTour = useCallback(() => {
    driverRef.current?.destroy();

    const driveSteps: DriveStep[] = steps.map((s) => ({
      element: s.selector,
      popover: {
        title: s.title,
        description: s.description,
        side: s.side ?? "bottom",
      },
    }));

    const d = driver({
      showProgress: true,
      animate: true,
      allowClose: true,
      overlayColor: "rgba(15, 23, 42, 0.55)",
      stagePadding: 12,
      stageRadius: 12,
      popoverClass: "moduforge-guide-popover",
      steps: driveSteps,
      nextBtnText: "Next →",
      prevBtnText: "← Back",
      doneBtnText: "Got it",
    });

    driverRef.current = d;
    d.drive();
  }, [steps]);

  if (steps.length === 0) return null;

  return (
    <button
      type="button"
      onClick={startTour}
      className="inline-flex items-center gap-1.5 rounded-lg border-2 border-navy-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy-700 transition-colors hover:border-navy-400 hover:bg-cream-50"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-ember-600"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      {label ?? "Show me how"}
    </button>
  );
}
