"use client";

import React from "react";
import { useDigitalTwin } from "../context/DigitalTwinContext";

export default function DowntimeAnalysis() {
  const { simStatus, expandedPanel } = useDigitalTwin();
  const isExpanded = expandedPanel === "downtime";

  // 1. Calculate Pump 1 Health
  let pmp001Health = 100;
  if (simStatus?.pmp001) {
    if (simStatus.pmp001.bearing_wear) pmp001Health -= 40;
    if (simStatus.pmp001.temperature_c > 70) {
      pmp001Health -= Math.min(50, ((simStatus.pmp001.temperature_c - 70) / 35) * 50);
    }
  }
  pmp001Health = Math.max(10, Math.round(pmp001Health));

  // 2. Calculate Pump 2 Health
  let pmp002Health = 100;
  if (simStatus?.pmp002) {
    if (simStatus.pmp002.bearing_wear) pmp002Health -= 40;
    if (simStatus.pmp002.temperature_c > 70) {
      pmp002Health -= Math.min(50, ((simStatus.pmp002.temperature_c - 70) / 35) * 50);
    }
  }
  pmp002Health = Math.max(10, Math.round(pmp002Health));

  // 3. Calculate Tank 1 Health
  let tk001Health = 100;
  if (simStatus) {
    const level = simStatus.lit001_pct ?? 50.0;
    const lah = simStatus.lah_limit ?? 90.0;
    const lal = simStatus.lal_limit ?? 10.0;
    if (level >= lah) {
      tk001Health = 25; // Overflow active
    } else if (level <= lal) {
      tk001Health = 35; // Empty risk active
    } else if (level > lah - 10) {
      tk001Health = 75; // High warning
    } else if (level < lal + 10) {
      tk001Health = 75; // Low warning
    }
  }

  // 4. Calculate Valve V-001 Health
  let v001Health = 100;
  if (simStatus?.interlock_tripped) {
    v001Health = 20; // Valve locked by safety interlock
  }

  // 5. Calculate PIT-001 Health
  let pit001Health = 100;
  if (simStatus) {
    const press = simStatus.pit001_pressure ?? 2.0;
    if (press >= 5.0) {
      pit001Health = 30; // Overpressure
    } else if (press > 4.0) {
      pit001Health = 70; // High pressure warning
    }
  }

  const getBarColor = (val: number) => {
    if (val > 75) return "from-emerald-600/30 to-emerald-500";
    if (val > 40) return "from-amber-600/30 to-amber-500";
    return "from-red-600/30 to-red-500";
  };

  const getBarTextColor = (val: number) => {
    if (val > 75) return "text-emerald-400";
    if (val > 40) return "text-amber-400";
    return "text-red-400";
  };

  const healthData = [
    { label: "PMP-001", val: pmp001Health },
    { label: "PMP-002", val: pmp002Health },
    { label: "TK-001", val: tk001Health },
    { label: "V-001", val: v001Health },
    { label: "PIT-001", val: pit001Health },
  ];

  const containerHeight = isExpanded ? "h-[350px] px-8 mb-8" : "h-[80px] px-2";
  const barWrapperHeight = isExpanded ? "w-16 h-64" : "w-7 h-16";
  const labelSize = isExpanded ? "text-xs mt-2" : "text-[8px] mt-1";
  const pctSize = isExpanded ? "text-sm" : "text-[8px]";
  const flexGap = isExpanded ? "gap-3" : "gap-1";

  return (
    <div className="dashboard-panel h-full flex flex-col justify-between p-4">
      <div className={isExpanded ? "mb-6" : "mb-3"}>
        <h3 className={isExpanded ? "text-base font-bold theme-text-primary uppercase tracking-wider" : "text-[10px] font-bold theme-text-muted uppercase tracking-widest"}>
          Equipment Health Index
        </h3>
        <span className={isExpanded ? "text-xs theme-text-muted block mt-1" : "text-[8px] theme-text-muted block mt-0.5 opacity-80"}>
          {isExpanded ? "Detailed real-time diagnostic alarms & wear diagnostics" : "Diagnostic Alarms & Wear"}
        </span>
      </div>

      <div className={`flex items-end justify-between select-none ${containerHeight}`}>
        {healthData.map((bar, idx) => (
          <div key={idx} className={`flex flex-col items-center group cursor-pointer ${flexGap}`}>
            <span className={`font-mono font-bold ${pctSize} ${getBarTextColor(bar.val)}`}>
              {bar.val}%
            </span>
            <div className={`relative bg-[var(--bg-card-dark)] border border-[var(--border-panel)] rounded flex flex-col justify-end overflow-hidden ${barWrapperHeight}`}>
              <div 
                style={{ height: `${bar.val}%` }}
                className={`w-full bg-gradient-to-t ${getBarColor(bar.val)} rounded-t transition-all duration-300`}
              />
            </div>
            <span className={`theme-text-muted uppercase font-bold tracking-wider ${labelSize}`}>
              {bar.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
