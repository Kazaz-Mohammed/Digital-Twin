"use client";

import React from "react";
import { useDigitalTwin } from "../context/DigitalTwinContext";

export default function ViewControls() {
  const { triggerCameraAction } = useDigitalTwin();

  return (
    <div className="dashboard-panel h-16 flex flex-col justify-center p-3 select-none font-sans">
      <button
        onClick={() => triggerCameraAction("view-1")}
        className="w-full py-2 bg-cyan-600 hover:bg-cyan-700 active:scale-95 text-white font-mono text-[9px] font-bold uppercase tracking-wider rounded-lg shadow-md transition-all cursor-pointer border border-cyan-500/30"
        title="Snap camera to calibrated equipment view"
      >
        View 1
      </button>
    </div>
  );
}
