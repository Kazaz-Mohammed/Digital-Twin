"use client";

import React, { useEffect, useState } from "react";
import { useDigitalTwin } from "../context/DigitalTwinContext";

export default function ProductionTrend() {
  const { selectedAsset, simStatus, expandedPanel } = useDigitalTwin();
  const [history, setHistory] = useState<number[]>([]);
  const isExpanded = expandedPanel === "trend";

  const getActiveMetric = () => {
    const tag = selectedAsset?.tag || "TK-001";
    if (tag === "PMP-001") {
      return {
        value: simStatus?.pmp001?.speed_rpm ?? 0,
        label: "PMP-001 Speed",
        unit: "RPM",
        min: 0,
        max: 1500,
      };
    } else if (tag === "PMP-002") {
      return {
        value: simStatus?.pmp002?.speed_rpm ?? 0,
        label: "PMP-002 Speed",
        unit: "RPM",
        min: 0,
        max: 1500,
      };
    } else if (tag === "PIT-001") {
      return {
        value: simStatus?.pit001_pressure ?? 0,
        label: "PIT-001 Pressure",
        unit: "Bar",
        min: 0,
        max: 10,
      };
    } else if (tag === "FIT-001") {
      return {
        value: simStatus?.fit001_flow ?? 0,
        label: "FIT-001 Flow Rate",
        unit: "L/s",
        min: 0,
        max: 50,
      };
    } else {
      return {
        value: simStatus?.lit001_pct ?? 0,
        label: "TK-001 Fill Level",
        unit: "%",
        min: 0,
        max: 100,
      };
    }
  };

  const metric = getActiveMetric();

  // Track history dynamically for the selected metric
  useEffect(() => {
    setHistory((prev) => {
      const next = [...prev, metric.value];
      const maxTicks = isExpanded ? 30 : 15;
      if (next.length > maxTicks) {
        next.shift();
      }
      return next;
    });
  }, [simStatus]);

  // Reset history chart when switching assets
  useEffect(() => {
    setHistory([]);
  }, [selectedAsset]);

  // Margins within the 500x200 canvas
  const paddingLeft = 50;
  const paddingRight = 10;
  const chartWidth = 500 - paddingLeft - paddingRight; // 440
  const chartHeight = 160;
  const paddingTop = 15;

  const getSvgPath = () => {
    if (history.length < 2) return "";
    const range = metric.max - metric.min || 1;

    return history.map((val, idx) => {
      const x = paddingLeft + (chartWidth / (history.length - 1)) * idx;
      const clampedVal = Math.max(metric.min, Math.min(metric.max, val));
      const y = paddingTop + chartHeight - ((clampedVal - metric.min) / range) * chartHeight;
      return `${idx === 0 ? "M" : "L"} ${x} ${y}`;
    }).join(" ");
  };

  const getSvgFillPath = () => {
    const linePath = getSvgPath();
    if (!linePath) return "";
    return `${linePath} L ${500 - paddingRight} ${paddingTop + chartHeight} L ${paddingLeft} ${paddingTop + chartHeight} Z`;
  };

  // Helper values for Y grid ticks
  const range = metric.max - metric.min;
  const yTicks = [
    { y: paddingTop, label: metric.max.toFixed(0) },
    { y: paddingTop + chartHeight * 0.33, label: (metric.min + range * 0.67).toFixed(0) },
    { y: paddingTop + chartHeight * 0.67, label: (metric.min + range * 0.33).toFixed(0) },
    { y: paddingTop + chartHeight, label: metric.min.toFixed(0) }
  ];

  return (
    <div className="dashboard-panel h-full flex flex-col justify-between p-4">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h3 className="text-[11px] font-bold theme-text-muted uppercase tracking-widest">
            {metric.label} Trend
          </h3>
          <span className="text-[8px] theme-text-muted block mt-0.5 opacity-80">
            {isExpanded ? "Real-time expanded Digital Twin trend line analysis" : "Real-Time Data Feed"}
          </span>
        </div>
        <span className="text-sm font-bold theme-text-primary font-mono">
          {metric.value.toFixed(1)} {metric.unit}
        </span>
      </div>

      <div className="flex-1 w-full relative min-h-0 flex items-center justify-center">
        <svg 
          viewBox="0 0 500 200" 
          className="w-full h-full max-h-[70vh] overflow-visible"
        >
          {/* Background Grid Lines and Y-Axis Ticks */}
          {yTicks.map((tick, idx) => (
            <g key={`y-tick-${idx}`}>
              <line 
                x1={paddingLeft} 
                y1={tick.y} 
                x2={500 - paddingRight} 
                y2={tick.y} 
                stroke="var(--border-panel)" 
                strokeOpacity="0.4" 
                strokeDasharray="3 3"
                strokeWidth="1" 
              />
              <text 
                x={paddingLeft - 8} 
                y={tick.y + 3.5} 
                fill="var(--text-muted)" 
                fontSize="8" 
                fontFamily="monospace"
                textAnchor="end"
                className="opacity-70"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* X-Axis Ticks (Time scale) */}
          <line 
            x1={paddingLeft} 
            y1={paddingTop + chartHeight} 
            x2={500 - paddingRight} 
            y2={paddingTop + chartHeight} 
            stroke="var(--border-panel)" 
            strokeWidth="1.5" 
          />
          
          {[-20, -15, -10, -5, 0].map((t, idx) => {
            const x = paddingLeft + (chartWidth / 4) * idx;
            return (
              <g key={`x-tick-${idx}`}>
                <line 
                  x1={x} 
                  y1={paddingTop + chartHeight} 
                  x2={x} 
                  y2={paddingTop + chartHeight + 4} 
                  stroke="var(--border-panel)" 
                  strokeWidth="1" 
                />
                <text 
                  x={x} 
                  y={paddingTop + chartHeight + 14} 
                  fill="var(--text-muted)" 
                  fontSize="7.5" 
                  fontFamily="monospace"
                  textAnchor="middle"
                  className="opacity-60"
                >
                  {t === 0 ? "Now" : `${t}s`}
                </text>
              </g>
            );
          })}

          {/* Area Fill */}
          {history.length >= 2 && (
            <path d={getSvgFillPath()} fill="url(#gradient-fill-trend-2)" />
          )}

          {/* Sparkline Path */}
          {history.length >= 2 && (
            <path d={getSvgPath()} fill="none" stroke="#00f0ff" strokeWidth="2.5" strokeLinecap="round" />
          )}

          <defs>
            <linearGradient id="gradient-fill-trend-2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(0, 240, 255, 0.25)" />
              <stop offset="100%" stopColor="rgba(0, 240, 255, 0.0)" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}
