import React from 'react';
import { SimStatus } from '../types/simulation';
import { AlertTriangle, ShieldCheck, Power, Play } from 'lucide-react';

interface ScadaDiagramProps {
  status: SimStatus;
  onToggleValve: () => void;
  onResetInterlock: () => void;
  onManualTrip: () => void;
}

export default function ScadaDiagram({
  status,
  onToggleValve,
  onResetInterlock,
  onManualTrip,
}: ScadaDiagramProps) {
  const {
    lit001_pct,
    pit001_pressure,
    fit001_flow,
    pmp001_speed,
    pmp002_speed,
    v001_open,
    pmp001,
    pmp002,
    interlock_tripped,
    active_alarms,
    lah_limit,
    lal_limit,
  } = status;

  const isLah = lit001_pct >= lah_limit;
  const isLal = lit001_pct <= lal_limit;
  const isTah = pmp001.temperature_c >= 105.0 || pmp002.temperature_c >= 105.0;
  const isPah = pit001_pressure >= 5.0 || pmp001.pressure_bar >= 5.0 || pmp002.pressure_bar >= 5.0;

  // Pipe colors based on flow state
  const pipeInColor = pmp001_speed > 0 ? 'stroke-emerald-500' : 'stroke-slate-700';
  const pipeOutColor = fit001_flow > 0 ? (v001_open ? 'stroke-emerald-500' : 'stroke-rose-500') : 'stroke-slate-700';

  return (
    <div id="scada_canvas_panel" className="relative w-full overflow-hidden bg-slate-900 border border-slate-800 p-6 shadow-2xl rounded-2xl">
      
      {/* Alarm Status Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3 mb-4 border-b border-slate-800 pb-3">
        <div>
          <span className="text-[10px] uppercase tracking-wider font-mono text-slate-500">process flow diagram</span>
          <h2 className="text-sm sm:text-base font-semibold text-slate-100 font-sans tracking-tight">TK-001 Level & SCADA Plant Telemetry</h2>
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          {interlock_tripped ? (
            <div className="flex items-center gap-1.5 bg-rose-950/40 border border-rose-500/30 px-3 py-1 rounded-full text-rose-400 font-mono text-xs animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>⚠️ SIS TRIP ACTIVE - RUNWAYS INHIBITED</span>
            </div>
          ) : active_alarms.length > 0 ? (
            <div className="flex items-center gap-1.5 bg-amber-950/40 border border-amber-500/30 px-3 py-1 rounded-full text-amber-400 font-mono text-xs">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Alarm Active: {active_alarms.join(' | ')}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-emerald-950/40 border border-emerald-500/30 px-3 py-1 rounded-full text-emerald-400 font-mono text-xs">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Plant Healthy & Online</span>
            </div>
          )}
        </div>
      </div>

      {/* Primary SVG SCADA Canvas */}
      <div className="relative w-full overflow-x-auto py-4">
        <svg viewBox="0 0 1000 300" className="w-full h-auto select-none" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Grids and Ambient background accents */}
          <defs>
            <linearGradient id="tankFluid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.95" />
            </linearGradient>
            <linearGradient id="tankFluidAlarm" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#b91c1c" stopOpacity="0.95" />
            </linearGradient>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#334155" strokeWidth="0.5" strokeOpacity="0.1" />
            </pattern>
          </defs>

          {/* Grid Background */}
          <rect width="1000" height="300" fill="url(#grid)" rx="8" />

          {/* PIPES LAYER */}
          {/* Inlet Pipe 1 */}
          <path d="M 20 180 L 140 180" className={`stroke-[5px] fill-none transition-colors duration-500 ${pipeInColor}`} />
          {/* Inlet Pipe 2 */}
          <path d="M 180 180 L 380 180" className={`stroke-[5px] fill-none transition-colors duration-500 ${pipeInColor}`} />
          
          {/* Tank Level Entry connector */}
          <path d="M 380 180 L 400 180" className={`stroke-[4px] fill-none transition-colors duration-500 ${pipeInColor}`} />

          {/* Outlet Pipe 1: Tank to Valve */}
          <path d="M 500 240 L 580 240" className={`stroke-[5px] fill-none transition-colors duration-500 ${pipeOutColor}`} />
          {/* Outlet Pipe 2: Valve to Pump 2 */}
          <path d="M 620 240 L 720 240" className={`stroke-[5px] fill-none transition-colors duration-500 ${pipeOutColor}`} />
          {/* Outlet Pipe 3: Pump 2 to Destination */}
          <path d="M 760 240 L 980 240" className={`stroke-[5px] fill-none transition-colors duration-500 ${pipeOutColor}`} />

          {/* FLOW ARRAYS ANIMATION (Only shown when active flow exists) */}
          {pmp001_speed > 0 && (
            <g className="animate-pulse">
              <circle cx="60" cy="180" r="3" className="fill-emerald-200" />
              <circle cx="100" cy="180" r="3" className="fill-emerald-200" />
              <circle cx="210" cy="180" r="3" className="fill-emerald-200" />
              <circle cx="260" cy="180" r="3" className="fill-emerald-200" />
              <circle cx="310" cy="180" r="3" className="fill-emerald-200" />
            </g>
          )}

          {fit001_flow > 0 && (
            <g className="animate-pulse">
              <circle cx="530" cy="240" r="3" className={v001_open ? "fill-emerald-200" : "fill-rose-200"} />
              <circle cx="650" cy="240" r="3" className="fill-emerald-200" />
              <circle cx="690" cy="240" r="3" className="fill-emerald-200" />
              <circle cx="800" cy="240" r="3" className="fill-emerald-200" />
              <circle cx="870" cy="240" r="3" className="fill-emerald-200" />
              <circle cx="940" cy="240" r="3" className="fill-emerald-200" />
            </g>
          )}

          {/* EQUIPMENT LAYER */}

          {/* SOURCE FEED BOX */}
          <rect x="20" y="145" width="80" height="70" rx="4" className="fill-slate-900 stroke-slate-700 stroke-2" />
          <text x="60" y="178" className="fill-slate-300 font-sans font-semibold text-[10px]" textAnchor="middle">FEED SOURCE</text>
          <text x="60" y="195" className="fill-slate-500 font-mono text-[9px]" textAnchor="middle">0.0 bar</text>

          {/* PUMP PMP-001 (Inlet) */}
          <circle cx="160" cy="180" r="22" className={`fill-slate-900 transition-all ${pmp001_speed > 0 ? 'stroke-emerald-500 stroke-[3px] shadow-emerald-500' : 'stroke-blue-500 stroke-2'} ${pmp001.bearing_wear ? 'stroke-rose-500 animate-pulse' : ''}`} />
          <path d="M 148 180 L 172 180 M 160 168 L 160 192" className="stroke-slate-500 stroke-[1.5px]" />
          <text x="160" y="176" className="fill-slate-100 font-mono font-bold text-[8px]" textAnchor="middle">PMP</text>
          <text x="160" y="188" className="fill-slate-100 font-mono font-bold text-[8px]" textAnchor="middle">001</text>
          {/* Dynamic speed display tag underneath */}
          <rect x="135" y="210" width="50" height="15" rx="3" className="fill-slate-900 stroke-slate-700 stroke-1" />
          <text x="160" y="221" className={`font-mono text-[9px] font-semibold text-center ${pmp001_speed > 0 ? 'fill-emerald-400' : 'fill-slate-500'}`} textAnchor="middle">
            {pmp001_speed.toFixed(0)}%
          </text>

          {/* TANK TK-001 BOUNDS */}
          {/* Fluid levels filling container */}
          <g>
            {/* Dynamic level indicator block from y=240 to y=100 (height 140) */}
            {lit001_pct > 0 && (
              <rect x="403" y={240 - (lit001_pct / 100) * 140} width="94" height={(lit001_pct / 100) * 140} fill={`url(#${isLah || isLal ? 'tankFluidAlarm' : 'tankFluid'})`} className="transition-all duration-300" />
            )}
            {/* Metal vessel wire outline */}
            <rect x="400" y="100" width="100" height="142" rx="6" className="stroke-slate-400 stroke-[3px] fill-none" />
            <text x="450" y="258" className="fill-slate-200 font-sans font-bold text-[12px]" textAnchor="middle">TK-001</text>
            <text x="450" y="175" className="fill-slate-100/40 font-sans font-bold text-[16px] text-opacity-10" textAnchor="middle">BUFFER</text>
          </g>

          {/* Graduation Marks on Tank */}
          <line x1="394" y1="100" x2="400" y2="100" className="stroke-slate-500 stroke-2" />
          <text x="388" y="103" className="fill-slate-500 font-mono text-[8px]" textAnchor="end">100%</text>
          
          <line x1="394" y1="135" x2="400" y2="135" className="stroke-slate-500 stroke-1" />
          <line x1="394" y1="170" x2="400" y2="170" className="stroke-slate-500 stroke-2" />
          <text x="388" y="173" className="fill-slate-500 font-mono text-[8px]" textAnchor="end">50%</text>

          <line x1="394" y1="205" x2="400" y2="205" className="stroke-slate-500 stroke-1" />
          <line x1="394" y1="240" x2="400" y2="240" className="stroke-slate-500 stroke-2" />
          <text x="388" y="243" className="fill-slate-500 font-mono text-[8px]" textAnchor="end">0%</text>

          {/* VALVES / SOLENOIDS: V-001 */}
          <g className="cursor-pointer" onClick={onToggleValve}>
            {/* Operator solenoid box [S] */}
            <rect x="585" y="195" width="30" height="20" rx="2" className={`transition-colors ${v001_open ? 'fill-emerald-800/80 stroke-emerald-500' : 'fill-rose-950/80 stroke-rose-500'} stroke-[1.5px]`} />
            <text x="600" y="209" className="fill-slate-200 font-sans font-bold text-[10px]" textAnchor="middle">S</text>
            <line x1="600" y1="215" x2="600" y2="230" className="stroke-slate-500 stroke-[1.5px]" />
            
            {/* Valve structural triangles */}
            <path d="M 580 230 L 580 250 L 600 240 Z" className={`transition-colors ${v001_open ? 'fill-emerald-500 stroke-emerald-400' : 'fill-rose-500 stroke-rose-400'} stroke-1`} />
            <path d="M 620 230 L 620 250 L 600 240 Z" className={`transition-colors ${v001_open ? 'fill-emerald-500 stroke-emerald-400' : 'fill-rose-500 stroke-rose-400'} stroke-1`} />
            <circle cx="600" cy="240" r="3" className="fill-slate-300" />
            <text x="600" y="265" className="fill-slate-400 font-mono text-[9px]" textAnchor="middle">V-001</text>
          </g>

          {/* PUMP PMP-002 (Outlet) */}
          <circle cx="740" cy="240" r="22" className={`fill-slate-900 transition-all ${fit001_flow > 0 ? 'stroke-emerald-500 stroke-[3px]' : 'stroke-blue-500 stroke-2'} ${pmp002.bearing_wear ? 'stroke-rose-500 animate-pulse' : ''}`} />
          <path d="M 728 240 L 752 240 M 740 228 L 740 252" className="stroke-slate-500 stroke-[1.5px]" />
          <text x="740" y="236" className="fill-slate-100 font-mono font-bold text-[8px]" textAnchor="middle">PMP</text>
          <text x="740" y="248" className="fill-slate-100 font-mono font-bold text-[8px]" textAnchor="middle">002</text>
          {/* Dynamic speed display tag */}
          <rect x="715" y="270" width="50" height="15" rx="3" className="fill-slate-900 stroke-slate-700 stroke-1" />
          <text x="740" y="281" className={`font-mono text-[9px] font-semibold text-center ${pmp002_speed > 0 ? 'fill-emerald-400' : 'fill-slate-500'}`} textAnchor="middle">
            {pmp002_speed.toFixed(0)}%
          </text>

          {/* OUTFLOW DESTINATION BOX */}
          <rect x="900" y="205" width="80" height="70" rx="4" className="fill-slate-900 stroke-slate-700 stroke-2" />
          <text x="940" y="238" className="fill-slate-300 font-sans font-semibold text-[10px]" textAnchor="middle">DESTINATION</text>
          <text x="940" y="255" className="fill-slate-500 font-mono text-[9px]" textAnchor="middle">RESERVOIR</text>

          {/* INSTRUMENTATION CIRCLES (TRANSMITTERS) */}
          
          {/* PIT-001 (Inlet Line Pressure) */}
          <g>
            <line x1="280" y1="180" x2="280" y2="110" className="stroke-slate-500 stroke-[1.5px]" strokeDasharray="2 2" />
            <circle cx="280" cy="80" r="26" className="fill-slate-900 stroke-slate-400 stroke-2" />
            <line x1="254" y1="80" x2="306" y2="80" className="stroke-slate-600 stroke-1" />
            <text x="280" y="72" className="fill-slate-400 font-sans text-[8px]" textAnchor="middle">PIT-001</text>
            <text x="280" y="92" className={`font-mono font-bold text-[10px] ${pit001_pressure >= 5.0 ? 'fill-rose-400' : 'fill-emerald-400'}`} textAnchor="middle">
              {pit001_pressure.toFixed(2)} b
            </text>
          </g>

          {/* LIT-001 (Level Indicator transmitter) */}
          <g>
            <line x1="450" y1="100" x2="450" y2="50" className="stroke-slate-500 stroke-[1.5px]" strokeDasharray="2 2" />
            <circle cx="450" cy="30" r="26" className="fill-slate-900 stroke-slate-400 stroke-2" />
            <line x1="424" y1="30" x2="476" y2="30" className="stroke-slate-600 stroke-1" />
            <text x="450" y="22" className="fill-slate-400 font-sans text-[8px]" textAnchor="middle">LIT-001</text>
            <text x="450" y="42" className={`font-mono font-bold text-[10px] ${isLah || isLal ? 'fill-rose-400 font-bold' : 'fill-orange-400'}`} textAnchor="middle">
              {lit001_pct.toFixed(1)}%
            </text>
          </g>

          {/* FIT-001 (Outlet Flow Indicator transmitter) */}
          <g>
            <line x1="850" y1="240" x2="850" y2="110" className="stroke-slate-500 stroke-[1.5px]" strokeDasharray="2 2" />
            <circle cx="850" cy="80" r="26" className="fill-slate-900 stroke-slate-400 stroke-2" />
            <line x1="824" y1="80" x2="876" y2="80" className="stroke-slate-600 stroke-1" />
            <text x="850" y="72" className="fill-slate-400 font-sans text-[8px]" textAnchor="middle">FIT-001</text>
            <text x="850" y="92" className="fill-cyan-400 font-mono font-bold text-[10px]" textAnchor="middle">
              {fit001_flow.toFixed(1)} L/s
            </text>
          </g>

          {/* ALARM LED STATUS COLUMNS */}
          <g transform="translate(515, 60)">
            <rect width="90" height="110" rx="4" className="fill-slate-900/60 stroke-slate-800 stroke-1" />
            
            {/* LAH LED */}
            <circle cx="15" cy="20" r="7" className={`transition-colors ${isLah ? 'fill-rose-600 animate-pulse stroke-rose-400' : 'fill-slate-800'}`} />
            <text x="32" y="23" className="fill-slate-300 font-mono text-[9px] font-bold">LAH</text>

            {/* LAL LED */}
            <circle cx="15" cy="45" r="7" className={`transition-colors ${isLal ? 'fill-rose-600 animate-pulse stroke-rose-400' : 'fill-slate-800'}`} />
            <text x="32" y="48" className="fill-slate-300 font-mono text-[9px] font-bold">LAL</text>

            {/* TAH LED */}
            <circle cx="15" cy="70" r="7" className={`transition-colors ${isTah ? 'fill-rose-600 animate-pulse stroke-rose-400' : 'fill-slate-800'}`} />
            <text x="32" y="73" className="fill-slate-300 font-mono text-[9px] font-bold">TAH</text>

            {/* PAH LED */}
            <circle cx="15" cy="95" r="7" className={`transition-colors ${isPah ? 'fill-rose-600 animate-pulse stroke-rose-400' : 'fill-slate-800'}`} />
            <text x="32" y="98" className="fill-slate-300 font-mono text-[9px] font-bold">PAH</text>
          </g>

        </svg>
      </div>

      {/* QUICK STATUS CONTROL TRIPS OVERLAY BANNER */}
      <div className="mt-4 flex flex-wrap gap-4 items-center justify-between bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-slate-400 font-sans">Active Solenoid Valve Position:</span>
          <span className={`text-sm font-semibold font-mono ${v001_open ? 'text-emerald-400' : 'text-rose-400'}`}>
            {v001_open ? '✓ SOLENOID OPEN (FLUID FLOW AT PMP-002 ENABLED)' : '✗ SOLENOID CLOSED (OUTFLOW BLOCKED)'}
          </span>
        </div>

        <div className="flex gap-2">
          {interlock_tripped ? (
            <button
              onClick={onResetInterlock}
              className="flex items-center gap-1 bg-rose-600 hover:bg-rose-500 text-slate-100 font-mono text-xs font-bold px-4 py-2.5 rounded-lg active:scale-95 transition-all outline-none animate-pulse"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>⚠️ SYSTEM LOCKED - CLICK TO RELEASE</span>
            </button>
          ) : (
            <button
              onClick={onManualTrip}
              className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-slate-100 font-mono text-xs font-bold px-4 py-2.5 rounded-lg active:scale-95 transition-all outline-none"
            >
              <ShieldCheck className="w-3.5 h-3.5 fill-slate-100" />
              <span>INTERLOCK STATUS: NORMAL</span>
            </button>
          )}

          <button
            onClick={onToggleValve}
            className={`font-mono text-xs font-bold px-4 py-2.5 rounded-lg active:scale-95 transition-all outline-none ${
              v001_open 
                ? 'bg-amber-600 hover:bg-amber-500 text-slate-100'
                : 'bg-emerald-600 hover:bg-emerald-500 text-slate-100'
            }`}
          >
            {v001_open ? 'CLOSE VALVE V-001' : 'OPEN VALVE V-001'}
          </button>
        </div>
      </div>

    </div>
  );
}
