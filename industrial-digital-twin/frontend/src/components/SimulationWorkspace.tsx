"use client";

import React, { useEffect, useState } from 'react';
import ScadaDiagram from './ScadaDiagram';
import TelemetryChart from './TelemetryChart';
import { SimStatus } from '../types/simulation';
import { 
  Zap, 
  Flame, 
  Gauge, 
  Download, 
  Trash2, 
  Sliders, 
  FileSpreadsheet
} from 'lucide-react';

export default function SimulationWorkspace() {
  const [status, setStatus] = useState<SimStatus | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'control' | 'config'>('control');

  // Input bindings for config form
  const [configForm, setConfigForm] = useState({
    tank_max_capacity: '1000',
    pmp001_max_flow: '50',
    pmp002_max_flow: '50',
    lah_limit: '90',
    lal_limit: '10',
    pmp_nominal_voltage: '400',
    pmp_nominal_power: '4',
    pmp_max_rpm: '1500',
    ambient_temp: '25'
  });

  const fetchState = async (skipConfigUpdate = false) => {
    try {
      const resStatus = await fetch('http://localhost:8000/api/simulation/status');
      if (!resStatus.ok) throw new Error('DCS server unreachable');
      const dataStatus = await resStatus.json();
      setStatus(dataStatus);
      setErrorStatus(null);
      
      if (!skipConfigUpdate) {
        setConfigForm({
          tank_max_capacity: String(dataStatus.tank_max_capacity),
          pmp001_max_flow: String(dataStatus.pmp001_max_flow || 50),
          pmp002_max_flow: String(dataStatus.pmp002_max_flow || 50),
          lah_limit: String(dataStatus.lah_limit),
          lal_limit: String(dataStatus.lal_limit),
          pmp_nominal_voltage: String(dataStatus.pmp_nominal_voltage),
          pmp_nominal_power: String(dataStatus.pmp_nominal_power),
          pmp_max_rpm: String(dataStatus.pmp_max_rpm),
          ambient_temp: String(dataStatus.ambient_temp || 25)
        });
      }
    } catch (e: any) {
      setErrorStatus('DCS Controller Offline. Verify Python backend status.');
    }
  };

  const fetchHistory = async () => {
    try {
      const resHistory = await fetch('http://localhost:8000/api/simulation/history');
      if (resHistory.ok) {
        const dataHistory = await resHistory.json();
        setHistory(dataHistory);
      }
    } catch (e) {}
  };

  useEffect(() => {
    const isConfig = activeTab === 'config';
    fetchState(isConfig);
    fetchHistory();
    const statusInterval = setInterval(() => {
      fetchState(isConfig);
      fetchHistory();
    }, 1000);

    return () => clearInterval(statusInterval);
  }, [activeTab]);

  const handlePumpControls = async (fields: any) => {
    try {
      const res = await fetch('http://localhost:8000/api/simulation/controls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields)
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
      }
    } catch (e) {}
  };

  const handleResetInterlock = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/simulation/reset-interlock', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Failed to release safety interlock.');
      } else {
        setStatus(data.status);
      }
    } catch (e) {}
  };

  const handleManualTrip = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/simulation/manual-trip', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
      }
    } catch (e) {}
  };

  const handleToggleValve = async () => {
    if (!status) return;
    await handlePumpControls({ v001_open: !status.v001_open });
  };

  const handleToggleLogging = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/simulation/logging/toggle', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
      }
    } catch (e) {}
  };

  const handleWipeLogs = async () => {
    if (!confirm('Are you sure you want to completely clear and reset the local CSV datasets? This cannot be undone.')) return;
    try {
      const res = await fetch('http://localhost:8000/api/simulation/logs', { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
        alert('Telemetry CSV datasets cleared successfully.');
      }
    } catch (e) {}
  };

  const handleConfigSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('http://localhost:8000/api/simulation/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configForm)
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
        if (data.status) {
          setConfigForm({
            tank_max_capacity: String(data.status.tank_max_capacity),
            pmp001_max_flow: String(data.status.pmp001_max_flow || 50),
            pmp002_max_flow: String(data.status.pmp002_max_flow || 50),
            lah_limit: String(data.status.lah_limit),
            lal_limit: String(data.status.lal_limit),
            pmp_nominal_voltage: String(data.status.pmp_nominal_voltage),
            pmp_nominal_power: String(data.status.pmp_nominal_power),
            pmp_max_rpm: String(data.status.pmp_max_rpm),
            ambient_temp: String(data.status.ambient_temp || 25)
          });
        }
        alert('System configuration parameters calibrated!');
      } else {
        alert('Invalid calibration values. Confirm alarm and flow rules.');
      }
    } catch (e) {}
  };

  return (
    <div className="w-full h-full bg-slate-950 text-slate-100 overflow-y-auto p-6 pt-16 space-y-6">
      
      {/* Network notifications */}
      {errorStatus && (
        <div className="flex items-center gap-3 bg-rose-950/40 border border-rose-500/30 text-rose-300 p-4 rounded-xl text-sm font-sans animate-bounce">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shrink-0" />
          <span>{errorStatus} - Data telemetry is currently frozen.</span>
        </div>
      )}

      {status && (
        <>
          {/* ROW 1: SCADA ANIMATION DIAGRAM */}
          <ScadaDiagram 
            status={status}
            onToggleValve={handleToggleValve}
            onResetInterlock={handleResetInterlock}
            onManualTrip={handleManualTrip}
          />

          {/* ROW 2: CONTROLS, INJECTION, AND CSV DOWNLOADING SPLIT */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-w-0">
            
            {/* LEFT COLUMN: Operator Interface and Fault Injector */}
            <div className="lg:col-span-7 flex flex-col gap-6 min-w-0">
              
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-4">
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-sky-400" />
                    <span>Operators Control Room & Configuration Tuning</span>
                  </h3>
                  
                  <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                    <button
                      onClick={() => setActiveTab('control')}
                      className={`px-3 py-1 rounded-md text-xs font-mono font-medium transition-all cursor-pointer ${
                        activeTab === 'control' ? 'bg-sky-505 bg-sky-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Active Controls
                    </button>
                    <button
                      onClick={() => setActiveTab('config')}
                      className={`px-3 py-1 rounded-md text-xs font-mono font-medium transition-all cursor-pointer ${
                        activeTab === 'config' ? 'bg-sky-505 bg-sky-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Calibrate Limits
                    </button>
                  </div>
                </div>

                {activeTab === 'control' ? (
                  <div className="flex flex-col gap-6">
                    
                    {/* PMP-001 Level Controls */}
                    <div className="bg-slate-950 border border-slate-800/60 rounded-xl p-4">
                      <div className="flex justify-between items-center mb-2">
                        <div>
                          <span className="text-[10px] font-mono text-slate-500 uppercase">feed controller</span>
                          <h4 className="text-sm font-semibold text-sky-400">PMP-001 Motor Speed</h4>
                        </div>
                        <span className={`text-sm font-mono font-bold ${status.pmp001_speed > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {status.pmp001_speed.toFixed(0)}%
                        </span>
                      </div>
                      <input 
                        type="range"
                        min="0"
                        max="100"
                        disabled={status.interlock_tripped || status.lit001_pct >= status.lah_limit}
                        value={status.pmp001_speed}
                        onChange={(e) => handlePumpControls({ pmp001_speed: parseInt(e.target.value) })}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500 disabled:opacity-30 disabled:cursor-not-allowed"
                      />
                      {status.lit001_pct >= status.lah_limit && (
                        <span className="text-[10px] text-rose-400 font-mono block mt-1">✗ LOCKED: High level alarm (LAH) lock active.</span>
                      )}
                      {status.interlock_tripped && (
                        <span className="text-[10px] text-rose-500 font-mono block mt-1">✗ LOCKED: Master SIS Trip engaged.</span>
                      )}
                    </div>

                    {/* PMP-002 Level Controls */}
                    <div className="bg-slate-950 border border-slate-800/60 rounded-xl p-4">
                      <div className="flex justify-between items-center mb-2">
                        <div>
                          <span className="text-[10px] font-mono text-slate-500 uppercase">discharge controller</span>
                          <h4 className="text-sm font-semibold text-sky-400">PMP-002 Motor Speed</h4>
                        </div>
                        <span className={`text-sm font-mono font-bold ${status.pmp002_speed > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {status.pmp002_speed.toFixed(0)}%
                        </span>
                      </div>
                      <input 
                        type="range"
                        min="0"
                        max="100"
                        disabled={status.interlock_tripped || status.lit001_pct <= status.lal_limit}
                        value={status.pmp002_speed}
                        onChange={(e) => handlePumpControls({ pmp002_speed: parseInt(e.target.value) })}
                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500 disabled:opacity-30 disabled:cursor-not-allowed"
                      />
                      {status.lit001_pct <= status.lal_limit && (
                        <span className="text-[10px] text-rose-400 font-mono block mt-1">✗ LOCKED: Low level alarm (LAL) lock active.</span>
                      )}
                      {status.interlock_tripped && (
                        <span className="text-[10px] text-rose-500 font-mono block mt-1">✗ LOCKED: Master SIS Trip engaged.</span>
                      )}
                    </div>

                    {/* Wear Fault injection Controls */}
                    <div>
                      <span className="text-xs uppercase font-mono tracking-wider text-slate-500 block mb-2">Fault Injection Engine</span>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        
                        {/* Pump 1 Fault box */}
                        <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                          status.pmp001.bearing_wear 
                            ? 'bg-rose-950/20 border-rose-500/40 text-rose-200' 
                            : 'bg-slate-950 border-slate-800/60 hover:border-slate-700/60 text-slate-300'
                        }`}>
                          <input 
                            type="checkbox"
                            checked={status.pmp001.bearing_wear}
                            onChange={(e) => handlePumpControls({ pmp001_bearing_wear: e.target.checked })}
                            className="mt-1 accent-rose-500 rounded"
                          />
                          <div>
                            <div className="text-sm font-semibold font-sans">Simulate PMP-001 Wear</div>
                            <span className="text-[11px] font-mono text-slate-400 block mt-1">
                              Induces physical drag. Increases current (A) & power draw (kW) + generates winding heat.
                            </span>
                          </div>
                        </label>

                        {/* Pump 2 Fault box */}
                        <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                          status.pmp002.bearing_wear 
                            ? 'bg-rose-950/20 border-rose-500/40 text-rose-200' 
                            : 'bg-slate-950 border-slate-800/60 hover:border-slate-700/60 text-slate-300'
                        }`}>
                          <input 
                            type="checkbox"
                            checked={status.pmp002.bearing_wear}
                            onChange={(e) => handlePumpControls({ pmp002_bearing_wear: e.target.checked })}
                            className="mt-1 accent-rose-500 rounded"
                          />
                          <div>
                            <div className="text-sm font-semibold font-sans">Simulate PMP-002 Wear</div>
                            <span className="text-[11px] font-mono text-slate-400 block mt-1">
                              Triggers structural wear on output pump. Winding coil temperature climbs gradually.
                            </span>
                          </div>
                        </label>

                      </div>
                    </div>

                  </div>
                ) : (
                  <form onSubmit={handleConfigSubmit} className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Max Tank Storage (Liters)</label>
                        <input 
                          type="number"
                          value={configForm.tank_max_capacity}
                          onChange={(e) => setConfigForm({...configForm, tank_max_capacity: e.target.value})}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono focus:border-sky-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">PMP-001 Max Flow Rate (L/s)</label>
                        <input 
                          type="number"
                          value={configForm.pmp001_max_flow}
                          onChange={(e) => setConfigForm({...configForm, pmp001_max_flow: e.target.value})}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono focus:border-sky-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">High Level Alarm LAH Limit (%)</label>
                        <input 
                          type="number"
                          value={configForm.lah_limit}
                          onChange={(e) => setConfigForm({...configForm, lah_limit: e.target.value})}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono focus:border-sky-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Low Level Alarm LAL Limit (%)</label>
                        <input 
                          type="number"
                          value={configForm.lal_limit}
                          onChange={(e) => setConfigForm({...configForm, lal_limit: e.target.value})}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono focus:border-sky-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Nominal Motor Voltage (V)</label>
                        <input 
                          type="number"
                          value={configForm.pmp_nominal_voltage}
                          onChange={(e) => setConfigForm({...configForm, pmp_nominal_voltage: e.target.value})}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono focus:border-sky-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Nominal Power Capability (kW)</label>
                        <input 
                          type="number"
                          value={configForm.pmp_nominal_power}
                          onChange={(e) => setConfigForm({...configForm, pmp_nominal_power: e.target.value})}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono focus:border-sky-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-sans font-bold text-sm px-4 py-2.5 rounded-lg transition-all mt-2 cursor-pointer text-center"
                    >
                      Recalibrate SCADA Process Directives
                    </button>
                  </form>
                )}
              </div>

              {/* Live Motor Diagnostics and Metrics Readout */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* PMP-001 Diagnostics Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
                  <div className="flex justify-between items-center border-b border-slate-800/60 pb-3 mb-3">
                    <div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase">telemetry point</span>
                      <h4 className="text-sm font-bold text-slate-200">PMP-001 Metrics</h4>
                    </div>
                    {status.pmp001.bearing_wear ? (
                      <span className="text-[9px] bg-rose-950 border border-rose-500/20 text-rose-400 font-mono font-semibold px-2 py-0.5 rounded-md animate-pulse">
                        DEGRADATION
                      </span>
                    ) : (
                      <span className="text-[9px] bg-emerald-955 bg-emerald-950 border border-emerald-500/20 text-emerald-405 text-emerald-400 font-mono font-semibold px-2 py-0.5 rounded-md">
                        HEALTHY
                      </span>
                    )}
                  </div>
                  <div className="space-y-2.5 font-mono text-xs">
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Speed (RPM):</span>
                      <span className="text-slate-100 font-bold">{status.pmp001.speed_rpm.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Active Power:</span>
                      <span className="text-amber-400 font-bold">{status.pmp001.power_kw.toFixed(2)} kW</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Voltage Draw:</span>
                      <span className="text-slate-200">{status.pmp001.voltage_v.toFixed(1)} V</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Current Draw:</span>
                      <span className="text-emerald-400 font-bold">{status.pmp001.current_a.toFixed(3)} A</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Thermology:</span>
                      <span className={`font-bold ${status.pmp001.temperature_c >= 105 ? 'text-rose-400 animate-pulse' : 'text-orange-400'}`}>
                        {status.pmp001.temperature_c.toFixed(1)} °C
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Discharge Head:</span>
                      <span className="text-cyan-400 font-bold">{status.pmp001.pressure_bar.toFixed(2)} bar</span>
                    </div>
                  </div>
                </div>

                {/* PMP-002 Diagnostics Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
                  <div className="flex justify-between items-center border-b border-slate-800/60 pb-3 mb-3">
                    <div>
                      <span className="text-[10px] font-mono text-slate-500 uppercase">telemetry point</span>
                      <h4 className="text-sm font-bold text-slate-200">PMP-002 Metrics</h4>
                    </div>
                    {status.pmp002.bearing_wear ? (
                      <span className="text-[9px] bg-rose-950 border border-rose-500/20 text-rose-400 font-mono font-semibold px-2 py-0.5 rounded-md animate-pulse">
                        DEGRADATION
                      </span>
                    ) : (
                      <span className="text-[9px] bg-emerald-955 bg-emerald-950 border border-emerald-500/20 text-emerald-405 text-emerald-400 font-mono font-semibold px-2 py-0.5 rounded-md">
                        HEALTHY
                      </span>
                    )}
                  </div>
                  <div className="space-y-2.5 font-mono text-xs">
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Speed (RPM):</span>
                      <span className="text-slate-100 font-bold">{status.pmp002.speed_rpm.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Active Power:</span>
                      <span className="text-amber-400 font-bold">{status.pmp002.power_kw.toFixed(2)} kW</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Voltage Draw:</span>
                      <span className="text-slate-200">{status.pmp002.voltage_v.toFixed(1)} V</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Current Draw:</span>
                      <span className="text-emerald-400 font-bold">{status.pmp002.current_a.toFixed(3)} A</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Live Temp:</span>
                      <span className={`font-bold ${status.pmp002.temperature_c >= 105 ? 'text-rose-400 animate-pulse' : 'text-orange-400'}`}>
                        {status.pmp002.temperature_c.toFixed(1)} °C
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Discharge Head:</span>
                      <span className="text-cyan-400 font-bold">{status.pmp002.pressure_bar.toFixed(2)} bar</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
            
            {/* RIGHT COLUMN: 1-Hz CSV Logger Registry */}
            <div className="lg:col-span-5 flex flex-col gap-6 min-w-0">
              
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex-1 flex flex-col justify-between min-w-0">
                <div>
                  <div className="flex justify-between items-start mb-4 border-b border-slate-800 pb-3 gap-2">
                    <div className="min-w-0">
                      <span className="text-xs uppercase tracking-wider font-mono text-slate-500">Local Filesystem Records</span>
                      <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mt-0.5">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="truncate">1-Hz CSV Datasets Engine</span>
                      </h3>
                    </div>
                    <button
                      onClick={handleToggleLogging}
                      className={`text-[10px] font-mono font-bold px-3 py-1 rounded-md cursor-pointer uppercase transition-all shrink-0 ${
                        status.logging_active 
                          ? 'bg-emerald-500/15 border border-emerald-500/20 text-emerald-400' 
                          : 'bg-rose-500/15 border border-rose-500/20 text-rose-400'
                      }`}
                    >
                      {status.logging_active ? '● Log: Active' : '● Log: Paused'}
                    </button>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed font-sans mb-5">
                    The backend is writing mechanical parameters of both industrial pumps to local CSV files directly every second. This dataset generates mock telemetry suitable for predictive maintenance, anomaly classification, and vibration training runs.
                  </p>

                  {/* Dataset Files List and Metrics */}
                  <div className="space-y-4">
                    
                    {/* File Card 1: Pump 001 CSV */}
                    <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 flex items-center justify-between gap-3 min-w-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="bg-sky-500/10 text-sky-400 p-2.5 rounded-lg border border-sky-500/15 shrink-0">
                          <FileSpreadsheet className="w-5 h-5 text-sky-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-mono font-bold text-slate-200 truncate" title="pmp001_pdm_dataset.csv">pmp001_pdm_dataset.csv</div>
                          <span className="text-[11px] font-mono text-slate-500 block truncate">
                            Logged rows: <b className="text-slate-300 font-semibold">{status.pmp001_log_line_count} seconds</b>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-mono font-bold text-slate-400 bg-slate-900 border border-slate-800/60 px-2 py-0.5 rounded">
                          {(status.pmp001_log_size / 1024).toFixed(1)} KB
                        </span>
                        <a 
                          href="http://localhost:8000/api/simulation/download-csv/1"
                          download="pmp001_pdm_dataset.csv"
                          className="bg-emerald-600 hover:bg-emerald-500 text-slate-100 p-2 rounded-lg transition-all flex items-center justify-center shrink-0"
                          title="Download dataset"
                        >
                          <Download className="w-4 h-4 text-slate-100" />
                        </a>
                      </div>
                    </div>

                    {/* File Card 2: Pump 002 CSV */}
                    <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 flex items-center justify-between gap-3 min-w-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="bg-sky-500/10 text-sky-400 p-2.5 rounded-lg border border-sky-500/15 shrink-0">
                          <FileSpreadsheet className="w-5 h-5 text-sky-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-mono font-bold text-slate-200 truncate" title="pmp002_pdm_dataset.csv">pmp002_pdm_dataset.csv</div>
                          <span className="text-[11px] font-mono text-slate-500 block truncate">
                            Logged rows: <b className="text-slate-300 font-semibold">{status.pmp002_log_line_count} seconds</b>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-mono font-bold text-slate-400 bg-slate-900 border border-slate-800/60 px-2 py-0.5 rounded">
                          {(status.pmp002_log_size / 1024).toFixed(1)} KB
                        </span>
                        <a 
                          href="http://localhost:8000/api/simulation/download-csv/2"
                          download="pmp002_pdm_dataset.csv"
                          className="bg-emerald-600 hover:bg-emerald-500 text-slate-100 p-2 rounded-lg transition-all flex items-center justify-center shrink-0"
                          title="Download dataset"
                        >
                          <Download className="w-4 h-4 text-slate-100" />
                        </a>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Actions Bar inside card bottom */}
                <div className="mt-6 pt-5 border-t border-slate-800/60 flex items-center justify-between gap-4">
                  <button
                    onClick={handleWipeLogs}
                    className="flex items-center gap-1.5 bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/20 text-rose-400 font-mono text-xs px-3.5 py-2.5 rounded-lg transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Purge Local Datasets</span>
                  </button>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 font-mono block">Logging Frequency:</span>
                    <span className="text-xs text-sky-400 font-semibold font-mono animate-pulse">1.0 Hz (Every Second)</span>
                  </div>
                </div>

              </div>

            </div>

          </div>

          {/* ROW 3: REAL-TIME TRENDS CHART DISPLAY */}
          <TelemetryChart history={history} />
        </>
      )}

    </div>
  );
}
