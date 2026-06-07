"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export interface AssetNode {
  id: string;
  name: string;
  type: string;
  status: string;
  tag: string;
  manufacturer: string;
  maxTemp: string;
  maxPress: string;
}

export const AAS_PLANT_NODES: AssetNode[] = [
  { id: "urn:jesa:P01:Intake:Pump:PMP001", name: "Intake Pump PMP-001", type: "Pump", status: "success", tag: "PMP-001", manufacturer: "KSB", maxTemp: "85°C", maxPress: "16 bar" },
  { id: "urn:jesa:P01:Intake:PIT001", name: "Pressure Transmitter PIT-001", type: "Transmitter", status: "success", tag: "PIT-001", manufacturer: "Rosemount", maxTemp: "120°C", maxPress: "50 psi" },
  { id: "urn:jesa:P01:Storage:Tank:TK001", name: "Process Tank TK-001", type: "Tank", status: "warning", tag: "TK-001", manufacturer: "CST Industries", maxTemp: "90°C", maxPress: "Atmospheric" },
  { id: "urn:jesa:P01:Discharge:Valve:V001", name: "Control Valve V-001", type: "Valve", status: "success", tag: "V-001", manufacturer: "Fisher", maxTemp: "150°C", maxPress: "25 bar" },
  { id: "urn:jesa:P01:Discharge:Pump:PMP002", name: "Discharge Pump PMP-002", type: "Pump", status: "success", tag: "PMP-002", manufacturer: "Grundfos", maxTemp: "75°C", maxPress: "10 bar" },
  { id: "urn:jesa:P01:Discharge:FIT001", name: "Flow Transmitter FIT-001", type: "Transmitter", status: "success", tag: "FIT-001", manufacturer: "Endress+Hauser", maxTemp: "100°C", maxPress: "10 bar" },
];

interface DigitalTwinContextProps {
  selectedAsset: AssetNode;
  setSelectedAsset: (asset: AssetNode) => void;
  activeTab: "3d" | "2d" | "graph" | "extraction";
  setActiveTab: (tab: "3d" | "2d" | "graph" | "extraction") => void;
  telemetry: { temp: number; press: number; flow: number };
  alerts: string[];
  isLoggedIn: boolean;
  setIsLoggedIn: (status: boolean) => void;
  expandedPanel: "aas" | "trend" | "downtime" | "graph" | "3d" | null;
  setExpandedPanel: (panel: "aas" | "trend" | "downtime" | "graph" | "3d" | null) => void;
}

const DigitalTwinContext = createContext<DigitalTwinContextProps | undefined>(undefined);

export function DigitalTwinProvider({ children }: { children: React.ReactNode }) {
  const [selectedAsset, setSelectedAsset] = useState<AssetNode>(AAS_PLANT_NODES[0]);
  const [activeTab, setActiveTab] = useState<"3d" | "2d" | "graph" | "extraction">("3d");
  const [telemetry, setTelemetry] = useState({ temp: 42.5, press: 4.2, flow: 120.0 });
  const [alerts, setAlerts] = useState<string[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState<"aas" | "trend" | "downtime" | "graph" | "3d" | null>(null);

  // Live Telemetry simulation (simulating InfluxDB MQTT data flow)
  useEffect(() => {
    if (!isLoggedIn) return;
    const interval = setInterval(() => {
      setTelemetry((prev) => {
        const isWarning = selectedAsset.tag === "TK-001";
        const tempVar = (Math.random() - 0.5) * 1.5;
        const pressVar = (Math.random() - 0.5) * 0.4;
        
        let newTemp = prev.temp + tempVar;
        let newPress = prev.press + pressVar;

        if (isWarning) {
          newTemp = Math.min(85, Math.max(74, newTemp));
          newPress = Math.min(11, Math.max(8.5, newPress));
        } else {
          newTemp = Math.min(50, Math.max(38, newTemp));
          newPress = Math.min(5.5, Math.max(3.5, newPress));
        }

        return {
          temp: parseFloat(newTemp.toFixed(1)),
          press: parseFloat(newPress.toFixed(2)),
          flow: parseFloat((110 + Math.random() * 20).toFixed(1)),
        };
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [isLoggedIn, selectedAsset]);

  // Alert check rules
  useEffect(() => {
    const list: string[] = [];
    if (selectedAsset.tag === "TK-001" && telemetry.temp > 76) {
      list.push("High Temperature Warning on Process Tank TK-001");
    }
    setAlerts(list);
  }, [telemetry, selectedAsset]);

  return (
    <DigitalTwinContext.Provider value={{
      selectedAsset,
      setSelectedAsset,
      activeTab,
      setActiveTab,
      telemetry,
      alerts,
      isLoggedIn,
      setIsLoggedIn,
      expandedPanel,
      setExpandedPanel,
    }}>
      {children}
    </DigitalTwinContext.Provider>
  );
}

export function useDigitalTwin() {
  const context = useContext(DigitalTwinContext);
  if (!context) {
    throw new Error("useDigitalTwin must be used within a DigitalTwinProvider");
  }
  return context;
}
