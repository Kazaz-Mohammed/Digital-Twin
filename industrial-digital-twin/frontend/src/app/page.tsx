"use client";

import React, { useState } from "react";
import { DigitalTwinProvider, useDigitalTwin } from "../context/DigitalTwinContext";
import AasAssetTree from "../components/AasAssetTree";
import ViewControls from "../components/ViewControls";
import ProductionTrend from "../components/ProductionTrend";
import DowntimeAnalysis from "../components/DowntimeAnalysis";
import VisualizerCanvas from "../components/VisualizerCanvas";
import KnowledgeGraphOverlay from "../components/KnowledgeGraphOverlay";

// Custom Premium Outline SVGs to replace emojis
const IconOverview = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const IconAssets = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
  </svg>
);

const IconAnalytics = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const IconReports = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const IconSettings = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const IconExit = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const IconFullscreen = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </svg>
);

const IconSun = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const IconMoon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const DropletIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
  </svg>
);

function DashboardContent() {
  const { isLoggedIn, setIsLoggedIn, activeTab, setActiveTab, expandedPanel, setExpandedPanel } = useDigitalTwin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [activeMenu, setActiveMenu] = useState("overview");

  // State configurations
  const [isLightTheme, setIsLightTheme] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggedIn(true);
  };

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0b0c10]">
        <div className="w-full max-w-md p-8 bg-[#17181e] border border-[#2a2b33] rounded-lg relative z-10">
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 bg-cyan-500/20 border border-cyan-500/40 rounded-xl flex items-center justify-center mb-3">
              <span className="text-cyan-400 font-bold text-xl">DT</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Digital Twin Cockpit</h1>
            <p className="text-sm text-gray-400 mt-1">Identity & Access Management (Keycloak SSO)</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full px-4 py-3 bg-[#151821] border border-gray-800 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-[#151821] border border-gray-800 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
            <button type="submit" className="w-full py-3 btn-primary text-sm tracking-wide uppercase font-semibold">
              Authenticate
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-screen w-screen overflow-hidden transition-colors duration-200 ${isLightTheme ? "theme-light bg-[#f1f5f9] text-[#0f172a]" : "bg-[#0b0c10] text-[#e2e8f0]"}`}>
      
      {/* 1. Far Left Side Navigation Menu */}
      <aside className="w-20 border-r border-[var(--border-panel)] bg-[var(--bg-panel)] flex flex-col justify-between items-center py-6 z-20">
        <div className="flex flex-col items-center space-y-8 w-full">
          <div className="w-8 h-8 rounded-full bg-cyan-950/20 flex items-center justify-center border border-cyan-500/20">
            <DropletIcon />
          </div>

          <nav className="flex flex-col space-y-4 w-full px-2">
            {[
              { id: "overview", label: "Overview", icon: <IconOverview /> },
              { id: "assets", label: "Assets", icon: <IconAssets /> },
              { id: "analytics", label: "Analytics", icon: <IconAnalytics /> },
              { id: "reports", label: "Reports", icon: <IconReports /> },
              { id: "settings", label: "Settings", icon: <IconSettings /> },
            ].map((menu) => (
              <button
                key={menu.id}
                onClick={() => {
                  setActiveMenu(menu.id);
                  if (menu.id === "assets") setActiveTab("2d");
                  else if (menu.id === "analytics") setActiveTab("graph");
                  else if (menu.id === "reports") setActiveTab("extraction");
                  else setActiveTab("3d");
                }}
                className={`w-full py-3 rounded-lg flex flex-col items-center justify-center text-[8px] uppercase tracking-wider font-bold transition-all gap-1.5 ${
                  activeMenu === menu.id
                    ? "bg-[var(--bg-card-dark)] text-cyan-400 border-l-2 border-cyan-500"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-card-dark)]/40 hover:text-[var(--text-main)]"
                }`}
              >
                {menu.icon}
                <span className="mt-1">{menu.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="flex flex-col items-center space-y-4 w-full px-2">
          {/* Pro Icon Theme Switcher (No Emojis) */}
          <button
            onClick={() => setIsLightTheme(!isLightTheme)}
            className="w-10 h-10 rounded-full border border-[var(--border-panel)] hover:border-cyan-500 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
            title="Toggle Light/Dark Theme"
          >
            {isLightTheme ? <IconMoon /> : <IconSun />}
          </button>
          
          <button
            onClick={() => setIsLoggedIn(false)}
            className="w-12 py-3 rounded-lg flex flex-col items-center justify-center text-[8px] font-bold text-[var(--text-muted)] hover:text-red-400 transition-colors"
          >
            <IconExit />
            <span className="mt-1">Exit</span>
          </button>
        </div>
      </aside>

      {/* 2. Main Content Grid Cockpit Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* Top Header bar */}
        <header className="h-14 border-b border-[var(--border-panel)] bg-[var(--bg-panel)] flex items-center justify-between px-6 z-10">
          <h1 className="text-sm font-semibold tracking-wide theme-text-primary">Industrial Digital Twin Command Center</h1>
          
          {/* User Profile Info Badge (Keycloak SSO Eng Session) */}
          <div className="flex items-center gap-2.5 bg-[var(--bg-card-dark)] border border-[var(--border-panel)] py-1.5 px-3 rounded-lg shadow-sm">
            {/* Outline User Avatar Icon */}
            <div className="w-6 h-6 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            
            <div className="text-left font-mono leading-none">
              <div className="text-[10px] font-bold theme-text-primary">admin_eng</div>
              <span className="text-[8px] text-cyan-400 font-bold uppercase tracking-wider mt-0.5 inline-block">Keycloak Session</span>
            </div>
          </div>
        </header>

        {/* Dashboard Panels Grid Container */}
        <div className="flex-1 p-4 overflow-y-auto flex flex-col space-y-4">
          
          {/* Top Metrics Row */}
          <div className="grid grid-cols-6 gap-3">
            <div className="dashboard-panel flex items-center gap-4 py-2">
              <div className="relative w-12 h-12 flex items-center justify-center">
                <svg className="w-12 h-12">
                  <circle cx="24" cy="24" r="20" fill="transparent" stroke="var(--border-panel)" strokeWidth="4" />
                  <circle 
                    cx="24" cy="24" r="20" fill="transparent" stroke="#00e676" strokeWidth="4" 
                    strokeDasharray="125" strokeDashoffset="20" className="progress-ring-circle"
                  />
                </svg>
                <span className="absolute text-[11px] font-mono font-bold theme-text-primary">84%</span>
              </div>
              <div>
                <p className="text-[10px] theme-text-muted uppercase font-bold tracking-wide">OEE (Water Station)</p>
                <span className="text-[9px] theme-text-muted opacity-80">Target: 90%</span>
              </div>
            </div>

            <div className="dashboard-panel flex flex-col justify-between py-2">
              <p className="text-[10px] theme-text-muted uppercase font-bold tracking-wide">Availability</p>
              <div className="flex items-baseline justify-between mt-1">
                <p className="text-xl font-bold theme-text-primary font-mono">91%</p>
                <span className="text-[9px] text-emerald-500 font-semibold">● Nominal</span>
              </div>
            </div>

            <div className="dashboard-panel flex flex-col justify-between py-2">
              <p className="text-[10px] theme-text-muted uppercase font-bold tracking-wide">Performance</p>
              <div className="flex items-baseline justify-between mt-1">
                <p className="text-xl font-bold theme-text-primary font-mono">93%</p>
                <span className="text-[9px] text-emerald-500 font-semibold">● Stable</span>
              </div>
            </div>

            <div className="dashboard-panel flex flex-col justify-between py-2">
              <p className="text-[10px] theme-text-muted uppercase font-bold tracking-wide">Quality</p>
              <div className="flex items-baseline justify-between mt-1">
                <p className="text-xl font-bold theme-text-primary font-mono">99.2%</p>
                <span className="text-[9px] text-emerald-500 font-semibold">● Excellent</span>
              </div>
            </div>

            <div className="dashboard-panel flex flex-col justify-between py-2">
              <p className="text-[10px] theme-text-muted uppercase font-bold tracking-wide">Current Flow Rate</p>
              <div className="flex items-baseline justify-between mt-1">
                <p className="text-xl font-bold text-[#00f0ff] font-mono">2100 <span className="text-xs">L/min</span></p>
                <span className="text-[9px] text-emerald-500 font-semibold">↗</span>
              </div>
            </div>

            <div className="dashboard-panel bg-[#ffd600]/10 border border-[#ffd600]/30 flex flex-col justify-between py-2">
              <p className="text-[10px] text-[#ffd600] uppercase font-bold tracking-wide">Active Alerts</p>
              <div className="flex items-baseline justify-between mt-1">
                <p className="text-xl font-bold text-[#ffd600] font-mono">2</p>
                <span className="text-[9px] text-[#ffd600] font-semibold animate-pulse">⚠️ Warning</span>
              </div>
            </div>
          </div>

          {/* Lower Workspace Layout Grid */}
          <div className="flex-1 grid grid-cols-12 gap-3 min-h-0">
            
            {/* Left Column: AAS Tree & View Controls Separated */}
            <div className="col-span-3 flex flex-col gap-3 min-h-0">
              <div 
                onDoubleClick={() => setExpandedPanel("aas")}
                title="Double click to expand hierarchy"
                className="flex-1 min-h-0 cursor-zoom-in"
              >
                <AasAssetTree />
              </div>
              <div className="h-32 min-h-0">
                <ViewControls />
              </div>
            </div>

            {/* Center Column: 3D Visualization */}
            <div className="col-span-6 dashboard-panel flex flex-col min-h-0 relative p-0 overflow-hidden">
              <div className="flex-1 bg-black/40 rounded overflow-hidden relative">
                <VisualizerCanvas />
              </div>
            </div>

            {/* Right Column: Knowledge Graph, Telemetry Trend & Downtime analysis separated */}
            <div className="col-span-3 flex flex-col gap-3 min-h-0 overflow-y-auto pr-1">
              <div 
                onDoubleClick={() => setExpandedPanel("graph")}
                className="cursor-zoom-in shrink-0"
                title="Double click to expand Knowledge Graph"
              >
                <KnowledgeGraphOverlay />
              </div>

              <div 
                onDoubleClick={() => setExpandedPanel("trend")}
                className="cursor-zoom-in shrink-0"
                title="Double click to expand Production Trend"
              >
                <ProductionTrend />
              </div>

              <div 
                onDoubleClick={() => setExpandedPanel("downtime")}
                className="cursor-zoom-in shrink-0"
                title="Double click to expand Downtime Analysis"
              >
                <DowntimeAnalysis />
              </div>
            </div>

          </div>

        </div>

        {/* 4. Fullscreen Zoom Popups Modal (Expanded Separately) */}
        {expandedPanel && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-8">
            <div className={`w-full bg-[var(--bg-panel)] border border-[var(--border-panel)] rounded-xl flex flex-col p-6 relative transition-all ${
              expandedPanel === "3d" ? "max-w-[96vw] h-[92vh]" : "max-w-4xl h-[85vh]"
            }`}>
              <button 
                onClick={() => setExpandedPanel(null)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center theme-text-primary text-xs font-bold"
              >
                ✕
              </button>

              <div className="flex-1 min-h-0 pt-4">
                {expandedPanel === "aas" && (
                  <div className="h-full overflow-y-auto">
                    <AasAssetTree />
                  </div>
                )}
                {expandedPanel === "trend" && (
                  <div className="h-full overflow-y-auto">
                    <ProductionTrend />
                  </div>
                )}
                {expandedPanel === "downtime" && (
                  <div className="h-full overflow-y-auto">
                    <DowntimeAnalysis />
                  </div>
                )}
                {expandedPanel === "graph" && (
                  <div className="h-full w-full">
                    <KnowledgeGraphOverlay />
                  </div>
                )}
                {expandedPanel === "3d" && (
                  <div className="h-full relative bg-black/40 rounded overflow-hidden">
                    <VisualizerCanvas />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}

export default function Home() {
  return (
    <DigitalTwinProvider>
      <DashboardContent />
    </DigitalTwinProvider>
  );
}
