"use client";

import React from "react";
import { useDigitalTwin, AAS_PLANT_NODES } from "../context/DigitalTwinContext";
import ThreeCanvas from "./ThreeCanvas";
import ExtractionWorkspace from "./ExtractionWorkspace";
import KnowledgeGraphOverlay from "./KnowledgeGraphOverlay";
import SimulationWorkspace from "./SimulationWorkspace";

const IconFullscreen = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </svg>
);

export default function VisualizerCanvas() {
  const { selectedAsset, setSelectedAsset, activeTab, setActiveTab, expandedPanel, setExpandedPanel, telemetry, simStatus } = useDigitalTwin();

  const [activePopup, setActivePopup] = React.useState<string | null>(null);

  const togglePopup = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActivePopup(activePopup === id ? null : id);
  };

  // Map simulated values to HMI scenario variables
  const tankLevel = Math.round(telemetry.temp);
  const pressureValue = (telemetry.press * 10).toFixed(0);
  const flowValue = (telemetry.flow / 10).toFixed(0);

  // Dynamic status mappings from actual backend state
  const pmp001Running = simStatus ? simStatus.pmp001_speed > 0 : true;
  const pmp002Running = simStatus ? simStatus.pmp002_speed > 0 : false;
  const v001Open = simStatus ? simStatus.v001_open : true;

  const pmp001Color = pmp001Running ? "#10b981" : "#7e8a97";
  const pmp001Stroke = pmp001Running ? "#047857" : "#475569";
  const pmp002Color = pmp002Running ? "#10b981" : "#cbd5e1";
  const pmp002Stroke = pmp002Running ? "#047857" : "#64748b";
  const valveColor = v001Open ? "#10b981" : "#ef4444";
  const valveStroke = v001Open ? "#047857" : "#991b1b";
  const pmp002PipeColor = (pmp002Running && v001Open) ? "#10b981" : "#7e8a97";

  // Close popup if clicking on the background
  const handleSvgClick = () => {
    if (activePopup) setActivePopup(null);
  };

  return (
    <div className="w-full h-full relative overflow-hidden bg-black/40">
      
      {/* Floating HUD View Selector (Top Left) */}
      <div className="absolute top-3 left-3 z-30 flex bg-[var(--bg-panel)]/95 p-0.5 border border-[var(--border-panel)] rounded shadow-lg">
        {(["3d", "2d", "simulation", "extraction"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 text-[8.5px] font-bold uppercase rounded transition-colors ${
              activeTab === tab ? "bg-cyan-500 text-white" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
            }`}
          >
            {tab === "3d" ? "3D CAD" : tab === "2d" ? "2D P&ID" : tab === "simulation" ? "Simulation" : "AI Parser"}
          </button>
        ))}
      </div>

      {/* Floating HUD Controls (Top Right) */}
      {!expandedPanel && (
        <div className="absolute top-3 right-3 z-30 flex items-center gap-3 bg-[var(--bg-panel)]/95 px-3 py-1.5 border border-[var(--border-panel)] rounded shadow-lg">
          <button 
            onClick={() => setExpandedPanel("3d")}
            className="p-1 hover:bg-black/5 rounded text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
            title="Expand Viewport"
          >
            <IconFullscreen />
          </button>
        </div>
      )}

      {/* 3D View Render with Overlay HUD Tags & Neo4j Graph */}
      {activeTab === "3d" && (
        <div className="w-full h-full relative">
          <ThreeCanvas />
        </div>
      )}

      {/* 2D P&ID SVG View Render */}
      {activeTab === "2d" && (
        <div className="w-full h-full relative bg-[#d8dbdf] flex items-center justify-center p-2">
          <svg viewBox="0 0 960 320" className="w-full h-full max-h-full select-none" preserveAspectRatio="xMidYMid meet" onClick={handleSvgClick}>
            {/* Screen Background (Neutral HMI gray) */}
            <rect width="100%" height="100%" fill="#d8dbdf" />
            
            {/* Grid lines helper (subtle HMI background pattern) */}
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(0,0,0,0.03)" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            {/* PIPES (ISA standard process lines - dynamically colored based on status) */}
            {/* Source to PMP-001 (Running -> Green) */}
            <line x1="80" y1="180" x2="182" y2="180" stroke={pmp001Color} strokeWidth="4" />
            {/* PMP-001 to Tank (Running -> Green) */}
            <line x1="220" y1="167" x2="430" y2="167" stroke={pmp001Color} strokeWidth="4" />
            {/* PIT-001 branch line (Running -> Green) */}
            <line x1="320" y1="167" x2="320" y2="140" stroke={pmp001Color} strokeWidth="2.5" />

            {/* Tank to V-001 (Running/Open -> Green) */}
            <path d="M 510 200 L 540 200 L 540 220 L 600 220" fill="none" stroke={v001Open ? "#10b981" : "#7e8a97"} strokeWidth="4" />
            {/* V-001 to PMP-002 (Running/Open -> Green) */}
            <line x1="630" y1="220" x2="682" y2="220" stroke={v001Open ? "#10b981" : "#7e8a97"} strokeWidth="4" />

            {/* PMP-002 to FIT-001 (Stopped/Idle -> Light Gray) */}
            <line x1="720" y1="207" x2="850" y2="207" stroke={pmp002PipeColor} strokeWidth="4" />
            {/* FIT-001 branch line (Stopped/Idle -> Light Gray) */}
            <line x1="790" y1="207" x2="790" y2="138" stroke={pmp002PipeColor} strokeWidth="2.5" />

            {/* Instrument connection lines for LIT, LAH, LAL (Vertical Stack) */}
            <line x1="510" y1="144" x2="525" y2="144" stroke="#7e8a97" strokeWidth="1.5" />
            <line x1="540" y1="52" x2="540" y2="159" stroke="#7e8a97" strokeWidth="1.5" />

            {/* 1. FROM SOURCE BOX */}
            <rect x="80" y="160" width="80" height="40" fill="#a1a1aa" stroke="#000000" strokeWidth="1.5" />
            <text x="120" y="184" fill="#000000" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">FROM SOURCE</text>

            {/* 2. PMP-001 (CENTRIFUGAL PUMP - RUNNING) */}
            <g onClick={(e) => { setSelectedAsset(AAS_PLANT_NODES[0]); togglePopup("PMP-001", e); }} className="cursor-pointer group">
              {/* Status Box (Above Asset) */}
              <rect x="145" y="113" width="110" height="24" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" rx="2" />
              <text x="200" y="129" fill={pmp001Running ? "#10b981" : "#ef4444"} fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">{`STATUS: ${pmp001Running ? "RUNNING" : "STOPPED"}`}</text>

              {/* Pump Stand Base */}
              <path d="M 191 195 L 209 195 L 216 204 L 184 204 Z" fill={pmp001Color} stroke={pmp001Stroke} strokeWidth="2" />
              {/* Pump Tangential Nozzle */}
              <path d="M 200 162 L 220 162 L 220 172 L 198 172 Z" fill={pmp001Color} stroke={pmp001Stroke} strokeWidth="1.5" />
              {/* Casing Circle */}
              <circle cx="200" cy="180" r="18" fill={pmp001Color} stroke={pmp001Stroke} strokeWidth="3" />
              <text x="200" y="222" fill="#000000" fontSize="11" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">PMP-001</text>

              {/* Pump Parameters Specifications Box */}
              <rect x="150" y="235" width="100" height="40" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" rx="2" />
              <text x="155" y="247" fill="#475569" fontSize="8" fontWeight="bold" fontFamily="monospace">Mfr: KSB</text>
              <text x="155" y="259" fill="#475569" fontSize="8" fontWeight="bold" fontFamily="monospace">Max Temp: 85°C</text>
              <text x="155" y="271" fill="#475569" fontSize="8" fontWeight="bold" fontFamily="monospace">Max Pres: 16 bar</text>

            </g>

            {/* 3. PIT-001 (PRESSURE TRANSMITTER BUBBLE) */}
            <g onClick={(e) => { setSelectedAsset(AAS_PLANT_NODES[1]); togglePopup("PIT-001", e); }} className="cursor-pointer group">
              {/* Status / Value Box (Above Asset) */}
              <rect x="270" y="66" width="100" height="24" fill="#e2e8f0" stroke="#a1a1aa" strokeWidth="1" rx="2" />
              <text x="320" y="82" fill="#2563eb" fontSize="11" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">{`PIT-001: ${telemetry.press.toFixed(2)} Bar`}</text>

              {/* Bubble */}
              <circle cx="320" cy="120" r="18" fill="#ffffff" stroke={selectedAsset.tag === "PIT-001" ? "#0284c7" : "#000000"} strokeWidth="1.5" />
              <line x1="302" y1="120" x2="338" y2="120" stroke="#000000" strokeWidth="1.5" />
              <text x="320" y="113" fill="#000000" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">PIT</text>
              <text x="320" y="131" fill="#000000" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">001</text>

            </g>

            {/* 4. TK-001 (PROCESS TANK - RECTANGULAR) */}
            <g onClick={(e) => { setSelectedAsset(AAS_PLANT_NODES[2]); togglePopup("TK-001", e); }} className="cursor-pointer group">
              {/* Status / Value Box (Above Asset) */}
              <rect x="422" y="70" width="96" height="24" fill="#e2e8f0" stroke="#a1a1aa" strokeWidth="1" rx="2" />
              <text x="470" y="86" fill="#0f172a" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">{`LEVEL: ${tankLevel} %`}</text>

              {/* Rectangular Tank Cylinder Body */}
              <rect x="430" y="110" width="80" height="150" fill="#e2e8f0" stroke={selectedAsset.tag === "TK-001" ? "#0284c7" : "#000000"} strokeWidth={selectedAsset.tag === "TK-001" ? "3" : "2"} rx="4" />
              
              {/* Level indicator container */}
              <rect x="445" y="130" width="16" height="110" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
              {/* Dynamic Liquid fill */}
              <rect x="446.5" y={240 - (tankLevel * 1.1)} width="13" height={tankLevel * 1.1} fill="#2563eb" />
              
              {/* Graduation Ticks (0, 20, 40, 60, 80, 100) */}
              {[0, 20, 40, 60, 80, 100].map((val) => {
                const tickY = 240 - val * 1.1;
                return (
                  <g key={`tick-${val}`}>
                    <line x1="461" y1={tickY} x2="467" y2={tickY} stroke="#000000" strokeWidth="1" />
                    <text x="470" y={tickY + 2.5} fontSize="6" fill="#475569" fontFamily="sans-serif">{val}</text>
                  </g>
                );
              })}

              <text x="470" y="278" fill="#000000" fontSize="12" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">TK-001</text>
              
              {/* Popup removed - moved to corner */}
              
              {/* Alarm indicators only show dynamically during abnormal telemetry limits */}
              {/* Priority 2: Low Alarm (Yellow Triangle) */}
              {tankLevel < 20 && (
                <g>
                  <path d="M 405 170 L 413 182 L 397 182 Z" fill="#facc15" stroke="#000000" strokeWidth="1" />
                  <text x="405" y="180" fill="#000000" fontSize="7" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">2</text>
                </g>
              )}
              {/* Priority 1: High Alarm (Red Square) */}
              {tankLevel > 80 && (
                <g>
                  <rect x="399" y="190" width="12" height="12" fill="#ef4444" stroke="#000000" strokeWidth="1" rx="1" />
                  <text x="405" y="199" fill="#ffffff" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">1</text>
                </g>
              )}

              {/* Vertical Stack Instrument Bubbles */}
              {/* LIT-001 Value Box (Above LIT) */}
              <rect x="495" y="15" width="90" height="20" fill="#e2e8f0" stroke="#a1a1aa" strokeWidth="1" rx="2" />
              <text x="540" y="29" fill="#2563eb" fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">{`LIT-001: ${tankLevel} %`}</text>

              {/* LIT-001 Bubble */}
              <g onClick={(e) => { e.stopPropagation(); setSelectedAsset(AAS_PLANT_NODES[2]); togglePopup("LIT-001", e); }} className="cursor-pointer">
                <circle cx="540" cy="52" r="15" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
                <line x1="525" y1="52" x2="555" y2="52" stroke="#000000" strokeWidth="1.5" />
                <text x="540" y="46" fill="#000000" fontSize="7" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">LIT</text>
                <text x="540" y="61" fill="#000000" fontSize="7" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">001</text>
                
              </g>

              {/* LAH-001 Bubble */}
              <g>
                <circle cx="540" cy="98" r="15" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
                <line x1="525" y1="98" x2="555" y2="98" stroke="#000000" strokeWidth="1.5" />
                <text x="540" y="92" fill="#000000" fontSize="7" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">LAH</text>
                <text x="540" y="107" fill="#000000" fontSize="7" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">001</text>
              </g>

              {/* LAL-001 Bubble */}
              <g>
                <circle cx="540" cy="144" r="15" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
                <line x1="525" y1="144" x2="555" y2="144" stroke="#000000" strokeWidth="1.5" />
                <text x="540" y="138" fill="#000000" fontSize="7" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">LAL</text>
                <text x="540" y="153" fill="#000000" fontSize="7" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">001</text>
              </g>
            </g>

            {/* 5. V-001 (CONTROL VALVE - ACTIVE/OPEN) */}
            <g onClick={() => setSelectedAsset(AAS_PLANT_NODES[3])} className="cursor-pointer group">
              {/* Valve Status display box (Above Asset) */}
              <rect x="560" y="153" width="110" height="24" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" rx="2" />
              <text x="615" y="169" fill={valveColor} fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">{`STATE: ${v001Open ? "OPEN" : "CLOSED"}`}</text>

              {/* Bowtie valve symbol */}
              <path d="M 600 210 L 630 230 L 630 210 L 600 230 Z" fill={valveColor} stroke={valveStroke} strokeWidth="2.5" />
              {/* Actuator diaphragm dome */}
              <line x1="615" y1="220" x2="615" y2="200" stroke="#000000" strokeWidth="2" />
              <rect x="605" y="195" width="20" height="6" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
              <text x="615" y="250" fill="#000000" fontSize="11" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">V-001</text>
            </g>

            {/* 6. PMP-002 (DISCHARGE PUMP - IDLE/STOPPED) */}
            <g onClick={(e) => { setSelectedAsset(AAS_PLANT_NODES[4]); togglePopup("PMP-002", e); }} className="cursor-pointer group">
              {/* Status Box (Above Asset) */}
              <rect x="645" y="113" width="110" height="24" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" rx="2" />
              <text x="700" y="129" fill={pmp002Running ? "#10b981" : "#64748b"} fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">{`STATUS: ${pmp002Running ? "RUNNING" : "IDLE"}`}</text>

              {/* Pump Stand Base */}
              <path d="M 691 235 L 709 235 L 716 244 L 684 244 Z" fill={pmp002Color} stroke={pmp002Stroke} strokeWidth="1.5" />
              {/* Pump Tangential Nozzle */}
              <path d="M 700 202 L 720 202 L 720 212 L 698 212 Z" fill={pmp002Color} stroke={pmp002Stroke} strokeWidth="1.5" />
              {/* Casing Circle */}
              <circle cx="700" cy="220" r="18" fill={pmp002Color} stroke={pmp002Stroke} strokeWidth="2" />
              <text x="700" y="262" fill="#000000" fontSize="11" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">PMP-002</text>

              {/* Pump Parameters Specifications Box */}
              <rect x="650" y="272" width="100" height="40" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" rx="2" />
              <text x="655" y="284" fill="#475569" fontSize="8" fontWeight="bold" fontFamily="monospace">Mfr: Grundfos</text>
              <text x="655" y="296" fill="#475569" fontSize="8" fontWeight="bold" fontFamily="monospace">Max Temp: 75°C</text>
              <text x="655" y="308" fill="#475569" fontSize="8" fontWeight="bold" fontFamily="monospace">Max Pres: 10 bar</text>

            </g>

            {/* 7. FIT-001 (FLOW TRANSMITTER BUBBLE) */}
            <g onClick={(e) => { setSelectedAsset(AAS_PLANT_NODES[5]); togglePopup("FIT-001", e); }} className="cursor-pointer group">
              {/* Status / Value Box (Above Asset) */}
              <rect x="740" y="66" width="100" height="24" fill="#e2e8f0" stroke="#a1a1aa" strokeWidth="1" rx="2" />
              <text x="790" y="82" fill="#2563eb" fontSize="11" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">{`FIT-001: ${(telemetry.flow / 10).toFixed(1)} L/s`}</text>

              {/* Bubble */}
              <circle cx="790" cy="120" r="18" fill="#ffffff" stroke={selectedAsset.tag === "FIT-001" ? "#0284c7" : "#000000"} strokeWidth="1.5" />
              <line x1="772" y1="120" x2="808" y2="120" stroke="#000000" strokeWidth="1.5" />
              <text x="790" y="113" fill="#000000" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">FIT</text>
              <text x="790" y="131" fill="#000000" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">001</text>

            </g>

            {/* 8. TO TARGET BOX */}
            <rect x="850" y="187" width="80" height="40" fill="#a1a1aa" stroke="#000000" strokeWidth="1.5" />
            <text x="890" y="211" fill="#000000" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">TO TARGET</text>

            {/* Fixed Left Corner Popup Area */}
            {activePopup && (
              <foreignObject x="15" y="15" width="160" height="100">
                <div className="bg-white border border-gray-400 rounded-sm p-2 text-[10px] shadow-md text-gray-800 pointer-events-none">
                  {activePopup === "PMP-001" && (
                    <>
                      <div className="font-bold text-blue-800 mb-1 border-b border-gray-300 pb-1">PMP-001 Live Stats</div>
                      <div className="flex justify-between"><span>Speed:</span><span className="font-mono font-bold text-green-600">
                        {simStatus ? simStatus.pmp001?.speed_rpm.toFixed(0) : "0"} RPM
                      </span></div>
                      <div className="flex justify-between"><span>Temp:</span><span className="font-mono font-bold text-blue-600">
                        {simStatus ? simStatus.pmp001?.temperature_c.toFixed(1) : "25.0"} °C
                      </span></div>
                      <div className="flex justify-between"><span>Power:</span><span className="font-mono font-bold text-amber-600">
                        {simStatus ? simStatus.pmp001?.power_kw.toFixed(2) : "0.00"} kW
                      </span></div>
                    </>
                  )}
                  {activePopup === "PIT-001" && (
                    <>
                      <div className="font-bold text-blue-800 mb-1 border-b border-gray-300 pb-1">PIT-001 Output</div>
                      <div className="flex justify-between"><span>Press:</span><span className="font-mono font-bold text-blue-600">{telemetry.press.toFixed(2)} Bar</span></div>
                    </>
                  )}
                  {activePopup === "TK-001" && (
                    <>
                      <div className="font-bold text-blue-800 mb-1 border-b border-gray-300 pb-1">TK-001 Live Stats</div>
                      <div className="flex justify-between"><span>Level:</span><span className="font-mono font-bold text-green-600">{tankLevel}%</span></div>
                      <div className="flex justify-between"><span>Temp:</span><span className="font-mono font-bold text-red-600">{telemetry.temp.toFixed(1)} °C</span></div>
                    </>
                  )}
                  {activePopup === "LIT-001" && (
                    <>
                      <div className="font-bold text-blue-800 mb-1 border-b border-gray-300 pb-1">LIT-001 Output</div>
                      <div className="flex justify-between"><span>Level:</span><span className="font-mono font-bold text-green-600">{tankLevel} %</span></div>
                    </>
                  )}
                  {activePopup === "PMP-002" && (
                    <>
                      <div className="font-bold text-blue-800 mb-1 border-b border-gray-300 pb-1">PMP-002 Live Stats</div>
                      <div className="flex justify-between"><span>Speed:</span><span className="font-mono font-bold text-green-600">
                        {simStatus ? simStatus.pmp002?.speed_rpm.toFixed(0) : "0"} RPM
                      </span></div>
                      <div className="flex justify-between"><span>Status:</span><span className={`font-mono font-bold ${pmp002Running ? "text-green-600" : "text-gray-500"}`}>
                        {pmp002Running ? "RUNNING" : "IDLE"}
                      </span></div>
                      <div className="flex justify-between"><span>Flow:</span><span className="font-mono font-bold text-blue-600">
                        {simStatus ? simStatus.fit001_flow.toFixed(1) : "0.0"} L/s
                      </span></div>
                    </>
                  )}
                  {activePopup === "FIT-001" && (
                    <>
                      <div className="font-bold text-blue-800 mb-1 border-b border-gray-300 pb-1">FIT-001 Output</div>
                      <div className="flex justify-between"><span>Flow:</span><span className="font-mono font-bold text-blue-600">{(telemetry.flow / 10).toFixed(1)} L/s</span></div>
                    </>
                  )}
                </div>
              </foreignObject>
            )}

          </svg>
        </div>
      )}


      {/* Semantic Knowledge Graph View Render */}
      {activeTab === "graph" && (
        <div className="w-full h-full flex flex-col justify-between p-6 pt-20">
          <div className="absolute top-20 left-6 text-xs font-mono text-gray-500 uppercase tracking-widest">
            Semantic Graph Database Topology (Neo4j Bridge)
          </div>

          <div className="flex-1 flex items-center justify-center">
            <div className="relative w-full max-w-lg h-48 flex items-center justify-center gap-8">
              <div onClick={() => setSelectedAsset(AAS_PLANT_NODES[0])} className={`w-16 h-16 rounded-full border-2 flex flex-col items-center justify-center cursor-pointer transition-all ${
                selectedAsset.tag === "PMP-001" ? "border-cyan-400 bg-cyan-950/40 text-cyan-400" : "border-gray-800 bg-[#111318]"
              }`}>
                <span className="text-[8px] font-bold">PMP-001</span>
                <span className="text-[6px] text-gray-500">Pump</span>
              </div>

              <div className="text-gray-700 text-xs font-mono">──FEEDS──▶</div>

              <div onClick={() => setSelectedAsset(AAS_PLANT_NODES[2])} className={`w-16 h-16 rounded-full border-2 flex flex-col items-center justify-center cursor-pointer transition-all ${
                selectedAsset.tag === "TK-001" ? "border-cyan-400 bg-cyan-950/40 text-cyan-400" : "border-gray-800 bg-[#111318]"
              }`}>
                <span className="text-[8px] font-bold">TK-001</span>
                <span className="text-[6px] text-gray-500">Tank</span>
              </div>

              <div className="text-gray-700 text-xs font-mono">──FEEDS──▶</div>

              <div onClick={() => setSelectedAsset(AAS_PLANT_NODES[4])} className={`w-16 h-16 rounded-full border-2 flex flex-col items-center justify-center cursor-pointer transition-all ${
                selectedAsset.tag === "PMP-002" ? "border-cyan-400 bg-cyan-950/40 text-cyan-400" : "border-gray-800 bg-[#111318]"
              }`}>
                <span className="text-[8px] font-bold">PMP-002</span>
                <span className="text-[6px] text-gray-500">Pump</span>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-gray-500 text-center pb-16">
            Logical relationships mapped. Click a node to view the matching Eclipse BaSyx AAS data sheet.
          </div>
        </div>
      )}

      {/* SCADA Simulation Workspace Render */}
      {activeTab === "simulation" && (
        <div className="absolute inset-0 pt-12 pb-1">
          <SimulationWorkspace />
        </div>
      )}

      {/* AI Extraction & Correction Workspace Render — always mounted to preserve extraction state across tab switches */}
      <div className="w-full h-full pt-12 pb-1" style={{ display: activeTab === "extraction" ? "flex" : "none" }}>
        <ExtractionWorkspace />
      </div>

    </div>
  );
}
