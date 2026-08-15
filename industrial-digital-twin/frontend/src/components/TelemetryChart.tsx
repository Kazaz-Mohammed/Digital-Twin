import React, { useState } from 'react';
import { SimStatus } from '../types/simulation';
import { Gauge, Flame, Zap, Waves } from 'lucide-react';

interface HistoryPoint {
  time: string;
  tank_level_pct: number;
  pit001_pressure: number;
  fit001_flow: number;
  pmp001_power: number;
  pmp001_rpm: number;
  pmp001_temp: number;
  pmp001_current: number;
  pmp001_press: number;
  pmp002_power: number;
  pmp002_rpm: number;
  pmp002_temp: number;
  pmp002_current: number;
  pmp002_press: number;
}

interface TelemetryChartProps {
  history: HistoryPoint[];
}

type TabType = 'vessel' | 'temp' | 'electrical' | 'pressure';

export default function TelemetryChart({ history }: TelemetryChartProps) {
  const [activeTab, setActiveTab] = useState<TabType>('vessel');

  const width = 800;
  const height = 180;
  const paddingLeft = 50;
  const paddingRight = 30;
  const paddingTop = 15;
  const paddingBottom = 25;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  if (history.length === 0) {
    return (
      <div id="chart_empty_state" className="flex flex-col items-center justify-center p-12 bg-slate-900/40 border border-slate-800 rounded-2xl h-[240px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500 mb-3" />
        <p className="text-slate-400 font-mono text-xs">Waiting for telemetry buffer to accumulate...</p>
      </div>
    );
  }

  // Choose range limits depending on active tab
  let config = {
    yMin: 0,
    yMax: 100,
    unit: '%',
    series: [
      { key: 'tank_level_pct' as keyof HistoryPoint, color: '#38bdf8', label: 'LIT-001 Level %' },
      { key: 'fit001_flow' as keyof HistoryPoint, color: '#c084fc', label: 'FIT-001 Flow L/s' }
    ]
  };

  if (activeTab === 'temp') {
    config = {
      yMin: 20,
      yMax: 120,
      unit: '°C',
      series: [
        { key: 'pmp001_temp' as keyof HistoryPoint, color: '#f43f5e', label: 'PMP-001 Temp' },
        { key: 'pmp002_temp' as keyof HistoryPoint, color: '#fb7185', label: 'PMP-002 Temp' }
      ]
    };
  } else if (activeTab === 'electrical') {
    config = {
      yMin: 0,
      yMax: 10,
      unit: ' kW/A',
      series: [
        { key: 'pmp001_power' as keyof HistoryPoint, color: '#eab308', label: 'PMP-001 Power (kW)' },
        { key: 'pmp001_current' as keyof HistoryPoint, color: '#10b981', label: 'PMP-001 Current (A)' },
        { key: 'pmp002_power' as keyof HistoryPoint, color: '#f97316', label: 'PMP-002 Power (kW)' },
        { key: 'pmp002_current' as keyof HistoryPoint, color: '#06b6d4', label: 'PMP-002 Current (A)' }
      ]
    };
  } else if (activeTab === 'pressure') {
    config = {
      yMin: 0,
      yMax: 6,
      unit: ' bar',
      series: [
        { key: 'pit001_pressure' as keyof HistoryPoint, color: '#22d3ee', label: 'PIT-001 Pressure' },
        { key: 'pmp001_press' as keyof HistoryPoint, color: '#34d399', label: 'PMP-001 Discharge' },
        { key: 'pmp002_press' as keyof HistoryPoint, color: '#f472b6', label: 'PMP-002 Discharge' }
      ]
    };
  }

  // Plot path coordinates helper
  const getCoordinates = (seriesKey: keyof HistoryPoint) => {
    return history.map((p, index) => {
      // ratio along X axis
      const x = paddingLeft + (index / Math.max(1, history.length - 1)) * chartWidth;
      
      const val = Number(p[seriesKey]) || 0;
      // ratio along Y axis
      const clampVal = Math.max(config.yMin, Math.min(config.yMax, val));
      const valRatio = (clampVal - config.yMin) / Math.max(1, config.yMax - config.yMin);
      const y = paddingTop + (1 - valRatio) * chartHeight;
      return { x, y, val };
    });
  };

  return (
    <div id="telemetry_chart_panel" className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
      
      {/* Header and Selectors */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div>
          <span className="text-xs uppercase tracking-wider font-mono text-slate-500">historical logs</span>
          <h3 className="text-sm font-medium text-slate-200">60s Real-Time SCADA Trend Plotter</h3>
        </div>

        {/* Tab controller button row */}
        <div className="flex flex-wrap gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800/80">
          <button
            onClick={() => setActiveTab('vessel')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
              activeTab === 'vessel' ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Waves className="w-3.5 h-3.5" />
            <span>Fluid Level</span>
          </button>
          
          <button
            onClick={() => setActiveTab('pressure')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
              activeTab === 'pressure' ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Gauge className="w-3.5 h-3.5" />
            <span>Pressures</span>
          </button>

          <button
            onClick={() => setActiveTab('temp')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
              activeTab === 'temp' ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Motor Temps</span>
          </button>

          <button
            onClick={() => setActiveTab('electrical')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
              activeTab === 'electrical' ? 'bg-sky-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Power & Amps</span>
          </button>
        </div>
      </div>

      {/* Actual SVG Chart plotting */}
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[640px]">
          {/* Grid lines and boundaries */}
          <rect x={paddingLeft} y={paddingTop} width={chartWidth} height={chartHeight} className="fill-slate-950/40 stroke-slate-800/80 stroke-[1px]" />
          
          {/* Horizontal lines */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((ratio, i) => {
            const hY = paddingTop + ratio * chartHeight;
            const labelVal = config.yMax - ratio * (config.yMax - config.yMin);
            return (
              <g key={i}>
                <line x1={paddingLeft} y1={hY} x2={width - paddingRight} y2={hY} className="stroke-slate-800/40 stroke-[1px]" strokeDasharray="3 3" />
                <text x={paddingLeft - 8} y={hY + 4} className="fill-slate-500 font-mono text-[9px] text-right" textAnchor="end">
                  {labelVal.toFixed(activeTab === 'electrical' ? 1 : 0)}{config.unit}
                </text>
              </g>
            );
          })}

          {/* Draw plotted series */}
          {config.series.map((s, idx) => {
            const coords = getCoordinates(s.key);
            if (coords.length === 0) return null;

            // Generate d path
            const pathD = coords.reduce((acc, point, i) => {
              return i === 0 ? `M ${point.x} ${point.y}` : `${acc} L ${point.x} ${point.y}`;
            }, '');

            return (
              <g key={idx}>
                {/* Visual shadow path underneath */}
                <path d={pathD} fill="none" stroke={s.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="opacity-80 transition-all" />
                
                {/* Dots on end value */}
                {coords.length > 0 && (
                  <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="4" fill={s.color} />
                )}
              </g>
            );
          })}

          {/* Horizontal axis time ticks */}
          {history.length > 1 && [0, 0.25, 0.5, 0.75, 1.0].map((ratio, i) => {
            const index = Math.floor(ratio * (history.length - 1));
            const point = history[index];
            if (!point) return null;
            const tX = paddingLeft + ratio * chartWidth;
            return (
              <g key={i}>
                <line x1={tX} y1={paddingTop} x2={tX} y2={height - paddingBottom} className="stroke-slate-800/30 stroke-[1px]" strokeDasharray="2 2" />
                <text x={tX} y={height - paddingBottom + 14} className="fill-slate-500 font-mono text-[8px]" textAnchor="middle">
                  {point.time}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Live legends */}
      <div className="flex flex-wrap gap-4 mt-4 select-none border-t border-slate-800/60 pt-3">
        {config.series.map((s, idx) => {
          const coords = getCoordinates(s.key);
          const lastVal = coords.length > 0 ? coords[coords.length - 1].val : 0;
          return (
            <div key={idx} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="text-xs font-sans text-slate-300 font-medium">{s.label}:</span>
              <span className="text-xs font-mono font-bold text-slate-100 uppercase">
                {lastVal.toFixed(idx === 1 && activeTab === 'vessel' ? 1 : 2)}
                {config.unit.trim()}
              </span>
            </div>
          );
        })}
      </div>

    </div>
  );
}
