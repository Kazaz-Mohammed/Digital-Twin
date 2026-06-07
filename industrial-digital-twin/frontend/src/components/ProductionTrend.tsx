"use client";

import React, { useEffect, useState } from "react";
import { useDigitalTwin } from "../context/DigitalTwinContext";

export default function ProductionTrend() {
  const { selectedAsset, telemetry } = useDigitalTwin();
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    setHistory((prev) => {
      const next = [...prev, telemetry.temp];
      if (next.length > 12) {
        next.shift();
      }
      return next;
    });
  }, [telemetry.temp]);

  useEffect(() => {
    setHistory([]);
  }, [selectedAsset]);

  const getSvgPath = () => {
    if (history.length < 2) return "";
    const width = 240;
    const height = 70;
    const maxVal = 95;
    const minVal = 20;
    const range = maxVal - minVal;

    return history.map((val, idx) => {
      const x = (width / (history.length - 1)) * idx;
      const y = height - ((val - minVal) / range) * height;
      return `${idx === 0 ? "M" : "L"} ${x} ${y}`;
    }).join(" ");
  };

  const getSvgFillPath = () => {
    const linePath = getSvgPath();
    if (!linePath) return "";
    const width = 240;
    const height = 70;
    return `${linePath} L ${width} ${height} L 0 ${height} Z`;
  };

  return (
    <div className="dashboard-panel h-full flex flex-col justify-between">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h3 className="text-[10px] font-bold theme-text-muted uppercase tracking-widest">Production Trend (Bottles/hr)</h3>
          <span className="text-[8px] theme-text-muted block mt-0.5 opacity-80">Last 24 Hours</span>
        </div>
        <span className="text-xs font-bold theme-text-primary font-mono">{telemetry.temp} °C</span>
      </div>

      <div className="flex-1 flex items-center justify-center relative">
        <svg viewBox="0 0 240 70" className="w-full h-[70px] overflow-visible">
          <line x1="0" y1="17.5" x2="240" y2="17.5" stroke="var(--border-panel)" strokeOpacity="0.5" strokeWidth="1" />
          <line x1="0" y1="35" x2="240" y2="35" stroke="var(--border-panel)" strokeOpacity="0.5" strokeWidth="1" />
          <line x1="0" y1="52.5" x2="240" y2="52.5" stroke="var(--border-panel)" strokeOpacity="0.5" strokeWidth="1" />

          {history.length >= 2 && (
            <path d={getSvgFillPath()} fill="url(#gradient-fill-trend)" />
          )}

          {history.length >= 2 && (
            <path d={getSvgPath()} fill="none" stroke="#00f0ff" strokeWidth="2.5" strokeLinecap="round" />
          )}

          <defs>
            <linearGradient id="gradient-fill-trend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(0, 240, 255, 0.25)" />
              <stop offset="100%" stopColor="rgba(0, 240, 255, 0.0)" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}
