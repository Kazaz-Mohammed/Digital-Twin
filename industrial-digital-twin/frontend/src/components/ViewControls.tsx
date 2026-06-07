"use client";

import React from "react";

export default function ViewControls() {
  return (
    <div className="dashboard-panel h-32 flex flex-col justify-between p-4">
      <h3 className="text-[10px] font-bold theme-text-muted uppercase tracking-wider">View Controls</h3>
      <div className="flex-1 flex items-center justify-center relative mt-1">
        {/* High-fidelity vector circular navigation dial */}
        <div className="w-16 h-16 rounded-full border border-cyan-500/20 flex items-center justify-center relative bg-gradient-to-br from-[var(--bg-card-dark)] to-[var(--bg-panel)] shadow-inner shadow-black/10">
          <div className="w-8 h-8 rounded-full border border-cyan-500/30 flex items-center justify-center bg-cyan-500/5 hover:bg-cyan-500/10 cursor-pointer transition-colors">
            <span className="text-cyan-400 text-xs">⊕</span>
          </div>
          {/* Label positioning overlay */}
          <span className="absolute -top-3 text-[7px] theme-text-muted uppercase font-bold tracking-widest">Orbit</span>
          <span className="absolute -bottom-3 text-[7px] theme-text-muted uppercase font-bold tracking-widest">Pan</span>
          <span className="absolute -left-5 text-[7px] theme-text-muted uppercase font-bold tracking-widest">Orbit</span>
          <span className="absolute -right-6 text-[7px] theme-text-muted uppercase font-bold tracking-widest">Zoom</span>
        </div>
      </div>
    </div>
  );
}
