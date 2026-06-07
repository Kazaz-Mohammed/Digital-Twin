"use client";

import React from "react";

export default function DowntimeAnalysis() {
  const downtimeData = [
    { label: "Filters", val: 140, pct: "77%" },
    { label: "Pumps", val: 90, pct: "50%" },
    { label: "Osmosis", val: 120, pct: "66%" },
    { label: "Valves", val: 60, pct: "33%" },
    { label: "Other", val: 40, pct: "22%" },
  ];

  return (
    <div className="dashboard-panel h-full flex flex-col justify-between">
      <div className="mb-4">
        <h3 className="text-[10px] font-bold theme-text-muted uppercase tracking-widest">Down-time Analysis (by Cause)</h3>
        <span className="text-[8px] theme-text-muted block mt-0.5 opacity-80">Active Incidents</span>
      </div>

      <div className="flex-1 flex items-end justify-between h-[80px] px-2 select-none">
        {downtimeData.map((bar, idx) => (
          <div key={idx} className="flex flex-col items-center gap-2 group cursor-pointer">
            <div className="relative w-7 h-20 bg-[var(--bg-card-dark)] border border-[var(--border-panel)] rounded flex flex-col justify-end overflow-hidden">
              <div 
                style={{ height: bar.pct }}
                className="w-full bg-gradient-to-t from-blue-600/30 to-blue-500 rounded-t transition-all duration-300"
              />
            </div>
            <span className="text-[8px] theme-text-muted uppercase font-bold tracking-wider">{bar.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
