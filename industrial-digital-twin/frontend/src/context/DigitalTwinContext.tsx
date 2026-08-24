"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { SimStatus } from "../types/simulation";

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

export interface BBox {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: number;
  tag?: string;
  manufacturer?: string;
  model?: string;
  maxPressure?: number;
  maxTemperature?: number;
  installationDate?: string;
  customProperties?: Record<string, any>;
}

export interface LineSegment {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface EdgeItem {
  source: string;
  target: string;
  label: string;
}

interface DigitalTwinContextProps {
  selectedAsset: AssetNode;
  setSelectedAsset: (asset: AssetNode) => void;
  activeTab: "3d" | "2d" | "simulation" | "graph" | "extraction";
  setActiveTab: (tab: "3d" | "2d" | "simulation" | "graph" | "extraction") => void;
  telemetry: { temp: number; press: number; flow: number };
  alerts: string[];
  isLoggedIn: boolean;
  setIsLoggedIn: (status: boolean) => void;
  expandedPanel: "aas" | "trend" | "downtime" | "graph" | "3d" | null;
  setExpandedPanel: (panel: "aas" | "trend" | "downtime" | "graph" | "3d" | null) => void;

  // Extraction Workspace state
  fileUploaded: boolean;
  setFileUploaded: (val: boolean) => void;
  isExtracting: boolean;
  setIsExtracting: (val: boolean) => void;
  bboxes: BBox[];
  setBboxes: React.Dispatch<React.SetStateAction<BBox[]>>;
  progress: { percent: number; status: string };
  setProgress: (val: { percent: number; status: string }) => void;
  lines: LineSegment[];
  setLines: React.Dispatch<React.SetStateAction<LineSegment[]>>;
  selectedBox: BBox | null;
  setSelectedBox: (box: BBox | null) => void;
  editLabel: string;
  setEditLabel: (label: string) => void;
  editTag: string;
  setEditTag: (tag: string) => void;
  selectedLine: LineSegment | null;
  setSelectedLine: (line: LineSegment | null) => void;
  currentLine: { startX: number; startY: number; endX: number; endY: number } | null;
  setCurrentLine: (line: { startX: number; startY: number; endX: number; endY: number } | null) => void;
  imageSrc: string | null;
  setImageSrc: (src: string | null) => void;
  hoveredBoxId: string | null;
  setHoveredBoxId: (id: string | null) => void;
  workspaceView: "image" | "topology";
  setWorkspaceView: (view: "image" | "topology") => void;
  graphData: { nodes: any[]; edges: any[] } | null;
  setGraphData: (data: { nodes: any[]; edges: any[] } | null) => void;
  graphPositions: Record<string, { x: number; y: number }>;
  setGraphPositions: React.Dispatch<React.SetStateAction<Record<string, { x: number; y: number }>>>;
  draggingNodeId: string | null;
  setDraggingNodeId: (id: string | null) => void;
  gZoom: number;
  setGZoom: (zoom: number) => void;
  gPan: { x: number; y: number };
  setGPan: (pan: { x: number; y: number }) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  pan: { x: number; y: number };
  setPan: (pan: { x: number; y: number }) => void;

  // Uploaded 3D model
  uploadedModel: any;
  setUploadedModel: (model: any) => void;
  uploadedModelName: string | null;
  setUploadedModelName: (name: string | null) => void;

  // Camera controls
  cameraAction: { type: string; timestamp: number } | null;
  triggerCameraAction: (type: string) => void;

  // Unified Simulation Status
  simStatus: SimStatus | null;
}

const DigitalTwinContext = createContext<DigitalTwinContextProps | undefined>(undefined);

export function DigitalTwinProvider({ children }: { children: React.ReactNode }) {
  const [selectedAsset, setSelectedAsset] = useState<AssetNode>(AAS_PLANT_NODES[0]);
  const [activeTab, setActiveTab] = useState<"3d" | "2d" | "simulation" | "graph" | "extraction">("3d");
  const [telemetry, setTelemetry] = useState({ temp: 42.5, press: 4.2, flow: 120.0 });
  const [alerts, setAlerts] = useState<string[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState<"aas" | "trend" | "downtime" | "graph" | "3d" | null>(null);

  // Extraction Workspace state states
  const [fileUploaded, setFileUploaded] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [bboxes, setBboxes] = useState<BBox[]>([]);
  const [progress, setProgress] = useState({ percent: 0, status: "Initializing extraction..." });
  const [lines, setLines] = useState<LineSegment[]>([]);
  const [selectedBox, setSelectedBox] = useState<BBox | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editTag, setEditTag] = useState("");
  const [selectedLine, setSelectedLine] = useState<LineSegment | null>(null);
  const [currentLine, setCurrentLine] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [hoveredBoxId, setHoveredBoxId] = useState<string | null>(null);
  const [workspaceView, setWorkspaceView] = useState<"image" | "topology">("image");
  const [graphData, setGraphData] = useState<{ nodes: any[]; edges: any[] } | null>(null);
  const [graphPositions, setGraphPositions] = useState<Record<string, { x: number; y: number }>>({}); 
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [gZoom, setGZoom] = useState(1);
  const [gPan, setGPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Uploaded 3D model states
  const [uploadedModel, setUploadedModel] = useState<any>(null);
  const [uploadedModelName, setUploadedModelName] = useState<string | null>(null);





  // Camera action controls
  const [cameraAction, setCameraAction] = useState<{ type: string; timestamp: number } | null>(null);
  const triggerCameraAction = (type: string) => {
    setCameraAction({ type, timestamp: Date.now() });
  };

  // Unified simulation status state
  const [simStatus, setSimStatus] = useState<SimStatus | null>(null);

  // Poll backend simulation status every 1 second
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("http://localhost:8000/api/simulation/status");
        if (res.ok) {
          const data: SimStatus = await res.json();
          setSimStatus(data);
          setTelemetry({
            temp: data.lit001_pct,
            press: data.pit001_pressure,
            flow: data.fit001_flow * 10, // Scale by 10 to match VisualizerCanvas logic
          });
        }
      } catch (err) {
        console.error("DigitalTwinContext: Fetch simulation error:", err);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 1000);
    return () => clearInterval(interval);
  }, []);

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
      fileUploaded,
      setFileUploaded,
      isExtracting,
      setIsExtracting,
      bboxes,
      setBboxes,
      progress,
      setProgress,
      lines,
      setLines,
      selectedBox,
      setSelectedBox,
      editLabel,
      setEditLabel,
      editTag,
      setEditTag,
      selectedLine,
      setSelectedLine,
      currentLine,
      setCurrentLine,
      imageSrc,
      setImageSrc,
      hoveredBoxId,
      setHoveredBoxId,
      workspaceView,
      setWorkspaceView,
      graphData,
      setGraphData,
      graphPositions,
      setGraphPositions,
      draggingNodeId,
      setDraggingNodeId,
      gZoom,
      setGZoom,
      gPan,
      setGPan,
      zoom,
      setZoom,
      pan,
      setPan,
      uploadedModel,
      setUploadedModel,
      uploadedModelName,
      setUploadedModelName,
      cameraAction,
      triggerCameraAction,
      simStatus,
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

