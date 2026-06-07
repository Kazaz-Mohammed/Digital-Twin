"use client";

import React from "react";
import { useDigitalTwin, AAS_PLANT_NODES } from "../context/DigitalTwinContext";
import ThreeCanvas from "./ThreeCanvas";
import ExtractionWorkspace from "./ExtractionWorkspace";
import KnowledgeGraphOverlay from "./KnowledgeGraphOverlay";

const IconFullscreen = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </svg>
);

export default function VisualizerCanvas() {
  const { selectedAsset, setSelectedAsset, activeTab, setActiveTab, expandedPanel, setExpandedPanel, telemetry } = useDigitalTwin();

  // Map simulated values to HMI scenario variables
  const tankLevel = Math.round(telemetry.temp);
  const pressureValue = (telemetry.press * 10).toFixed(0);
  const flowValue = (telemetry.flow / 10).toFixed(0);

  return (
    <div className="w-full h-full relative overflow-hidden flex flex-col justify-center items-center bg-black/40">
      
      {/* Floating HUD View Selector (Top Left) */}
      <div className="absolute top-3 left-3 z-30 flex bg-[var(--bg-panel)]/95 p-0.5 border border-[var(--border-panel)] rounded shadow-lg">
        {(["3d", "2d", "extraction"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 text-[8.5px] font-bold uppercase rounded transition-colors ${
              activeTab === tab ? "bg-cyan-500 text-white" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
            }`}
          >
            {tab === "3d" ? "3D CAD" : tab === "2d" ? "2D P&ID" : "AI Parser"}
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
          <svg viewBox="0 0 960 320" className="w-full h-full max-h-full select-none" preserveAspectRatio="xMidYMid meet">
            {/* Screen Background (Neutral HMI gray) */}
            <rect width="100%" height="100%" fill="#d8dbdf" />
            
            {/* Grid lines helper (subtle HMI background pattern) */}
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(0,0,0,0.03)" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            {/* PIPES (ISA standard process lines - thick gray) */}
            <line x1="80" y1="180" x2="182" y2="180" stroke="#7e8a97" strokeWidth="4" />
            <line x1="220" y1="167" x2="430" y2="167" stroke="#7e8a97" strokeWidth="4" />
            <line x1="320" y1="167" x2="320" y2="140" stroke="#7e8a97" strokeWidth="2.5" />

            {/* Outlet line exits side of tank */}
            <path d="M 510 200 L 540 200 L 540 220 L 600 220" fill="none" stroke="#7e8a97" strokeWidth="4" />
            <line x1="630" y1="220" x2="682" y2="220" stroke="#7e8a97" strokeWidth="4" />
            <line x1="720" y1="207" x2="850" y2="207" stroke="#7e8a97" strokeWidth="4" />
            <line x1="790" y1="207" x2="790" y2="180" stroke="#7e8a97" strokeWidth="2.5" />

            {/* Instrument connection lines */}
            <line x1="470" y1="100" x2="470" y2="70" stroke="#7e8a97" strokeWidth="1.5" />
            <line x1="470" y1="70" x2="550" y2="70" stroke="#7e8a97" strokeWidth="1.5" />
            <line x1="510" y1="70" x2="510" y2="66" stroke="#7e8a97" strokeWidth="1.5" />
            <line x1="550" y1="70" x2="550" y2="66" stroke="#7e8a97" strokeWidth="1.5" />

            {/* 1. FROM SOURCE BOX */}
            <rect x="80" y="160" width="80" height="40" fill="#a1a1aa" stroke="#000000" strokeWidth="1.5" />
            <text x="120" y="184" fill="#000000" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">FROM SOURCE</text>

            {/* 2. PMP-001 (CENTRIFUGAL PUMP) */}
            <g onClick={() => setSelectedAsset(AAS_PLANT_NODES[0])} className="cursor-pointer group">
              {/* Pump Stand Base */}
              <path d="M 191 195 L 209 195 L 216 204 L 184 204 Z" fill="#ffffff" stroke={selectedAsset.tag === "PMP-001" ? "#0284c7" : "#000000"} strokeWidth={selectedAsset.tag === "PMP-001" ? "2" : "1.5"} />
              {/* Pump Tangential Nozzle */}
              <path d="M 200 162 L 220 162 L 220 172 L 198 172 Z" fill="#ffffff" stroke={selectedAsset.tag === "PMP-001" ? "#0284c7" : "#000000"} strokeWidth="1.5" />
              {/* Casing Circle */}
              <circle cx="200" cy="180" r="18" fill="#ffffff" stroke={selectedAsset.tag === "PMP-001" ? "#0284c7" : "#000000"} strokeWidth={selectedAsset.tag === "PMP-001" ? "3" : "2"} />
              <text x="200" y="222" fill="#000000" fontSize="11" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">PMP-001</text>
              
              {/* Status Box */}
              <rect x="145" y="113" width="110" height="24" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" rx="2" />
              <text x="200" y="129" fill="#000000" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">STATUS: RUNNING</text>
            </g>

            {/* 3. PIT-001 (PRESSURE TRANSMITTER BUBBLE) */}
            <g onClick={() => setSelectedAsset(AAS_PLANT_NODES[1])} className="cursor-pointer group">
              <circle cx="320" cy="120" r="18" fill="#ffffff" stroke={selectedAsset.tag === "PIT-001" ? "#0284c7" : "#000000"} strokeWidth="1.5" />
              <line x1="302" y1="120" x2="338" y2="120" stroke="#000000" strokeWidth="1.5" />
              <text x="320" y="113" fill="#000000" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">PIT</text>
              <text x="320" y="131" fill="#000000" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">001</text>
              
              {/* ISA Standard Low-Contrast Value Box */}
              <rect x="270" y="66" width="100" height="24" fill="#e2e8f0" stroke="#a1a1aa" strokeWidth="1" rx="2" />
              <text x="320" y="82" fill="#0f172a" fontSize="11" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">{`PIT-001: ${pressureValue} psi`}</text>
            </g>

            {/* 4. TK-001 (PROCESS TANK) */}
            <g onClick={() => setSelectedAsset(AAS_PLANT_NODES[2])} className="cursor-pointer group">
              {/* Tank Cylinder body with rounded dome */}
              <path d="M 430 260 L 430 130 A 40 40 0 0 1 510 130 L 510 260 Z" fill="#e2e8f0" stroke={selectedAsset.tag === "TK-001" ? "#0284c7" : "#000000"} strokeWidth={selectedAsset.tag === "TK-001" ? "3" : "2"} />
              
              {/* Level indicator container */}
              <rect x="460" y="140" width="20" height="100" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
              {/* Dynamic Liquid fill */}
              <rect x="461.5" y={240 - tankLevel} width="17" height={tankLevel} fill="#2563eb" />
              
              <text x="495" y="152" fill="#000000" fontSize="7" fontFamily="sans-serif">LAH</text>
              <text x="495" y="232" fill="#000000" fontSize="7" fontFamily="sans-serif">LAL</text>
              <text x="470" y="280" fill="#000000" fontSize="12" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">TK-001</text>
              
              {/* ISA Standard Low-Contrast Level box reader */}
              <rect x="525" y="125" width="95" height="30" fill="#e2e8f0" stroke="#a1a1aa" strokeWidth="1" rx="2" />
              <text x="532" y="137" fill="#0f172a" fontSize="9" fontWeight="bold" fontFamily="sans-serif">TK-001</text>
              <text x="532" y="149" fill="#0f172a" fontSize="10" fontWeight="bold" fontFamily="sans-serif">{`LEVEL: ${tankLevel} %`}</text>

              {/* Alarm indicators only show dynamically during abnormal telemetry limits */}
              {/* Priority 2: Low Alarm (Yellow Triangle) */}
              {tankLevel < 20 && (
                <g>
                  <path d="M 611 113 L 619 125 L 603 125 Z" fill="#facc15" stroke="#000000" strokeWidth="1" />
                  <text x="611" y="123" fill="#000000" fontSize="7" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">2</text>
                </g>
              )}
              {/* Priority 1: High Alarm (Red Square) */}
              {tankLevel > 80 && (
                <g>
                  <rect x="605" y="130" width="12" height="12" fill="#ef4444" stroke="#000000" strokeWidth="1" rx="1" />
                  <text x="611" y="139" fill="#ffffff" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">1</text>
                </g>
              )}

              {/* Stacked Instrument bubbles */}
              {/* LIT-001 */}
              <circle cx="470" cy="50" r="18" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
              <line x1="452" y1="50" x2="488" y2="50" stroke="#000000" strokeWidth="1.5" />
              <text x="470" y="43" fill="#000000" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">LIT</text>
              <text x="470" y="61" fill="#000000" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">001</text>

              {/* LAH-001 */}
              <circle cx="510" cy="50" r="18" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
              <line x1="492" y1="50" x2="528" y2="50" stroke="#000000" strokeWidth="1.5" />
              <text x="510" y="43" fill="#000000" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">LAH</text>
              <text x="510" y="61" fill="#000000" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">001</text>

              {/* LAL-001 */}
              <circle cx="550" cy="50" r="18" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
              <line x1="532" y1="50" x2="568" y2="50" stroke="#000000" strokeWidth="1.5" />
              <text x="550" y="43" fill="#000000" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">LAL</text>
              <text x="550" y="61" fill="#000000" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">001</text>
            </g>

            {/* 5. V-001 (CONTROL VALVE) */}
            <g onClick={() => setSelectedAsset(AAS_PLANT_NODES[3])} className="cursor-pointer group">
              {/* Bowtie valve symbol */}
              <path d="M 600 210 L 630 230 L 630 210 L 600 230 Z" fill="#ffffff" stroke={selectedAsset.tag === "V-001" ? "#0284c7" : "#000000"} strokeWidth={selectedAsset.tag === "V-001" ? "2.5" : "1.5"} />
              {/* Actuator diaphragm dome */}
              <line x1="615" y1="220" x2="615" y2="200" stroke="#000000" strokeWidth="2" />
              <rect x="605" y="195" width="20" height="6" fill="#ffffff" stroke="#000000" strokeWidth="1.5" />
              <text x="615" y="250" fill="#000000" fontSize="11" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">V-001</text>
              
              {/* Valve status display box */}
              <rect x="560" y="253" width="110" height="24" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" rx="2" />
              <text x="615" y="269" fill="#000000" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">STATE: OPEN</text>
            </g>

            {/* 6. PMP-002 (DISCHARGE PUMP) */}
            <g onClick={() => setSelectedAsset(AAS_PLANT_NODES[4])} className="cursor-pointer group">
              {/* Pump Stand Base */}
              <path d="M 691 235 L 709 235 L 716 244 L 684 244 Z" fill="#555555" stroke={selectedAsset.tag === "PMP-002" ? "#0284c7" : "#000000"} strokeWidth={selectedAsset.tag === "PMP-002" ? "2" : "1.5"} />
              {/* Pump Tangential Nozzle */}
              <path d="M 700 202 L 720 202 L 720 212 L 698 212 Z" fill="#555555" stroke={selectedAsset.tag === "PMP-002" ? "#0284c7" : "#000000"} strokeWidth="1.5" />
              {/* Casing Circle */}
              <circle cx="700" cy="220" r="18" fill="#555555" stroke={selectedAsset.tag === "PMP-002" ? "#0284c7" : "#000000"} strokeWidth={selectedAsset.tag === "PMP-002" ? "3" : "2"} />
              <text x="700" y="262" fill="#000000" fontSize="11" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">PMP-002</text>
              
              {/* Status Box */}
              <rect x="645" y="153" width="110" height="24" fill="#ffffff" stroke="#94a3b8" strokeWidth="1.5" rx="2" />
              <text x="700" y="169" fill="#000000" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">STATUS: IDLE</text>
            </g>

            {/* 7. FIT-001 (FLOW TRANSMITTER BUBBLE) */}
            <g onClick={() => setSelectedAsset(AAS_PLANT_NODES[5])} className="cursor-pointer group">
              <circle cx="790" cy="160" r="18" fill="#ffffff" stroke={selectedAsset.tag === "FIT-001" ? "#0284c7" : "#000000"} strokeWidth="1.5" />
              <line x1="772" y1="160" x2="808" y2="160" stroke="#000000" strokeWidth="1.5" />
              <text x="790" y="153" fill="#000000" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">FIT</text>
              <text x="790" y="171" fill="#000000" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">001</text>
              
              <rect x="740" y="106" width="100" height="24" fill="#e2e8f0" stroke="#a1a1aa" strokeWidth="1" rx="2" />
              <text x="790" y="122" fill="#0f172a" fontSize="11" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">{`FIT-001: ${flowValue} gpm`}</text>
            </g>

            {/* 8. TO TARGET BOX */}
            <rect x="850" y="200" width="80" height="40" fill="#a1a1aa" stroke="#000000" strokeWidth="1.5" />
            <text x="890" y="224" fill="#000000" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">TO TARGET</text>

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

      {/* AI Extraction & Correction Workspace Render */}
      {activeTab === "extraction" && (
        <div className="w-full h-full pt-12 pb-1">
          <ExtractionWorkspace />
        </div>
      )}

    </div>
  );
}
