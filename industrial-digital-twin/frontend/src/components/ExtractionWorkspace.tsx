"use client";

import React, { useState, useRef, MouseEvent, useEffect } from "react";
import { useDigitalTwin } from "../context/DigitalTwinContext";

interface EdgeItem {
  source: string;
  target: string;
  label: string;
}

const getNodeColors = (type: string) => {
  const lower = type.toLowerCase();
  if (lower === "sensor") return { bg: "#F25A7A", border: "#D93B5B" }; // Pink/Red
  if (lower === "valve") return { bg: "#57C7E3", border: "#35A3BE" }; // Cyan/Teal
  if (lower === "pump") return { bg: "#C990C0", border: "#A36D9A" }; // Purple
  if (lower === "tank") return { bg: "#F79767", border: "#D67A4B" }; // Orange
  if (lower === "filter") return { bg: "#FFC454", border: "#E0A83A" }; // Yellow/Beige
  if (lower === "heatexchanger") return { bg: "#D93B5B", border: "#B52643" }; // Red/Burgundy
  if (lower === "mixer") return { bg: "#50B47B", border: "#3B9260" }; // Green
  return { bg: "#A5ABB6", border: "#838994" }; // default Gray
};

interface BBox {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  confidence: number;
  tag?: string;
}

export interface LineSegment {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

const PUMP_SCHEMA = [
  "Nominal Motor Power (kW)",
  "Nominal Motor Current (A)",
  "Nominal Motor Voltage (V)",
  "Maximum Motor Speed (tr/min)",
  "Pump Max Flow (l/s)"
];

const SOLENOID_VALVE_SCHEMA = [
  "Voltage range",
  "Modulating control",
  "Operating time",
  "Maximum break torque",
  "Maximum operating torque",
  "IP Rating",
  "Working angle",
  "Motor switches",
  "End of travel confirmation",
  "Heater",
  "Ambient temperature range",
  "Electrical connecting plugs",
  "Weight"
];

const getDynamicSchema = (label: string) => {
  const l = label.toLowerCase();
  if (l.includes("pump")) return PUMP_SCHEMA;
  if (l.includes("valve") || l.includes("solenoid")) return SOLENOID_VALVE_SCHEMA;
  return ["Manufacturer", "Installation Date"];
};

export default function ExtractionWorkspace() {
  // All persistent extraction state lives in the global context so it survives
  // tab switches, panel expand/minimize, and component unmounts.
  const {
    fileUploaded, setFileUploaded,
    isExtracting, setIsExtracting,
    bboxes, setBboxes,
    progress, setProgress,
    lines, setLines,
    selectedBox, setSelectedBox,
    editLabel, setEditLabel,
    editTag, setEditTag,
    selectedLine, setSelectedLine,
    currentLine, setCurrentLine,
    imageSrc, setImageSrc,
    hoveredBoxId, setHoveredBoxId,
    workspaceView, setWorkspaceView,
    graphData, setGraphData,
    graphPositions, setGraphPositions,
    draggingNodeId, setDraggingNodeId,
    gZoom, setGZoom,
    gPan, setGPan,
    zoom, setZoom,
    pan, setPan,
  } = useDigitalTwin();

  // Purely local transient UI states (don't need to persist across mounts)
  const [graphHeight, setGraphHeight] = useState(300);
  const [graphWidth, setGraphWidth] = useState(800);
  const graphSvgRef = useRef<SVGSVGElement>(null);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [gIsPanning, setGIsPanning] = useState(false);
  const [gPanStart, setGPanStart] = useState({ x: 0, y: 0 });

  // States for manual drawing
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentBox, setCurrentBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Zoom & Pan transient states
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [interactionMode, setInteractionMode] = useState<"draw" | "pan" | "line">("draw");

  // Dynamic Properties states
  const [editCustomProps, setEditCustomProps] = useState<Record<string, string>>({});
  const [isParsingDatasheet, setIsParsingDatasheet] = useState(false);
  const datasheetInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedBox) {
      setEditCustomProps(selectedBox.customProperties || {});
    } else {
      setEditCustomProps({});
    }
  }, [selectedBox]);

  // Publishing transient states
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);

  const handlePublishAAS = async () => {
    setIsPublishing(true);
    try {
      const payload = bboxes.map(b => ({ sid: b.tag || b.label, props: b.customProperties || {} })).filter(b => b.sid);
      await fetch("http://localhost:8000/api/aas/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload })
      });
      setIsPublishing(false);
      setPublishSuccess(true);
      setTimeout(() => setPublishSuccess(false), 5000);
    } catch (err) {
      console.error(err);
      setIsPublishing(false);
    }
  };
  const processFile = async (file: File) => {
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
    } else {
      setImageSrc(null);
    }

    setIsExtracting(true);
    setProgress({ percent: 0, status: "Uploading drawing to pipeline..." });

    // Start progress polling interval — only ever allow progress to move forward
    const highWaterMark = { current: 0 };
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch("http://localhost:8000/api/extract/progress");
        if (res.ok) {
          const progressData = await res.json();
          // Only update if the new percent is >= what we've already shown
          if (progressData.percent >= highWaterMark.current) {
            highWaterMark.current = progressData.percent;
            setProgress(progressData);
          }
        }
      } catch (err) {
        console.error("Progress polling error:", err);
      }
    }, 800);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("http://localhost:8000/api/extract", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to process P&ID layout.");
      }

      const data = await response.json();
      setBboxes(data.bboxes || []);
      setLines(data.lines || []);
      setFileUploaded(true);

      // Force-fetch updated topology graph connections immediately on success
      try {
        const topoRes = await fetch("http://localhost:8000/api/graph/topology");
        if (topoRes.ok) {
          const topology = await topoRes.json();
          setGraphData(topology);
        }
      } catch (topoErr) {
        console.error("Failed to fetch topology graph:", topoErr);
      }
    } catch (err) {
      console.error(err);
      alert("Error: " + (err as Error).message);
    } finally {
      clearInterval(pollInterval);
      setIsExtracting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const [naturalSize, setNaturalSize] = useState({ w: 1, h: 1 });
  const [containerSize, setContainerSize] = useState({ w: 1, h: 1 });

  const iW = naturalSize.w;
  const iH = naturalSize.h;
  const cW = containerSize.w;
  const cH = containerSize.h;

  const r_c = cW / cH;
  const r_i = iW / iH;

  let renderW = cW;
  let renderH = cH;
  let offsetX = 0;
  let offsetY = 0;

  if (imageSrc) {
    if (r_i > r_c) {
      renderW = cW;
      renderH = cW / r_i;
      offsetX = 0;
      offsetY = (cH - renderH) / 2;
    } else {
      renderH = cH;
      renderW = cH * r_i;
      offsetX = (cW - renderW) / 2;
      offsetY = 0;
    }
  }

  React.useEffect(() => {
    if (!imageSrc) return;
    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
  }, [imageSrc]);

  React.useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    
    // Measure immediately on mount
    setContainerSize({
      w: canvasEl.clientWidth,
      h: canvasEl.clientHeight
    });

    const resizeObserver = new ResizeObserver(() => {
      setContainerSize({
        w: canvasEl.clientWidth,
        h: canvasEl.clientHeight
      });
    });
    
    resizeObserver.observe(canvasEl);
    return () => {
      resizeObserver.disconnect();
    };
  }, [fileUploaded, imageSrc, isExtracting, workspaceView]);

  React.useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const handleWheelEvent = (e: WheelEvent) => {
      if (!fileUploaded) return;
      e.preventDefault();

      const zoomFactor = 1.1;
      let nextZoom = zoom;
      if (e.deltaY < 0) {
        nextZoom = Math.min(zoom * zoomFactor, 5);
      } else {
        nextZoom = Math.max(zoom / zoomFactor, 0.5);
      }

      if (nextZoom === zoom) return;

      const rect = canvasEl.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const nextPanX = mouseX - (mouseX - pan.x) * (nextZoom / zoom);
      const nextPanY = mouseY - (mouseY - pan.y) * (nextZoom / zoom);

      setZoom(nextZoom);
      setPan({ x: nextPanX, y: nextPanY });
    };

    canvasEl.addEventListener("wheel", handleWheelEvent, { passive: false });
    return () => {
      canvasEl.removeEventListener("wheel", handleWheelEvent);
    };
  }, [fileUploaded, zoom, pan]);

  const getRenderedCoords = (box: BBox) => {
    return {
      left: `${box.x * 100}%`,
      top: `${box.y * 100}%`,
      width: `${box.w * 100}%`,
      height: `${box.h * 100}%`,
    };
  };

  const getRenderedLineCoords = (line: LineSegment) => {
    return {
      x1: line.startX * renderW,
      y1: line.startY * renderH,
      x2: line.endX * renderW,
      y2: line.endY * renderH,
    };
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  // Drawing Bounding Boxes Handlers
  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!fileUploaded) return;

    if (interactionMode === "pan") {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    // Do not start drawing if clicked on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest(".bbox-element") || target.closest("button") || target.closest(".no-draw")) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Calculate coordinates relative to canvasRef (outer container), corrected for pan, zoom and offsets
    const clientXRel = e.clientX - rect.left;
    const clientYRel = e.clientY - rect.top;
    
    const x = (clientXRel - offsetX - pan.x) / zoom;
    const y = (clientYRel - offsetY - pan.y) / zoom;

    if (interactionMode === "line") {
      setStartPos({ x, y });
      setIsDrawing(true);
      setCurrentLine({ startX: x, startY: y, endX: x, endY: y });
      return;
    }
    
    setStartPos({ x, y });
    setIsDrawing(true);
    setCurrentBox({ x, y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (interactionMode === "pan" && isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
      return;
    }

    if (interactionMode === "line") {
      if (!isDrawing || !currentLine || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const clientXRel = e.clientX - rect.left;
      const clientYRel = e.clientY - rect.top;
      
      const currentX = (clientXRel - offsetX - pan.x) / zoom;
      const currentY = (clientYRel - offsetY - pan.y) / zoom;

      setCurrentLine({
        startX: startPos.x,
        startY: startPos.y,
        endX: currentX,
        endY: currentY
      });
      return;
    }

    if (!isDrawing || !currentBox || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    
    const clientXRel = e.clientX - rect.left;
    const clientYRel = e.clientY - rect.top;
    
    const currentX = (clientXRel - offsetX - pan.x) / zoom;
    const currentY = (clientYRel - offsetY - pan.y) / zoom;

    const x = Math.min(startPos.x, currentX);
    const y = Math.min(startPos.y, currentY);
    const w = Math.abs(startPos.x - currentX);
    const h = Math.abs(startPos.y - currentY);

    setCurrentBox({ x, y, w, h });
  };

  const handleMouseUp = () => {
    if (interactionMode === "pan") {
      setIsPanning(false);
      return;
    }

    if (interactionMode === "line") {
      if (!isDrawing || !currentLine) return;
      setIsDrawing(false);
      
      const dx = currentLine.endX - currentLine.startX;
      const dy = currentLine.endY - currentLine.startY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 5) {
        const newLine: LineSegment = {
          id: `line-user-${Date.now()}`,
          startX: currentLine.startX / renderW,
          startY: currentLine.startY / renderH,
          endX: currentLine.endX / renderW,
          endY: currentLine.endY / renderH
        };
        setLines((prev) => [...prev, newLine]);
        setSelectedLine(newLine);
        setSelectedBox(null);
      }
      setCurrentLine(null);
      return;
    }

    if (!isDrawing || !currentBox) return;
    setIsDrawing(false);

    // Only add if it's a valid size box
    if (currentBox.w > 10 && currentBox.h > 10) {
      const normX = currentBox.x / renderW;
      const normY = currentBox.y / renderH;
      const normW = currentBox.w / renderW;
      const normH = currentBox.h / renderH;

      const newBox: BBox = {
        id: `box-user-${Date.now()}`,
        label: "New Asset Tag",
        x: normX,
        y: normY,
        w: normW,
        h: normH,
        confidence: 100.0, // User-defined is 100% confidence
      };
      setBboxes((prev) => [...prev, newBox]);
      setSelectedBox(newBox);
      setSelectedLine(null);
      setEditLabel("New Asset Tag");
      setEditTag("");
    }
    setCurrentBox(null);
  };

  // Update Tag attributes
  const handleSaveLabel = () => {
    if (!selectedBox) return;
    setBboxes((prev) =>
      prev.map((box) => (box.id === selectedBox.id ? { ...box, label: editLabel, tag: editTag, customProperties: editCustomProps } : box))
    );
    setSelectedBox(selectedBox ? { ...selectedBox, label: editLabel, tag: editTag, customProperties: editCustomProps } : null);
  };

  // Remove Bounding Box
  const handleDeleteBox = (id: string) => {
    setBboxes((prev) => prev.filter((box) => box.id !== id));
    setSelectedBox(null);
  };

  // Fetch and layout Neo4j graph inside workspace
  useEffect(() => {
    if (workspaceView !== "topology") return;
    
    fetch("http://localhost:8000/api/graph/topology")
      .then(res => res.json())
      .then(topology => {
        setGraphData(topology);
        
        const nodeCount = topology.nodes.length;
        if (nodeCount === 0) return;

        // Build adjacency map for force simulation
        const adjMap: Record<string, Set<string>> = {};
        topology.nodes.forEach((n: any) => { adjMap[n.id] = new Set(); });
        topology.edges.forEach((e: any) => {
          if (adjMap[e.source]) adjMap[e.source].add(e.target);
          if (adjMap[e.target]) adjMap[e.target].add(e.source);
        });

        // Initial grid layout — spread nodes across rows and columns
        const cols = Math.max(1, Math.ceil(Math.sqrt(nodeCount * 1.5)));
        const rows = Math.ceil(nodeCount / cols);
        const spacingX = 100;
        const spacingY = 80;
        const layoutW = cols * spacingX;
        const layoutH = rows * spacingY;
        setGraphWidth(layoutW);
        setGraphHeight(layoutH);

        const positions: Record<string, { x: number; y: number }> = {};
        topology.nodes.forEach((node: any, i: number) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          positions[node.id] = {
            x: 60 + col * spacingX,
            y: 60 + row * spacingY
          };
        });

        // Simple force-directed simulation (runs synchronously, ~50 iterations)
        const nodeIds = topology.nodes.map((n: any) => n.id);
        for (let iter = 0; iter < 50; iter++) {
          const forces: Record<string, { fx: number; fy: number }> = {};
          nodeIds.forEach((id: string) => { forces[id] = { fx: 0, fy: 0 }; });

          // Repulsion between all nodes
          for (let i = 0; i < nodeIds.length; i++) {
            for (let j = i + 1; j < nodeIds.length; j++) {
              const a = positions[nodeIds[i]];
              const b = positions[nodeIds[j]];
              let dx = b.x - a.x;
              let dy = b.y - a.y;
              let dist = Math.sqrt(dx * dx + dy * dy) || 1;
              if (dist < 200) {
                const repulse = 800 / (dist * dist);
                const fx = (dx / dist) * repulse;
                const fy = (dy / dist) * repulse;
                forces[nodeIds[i]].fx -= fx;
                forces[nodeIds[i]].fy -= fy;
                forces[nodeIds[j]].fx += fx;
                forces[nodeIds[j]].fy += fy;
              }
            }
          }

          // Attraction along edges
          topology.edges.forEach((e: any) => {
            const a = positions[e.source];
            const b = positions[e.target];
            if (!a || !b) return;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const attract = (dist - 80) * 0.02;
            const fx = (dx / dist) * attract;
            const fy = (dy / dist) * attract;
            forces[e.source].fx += fx;
            forces[e.source].fy += fy;
            forces[e.target].fx -= fx;
            forces[e.target].fy -= fy;
          });

          // Apply forces
          const damping = 0.3;
          nodeIds.forEach((id: string) => {
            positions[id] = {
              x: positions[id].x + forces[id].fx * damping,
              y: positions[id].y + forces[id].fy * damping
            };
          });
        }

        setGraphPositions({ ...positions });
      })
      .catch(err => {
        console.error("Error loading Neo4j topology graph inside workspace:", err);
      });
  }, [workspaceView]);

  const handleGraphNodeMouseDown = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDraggingNodeId(nodeId);
    
    // Select the node or matching box
    const node = graphData?.nodes.find(n => n.id === nodeId);
    if (node) {
      const match = bboxes.find(b => b.tag === node.id || b.id === node.id || b.label.includes(node.id) || node.id.includes(b.tag || ""));
      if (match) {
        setSelectedBox(match);
        setSelectedLine(null);
        setEditLabel(match.label);
        setEditTag(match.tag || "");
      }
    }
  };

  // Convert screen coords to graph coords (accounting for zoom/pan)
  const screenToGraph = (clientX: number, clientY: number) => {
    if (!graphSvgRef.current) return { x: 0, y: 0 };
    const rect = graphSvgRef.current.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: (sx - gPan.x) / gZoom,
      y: (sy - gPan.y) / gZoom
    };
  };

  const handleGraphMouseDown = (e: React.MouseEvent) => {
    // If not clicking on a node, start panning
    if (!draggingNodeId) {
      setGIsPanning(true);
      setGPanStart({ x: e.clientX - gPan.x, y: e.clientY - gPan.y });
    }
  };

  const handleGraphMouseMove = (e: React.MouseEvent) => {
    if (draggingNodeId && graphSvgRef.current) {
      const gCoords = screenToGraph(e.clientX, e.clientY);
      setGraphPositions(prev => ({
        ...prev,
        [draggingNodeId]: { x: gCoords.x, y: gCoords.y }
      }));
      return;
    }
    if (gIsPanning) {
      setGPan({
        x: e.clientX - gPanStart.x,
        y: e.clientY - gPanStart.y
      });
    }
  };

  const handleGraphMouseUp = () => {
    setDraggingNodeId(null);
    setGIsPanning(false);
  };

  // Graph wheel zoom
  React.useEffect(() => {
    const container = graphContainerRef.current;
    if (!container || workspaceView !== "topology") return;
    
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = 1.1;
      let nextZoom = gZoom;
      if (e.deltaY < 0) {
        nextZoom = Math.min(gZoom * factor, 8);
      } else {
        nextZoom = Math.max(gZoom / factor, 0.15);
      }
      // Zoom towards mouse
      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setGPan({
        x: mx - (mx - gPan.x) * (nextZoom / gZoom),
        y: my - (my - gPan.y) * (nextZoom / gZoom)
      });
      setGZoom(nextZoom);
    };
    
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [workspaceView, gZoom, gPan]);

  const resetGraphView = () => {
    setGZoom(1);
    setGPan({ x: 0, y: 0 });
  };

  const fitGraphToView = () => {
    if (!graphData || !graphContainerRef.current) return;
    const positions = Object.values(graphPositions);
    if (positions.length === 0) return;
    const xs = positions.map(p => p.x);
    const ys = positions.map(p => p.y);
    const minX = Math.min(...xs) - 40;
    const maxX = Math.max(...xs) + 40;
    const minY = Math.min(...ys) - 40;
    const maxY = Math.max(...ys) + 40;
    const rect = graphContainerRef.current.getBoundingClientRect();
    const scaleX = rect.width / (maxX - minX);
    const scaleY = rect.height / (maxY - minY);
    const newZoom = Math.min(scaleX, scaleY, 2);
    setGZoom(newZoom);
    setGPan({
      x: (rect.width - (maxX + minX) * newZoom) / 2,
      y: (rect.height - (maxY + minY) * newZoom) / 2
    });
  };

  const renderGraphEdge = (edge: EdgeItem, idx: number) => {
    const srcPos = graphPositions[edge.source];
    const tgtPos = graphPositions[edge.target];

    if (!srcPos || !tgtPos) return null;

    const dx = tgtPos.x - srcPos.x;
    const dy = tgtPos.y - srcPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) return null;

    const nodeRadius = 20;
    const padX1 = (dx / dist) * nodeRadius; 
    const padY1 = (dy / dist) * nodeRadius;
    const padX2 = (dx / dist) * (nodeRadius + 6); // clearance for arrow head
    const padY2 = (dy / dist) * (nodeRadius + 6);

    const x1 = srcPos.x + padX1;
    const y1 = srcPos.y + padY1;
    const x2 = tgtPos.x - padX2;
    const y2 = tgtPos.y - padY2;

    const angle = Math.atan2(dy, dx);
    const cx = (x1 + x2) / 2 + Math.sin(angle) * 16;
    const cy = (y1 + y2) / 2 - Math.cos(angle) * 16;

    return (
      <g key={`graph-edge-${idx}`}>
        <path
          d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
          fill="none"
          stroke="var(--text-muted)"
          strokeOpacity="0.6"
          strokeWidth="1.5"
          markerEnd="url(#graph-arrow)"
        />
        <text
          x={cx}
          y={cy - 6}
          fill="var(--text-muted)"
          fontSize="7"
          fontWeight="bold"
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          className="select-none"
        >
          {edge.label.toUpperCase()}
        </text>
      </g>
    );
  };
  const renderDynamicProp = (prop: string) => {
    const value = editCustomProps[prop] || "";
    
    if (prop === "Modulating control" || prop === "End of travel confirmation") {
      return (
        <div key={prop} className="flex flex-col gap-0.5">
          <label className="text-[8px] text-[var(--text-muted)] font-mono">{prop}</label>
          <select 
            value={value} 
            onChange={(e) => setEditCustomProps(prev => ({ ...prev, [prop]: e.target.value }))}
            className="w-full px-2 py-1 bg-[var(--bg-card-dark)] border border-[var(--border-panel)] rounded text-[10px] text-emerald-400 focus:outline-none focus:border-cyan-500 font-mono font-bold"
          >
            <option value="">Select...</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </div>
      );
    }

    if (prop === "Ambient temperature range") {
      const parts = value.replace('°C', '').split('to').map(s => s.trim());
      const min = parts[0] || "";
      const max = parts[1] || "";
      return (
        <div key={prop} className="flex flex-col gap-0.5">
          <label className="text-[8px] text-[var(--text-muted)] font-mono">{prop}</label>
          <div className="flex items-center gap-1">
            <input 
              type="number" 
              value={min}
              placeholder="Min"
              onChange={(e) => setEditCustomProps(prev => ({ ...prev, [prop]: `${e.target.value} to ${max} °C`.trim() }))}
              className="w-full px-2 py-1 bg-[var(--bg-card-dark)] border border-[var(--border-panel)] rounded text-[10px] text-emerald-400 focus:outline-none focus:border-cyan-500 font-mono text-center font-bold"
            />
            <span className="text-[10px] text-gray-500 font-bold">to</span>
            <input 
              type="number" 
              value={max}
              placeholder="Max"
              onChange={(e) => setEditCustomProps(prev => ({ ...prev, [prop]: `${min} to ${e.target.value} °C`.trim() }))}
              className="w-full px-2 py-1 bg-[var(--bg-card-dark)] border border-[var(--border-panel)] rounded text-[10px] text-emerald-400 focus:outline-none focus:border-cyan-500 font-mono text-center font-bold"
            />
            <span className="text-[10px] text-gray-400 font-mono shrink-0 w-4">°C</span>
          </div>
        </div>
      );
    }

    const unitMatch = prop.match(/\(([^)]+)\)$/);
    let implicitUnit = "";
    if (prop.toLowerCase().includes("torque")) implicitUnit = "Nm";
    else if (prop.toLowerCase().includes("weight")) implicitUnit = "kg";
    else if (prop.toLowerCase().includes("operating time")) implicitUnit = "s";
    else if (prop.toLowerCase().includes("voltage")) implicitUnit = "V";

    if (unitMatch || implicitUnit) {
      const defaultUnit = unitMatch ? unitMatch[1] : implicitUnit;
      const valMatch = value.match(/^([\d.]+)\s*(.*)$/);
      const num = valMatch ? valMatch[1] : value;
      const currentUnit = (valMatch && valMatch[2]) ? valMatch[2] : defaultUnit;

      let unitOptions = [defaultUnit];
      if (defaultUnit === "kW") unitOptions = ["W", "kW", "MW", "HP"];
      else if (defaultUnit === "A") unitOptions = ["mA", "A", "kA"];
      else if (defaultUnit === "V") unitOptions = ["mV", "V", "kV", "V DC", "V AC", "V AC/DC"];
      else if (defaultUnit === "tr/min") unitOptions = ["rpm", "tr/min", "Hz"];
      else if (defaultUnit === "l/s") unitOptions = ["l/s", "l/m", "m3/h", "gpm"];
      else if (defaultUnit === "Nm") unitOptions = ["Nm", "lb-ft", "kg-m"];
      else if (defaultUnit === "kg") unitOptions = ["g", "kg", "lbs", "t"];
      else if (defaultUnit === "s") unitOptions = ["ms", "s", "min"];

      // If currentUnit is not in options, add it
      if (currentUnit && !unitOptions.includes(currentUnit)) {
        unitOptions.push(currentUnit);
      }

      return (
        <div key={prop} className="flex flex-col gap-0.5">
          <label className="text-[8px] text-[var(--text-muted)] font-mono">{prop.replace(/\([^)]+\)$/, '').trim()}</label>
          <div className="flex gap-1">
            <input 
              type="number" 
              value={num}
              onChange={(e) => setEditCustomProps(prev => ({ ...prev, [prop]: `${e.target.value} ${currentUnit}`.trim() }))}
              className="flex-1 px-2 py-1 bg-[var(--bg-card-dark)] border border-[var(--border-panel)] rounded text-[10px] text-emerald-400 focus:outline-none focus:border-cyan-500 font-mono font-bold"
            />
            <select
              value={currentUnit}
              onChange={(e) => setEditCustomProps(prev => ({ ...prev, [prop]: `${num} ${e.target.value}`.trim() }))}
              className="w-[55px] px-1 py-1 bg-[var(--bg-card-dark)] border border-[var(--border-panel)] rounded text-[9px] text-gray-400 focus:outline-none focus:border-cyan-500 font-mono"
            >
              {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
      );
    }

    return (
      <div key={prop} className="flex flex-col gap-0.5">
        <label className="text-[8px] text-[var(--text-muted)] font-mono">{prop}</label>
        <input
          type={prop === "Installation Date" ? "date" : "text"}
          value={value}
          onChange={(e) => setEditCustomProps(prev => ({ ...prev, [prop]: e.target.value }))}
          className="w-full px-2 py-1 bg-[var(--bg-card-dark)] border border-[var(--border-panel)] rounded text-[10px] text-emerald-400 focus:outline-none focus:border-cyan-500 font-mono font-bold"
        />
      </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col justify-between p-3 bg-[var(--bg-dark-main)] text-[var(--text-main)] transition-colors">
      
      {/* Upper Action Bar */}
      <div className="flex items-center justify-between border-b border-[var(--border-panel)] pb-2 mb-2">
        <div>
          <span className="text-xs font-mono text-[var(--text-muted)]">P&ID Pipeline Processor</span>
          <p className="text-[10px] text-[var(--text-muted)]">FastAPI backend queue listener</p>
        </div>

        {fileUploaded && (
          <div className="flex bg-[var(--bg-card-dark)] border border-[var(--border-panel)] p-0.5 rounded shadow-sm no-draw">
            <button
              onClick={() => setWorkspaceView("image")}
              className={`px-3 py-1 text-[9px] font-bold uppercase rounded transition-colors cursor-pointer ${
                workspaceView === "image" ? "bg-cyan-500 text-white" : "text-[var(--text-muted)] hover:text-white"
              }`}
            >
              Image View
            </button>
            <button
              onClick={() => setWorkspaceView("topology")}
              className={`px-3 py-1 text-[9px] font-bold uppercase rounded transition-colors cursor-pointer ${
                workspaceView === "topology" ? "bg-cyan-500 text-white" : "text-[var(--text-muted)] hover:text-white"
              }`}
            >
              Topology View
            </button>
          </div>
        )}

        {!fileUploaded && (
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*,application/pdf"
              className="hidden"
            />
            <button
              onClick={triggerUpload}
              disabled={isExtracting}
              className="px-4 py-2 btn-primary text-xs uppercase font-bold tracking-wider disabled:opacity-50"
            >
              {isExtracting ? "Extracting..." : "Upload & Analyze P&ID"}
            </button>
          </div>
        )}

        {fileUploaded && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-emerald-400 font-mono">✓ Agent Extracted</span>
            <button
              onClick={() => {
                setFileUploaded(false);
                setSelectedBox(null);
                setSelectedLine(null);
                setImageSrc(null);
                setBboxes([]);
                setLines([]);
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }}
              className="px-3 py-1.5 border border-gray-800 hover:border-white text-[10px] uppercase font-bold tracking-wide rounded"
            >
              Clear file
            </button>
          </div>
        )}
      </div>

      {/* Main workspace */}
      <div className="flex-1 flex flex-col gap-2 overflow-hidden">
        
        {/* Top split area */}
        <div className="flex-1 flex gap-2 overflow-hidden min-h-[160px]">
        
        {/* Visual Drawing Area */}
        <div 
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => e.preventDefault()}
          className="flex-1 glass-panel border-[var(--border-panel)] flex flex-col relative overflow-hidden bg-[var(--bg-panel)]/40 transition-colors"
        >
          
          {isExtracting ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 m-2 bg-[var(--bg-panel)]/90 backdrop-blur-sm rounded-lg select-none">
              <div className="relative w-24 h-24 mb-4 flex items-center justify-center">
                <div className="absolute inset-0 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin"></div>
                <span className="text-[14px] font-mono font-bold text-cyan-400">{progress.percent}%</span>
              </div>
              <p className="text-xs text-[var(--text-main)] font-semibold uppercase tracking-wider animate-pulse mb-1">
                Processing P&ID Drawing
              </p>
              <p className="text-[10px] text-[var(--text-muted)] font-mono text-center max-w-xs">
                {progress.status}
              </p>
              <div className="w-64 bg-gray-800 h-1.5 rounded-full overflow-hidden mt-3 border border-gray-700">
                <div 
                  className="bg-cyan-400 h-full rounded-full transition-all duration-300"
                  style={{ width: `${progress.percent}%` }}
                ></div>
              </div>
            </div>
          ) : !fileUploaded ? (
            <div 
              onClick={triggerUpload}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="flex-1 flex flex-col items-center justify-center p-8 border-2 border-dashed border-[var(--border-panel)] rounded-lg m-2 hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all cursor-pointer select-none"
            >
              <span className="text-3xl mb-2">📁</span>
              <p className="text-xs text-[var(--text-main)] font-semibold">Drag & drop your P&ID PDF drawing here</p>
              <p className="text-[9px] text-[var(--text-muted)] mt-1">Or click to browse files (accepts standard sheets up to 25MB)</p>
            </div>
          ) : workspaceView === "topology" ? (
            <div className="flex-1 relative m-2 border border-[var(--border-panel)] rounded-lg overflow-hidden bg-[var(--bg-panel)]/80 select-none flex flex-col transition-colors">
              <div className="p-2 border-b border-[var(--border-panel)] bg-[var(--bg-card-dark)]/50 flex items-center justify-between no-draw">
                <span className="text-[10px] font-bold theme-text-primary uppercase tracking-wider font-mono">P&ID Extracted Topology Graph</span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setGZoom(Math.min(gZoom * 1.3, 8))} className="px-1.5 py-0.5 text-[9px] font-mono bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 text-white">+</button>
                  <button onClick={() => setGZoom(Math.max(gZoom / 1.3, 0.15))} className="px-1.5 py-0.5 text-[9px] font-mono bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 text-white">−</button>
                  <button onClick={fitGraphToView} className="px-1.5 py-0.5 text-[9px] font-mono bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 text-white">Fit</button>
                  <button onClick={resetGraphView} className="px-1.5 py-0.5 text-[9px] font-mono bg-gray-800 hover:bg-gray-700 rounded border border-gray-700 text-white">Reset</button>
                  <span className="text-[8px] text-[var(--text-muted)] font-mono ml-1">{Math.round(gZoom * 100)}%</span>
                </div>
              </div>
              <div
                ref={graphContainerRef}
                className={`flex-1 relative min-h-0 overflow-hidden ${gIsPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
              >
                {graphData ? (
                  <svg
                    ref={graphSvgRef}
                    width="100%"
                    height="100%"
                    className="w-full h-full"
                    onMouseDown={handleGraphMouseDown}
                    onMouseMove={handleGraphMouseMove}
                    onMouseUp={handleGraphMouseUp}
                    onMouseLeave={handleGraphMouseUp}
                  >
                    <defs>
                      <marker
                        id="graph-arrow"
                        viewBox="0 0 10 10"
                        refX="6"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--text-muted)" fillOpacity="0.8" />
                      </marker>
                    </defs>

                    {/* Transformed group for zoom & pan */}
                    <g transform={`translate(${gPan.x}, ${gPan.y}) scale(${gZoom})`}>
                      {/* Render edges */}
                      {graphData.edges.map((edge, idx) => renderGraphEdge(edge, idx))}

                      {/* Render nodes */}
                      {graphData.nodes.map((node) => {
                        const pos = graphPositions[node.id];
                        if (!pos) return null;

                        const colors = getNodeColors(node.type);
                        const cleanLabel = node.label.replace(/[\[\]]/g, "");
                        const isSelected = selectedBox?.tag === node.id || selectedBox?.id === node.id || selectedBox?.label.includes(node.id) || node.id.includes(selectedBox?.tag || "NONE");

                        return (
                          <g
                            key={node.id}
                            transform={`translate(${pos.x}, ${pos.y})`}
                            className="cursor-pointer group"
                            onMouseDown={(e) => handleGraphNodeMouseDown(node.id, e)}
                          >
                            <circle
                              cx="0"
                              cy="0"
                              r="20"
                              fill={colors.bg}
                              stroke={isSelected ? "#00f0ff" : colors.border}
                              strokeWidth={isSelected ? "2.5" : "1.5"}
                              className="shadow-md group-hover:brightness-110 transition-all duration-150"
                            />
                            <text
                              x="0"
                              y="3"
                              fill="#ffffff"
                              fontSize="7"
                              fontWeight="bold"
                              textAnchor="middle"
                              fontFamily="var(--font-sans)"
                              className="select-none pointer-events-none"
                            >
                              {cleanLabel.length > 9 ? cleanLabel.substring(0, 7) + "..." : cleanLabel}
                            </text>
                            <title>{cleanLabel}</title>
                          </g>
                        );
                      })}
                    </g>
                  </svg>
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-[var(--text-muted)] font-mono animate-pulse">
                    Parsing topology network layout...
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div 
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              className={`flex-1 relative m-2 border border-[var(--border-panel)] rounded-lg overflow-hidden bg-[var(--bg-panel)]/40 select-none transition-colors ${
                interactionMode === "pan" ? (isPanning ? "cursor-grabbing" : "cursor-grab") : "cursor-crosshair"
              }`}
            >
              {/* Inner Transformed Container */}
              <div
                style={{
                  width: `${renderW}px`,
                  height: `${renderH}px`,
                  left: `${offsetX}px`,
                  top: `${offsetY}px`,
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: "0 0",
                  position: "absolute",
                  ...(imageSrc ? {
                    backgroundImage: `url(${imageSrc})`,
                    backgroundSize: "100% 100%",
                    backgroundRepeat: "no-repeat"
                  } : {})
                }}
                className="absolute"
              >
                {/* Simulated Drawing Lines inside Background (only when no image loaded) */}
                {!imageSrc && (
                  <div className="absolute inset-0 opacity-10 flex flex-wrap gap-6 pointer-events-none p-4">
                    {Array.from({ length: 48 }).map((_, i) => (
                      <div key={i} className="w-12 h-12 border border-cyan-500 rounded-full" />
                    ))}
                  </div>
                )}

                {/* Render Existing Bounding Boxes */}
                {bboxes.map((box) => {
                  const isSelected = selectedBox?.id === box.id;
                  const isHovered = hoveredBoxId === box.id;
                  const showDetails = isSelected || isHovered;
                  const shortLabel = box.label.split("/").pop() || box.label;

                  return (
                    <div
                      key={box.id}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedBox(box);
                        setSelectedLine(null);
                        setEditLabel(box.label);
                        setEditTag(box.tag || "");
                      }}
                      onMouseEnter={() => setHoveredBoxId(box.id)}
                      onMouseLeave={() => setHoveredBoxId(null)}
                      style={getRenderedCoords(box)}
                      className={`bbox-element absolute border transition-all cursor-pointer flex flex-col justify-between select-none ${
                        interactionMode === "pan" ? "pointer-events-none" : "pointer-events-auto"
                      } ${
                        isSelected
                           ? "border-cyan-400 bg-cyan-500/25 z-20"
                           : isHovered
                           ? "border-cyan-400 bg-cyan-500/15 z-10"
                           : "border-cyan-500/40 bg-cyan-500/5 hover:border-cyan-400"
                      }`}
                    >
                      {showDetails && (
                        <>
                          <span className="bg-cyan-900/95 backdrop-blur-sm text-white text-[8px] font-semibold font-mono px-1.5 py-0.5 rounded w-max block absolute -top-5.5 left-0 border border-cyan-500/30 z-30 shadow-md">
                            {shortLabel}
                          </span>
                          <span className="text-[7.5px] text-cyan-300 font-mono text-right font-bold drop-shadow-sm absolute bottom-0.5 right-1 pointer-events-none">
                            {box.confidence}%
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}

                {/* Render Detected Lines (with interactive layers) */}
                {lines.length > 0 && (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
                    {lines.map((line) => {
                      const coords = getRenderedLineCoords(line);
                      const isSelected = selectedLine?.id === line.id;
                      return (
                        <g key={line.id} className="pointer-events-auto cursor-pointer">
                          {/* Invisible wide interactive helper line */}
                          <line
                            x1={coords.x1}
                            y1={coords.y1}
                            x2={coords.x2}
                            y2={coords.y2}
                            stroke="transparent"
                            strokeWidth="10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLine(line);
                              setSelectedBox(null);
                            }}
                          />
                          {/* Visible pipe line */}
                          <line
                            x1={coords.x1}
                            y1={coords.y1}
                            x2={coords.x2}
                            y2={coords.y2}
                            stroke={isSelected ? "#00f0ff" : "#3b82f6"} // bright cyan if selected, else HMI blue
                            strokeWidth={isSelected ? "3" : "2"}
                            strokeLinecap="round"
                            className="opacity-80 pointer-events-none"
                          />
                        </g>
                      );
                    })}
                  </svg>
                )}

                {/* Draw Current active line feedback */}
                {currentLine && (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none z-20">
                    <line
                      x1={currentLine.startX}
                      y1={currentLine.startY}
                      x2={currentLine.endX}
                      y2={currentLine.endY}
                      stroke="#10b981" // emerald green for active drawing
                      strokeWidth="2.5"
                      strokeDasharray="4 4"
                      strokeLinecap="round"
                    />
                  </svg>
                )}

                {/* Draw Current active box */}
                {currentBox && (
                  <div
                    style={{
                      left: `${currentBox.x}px`,
                      top: `${currentBox.y}px`,
                      width: `${currentBox.w}px`,
                      height: `${currentBox.h}px`,
                    }}
                    className="absolute border border-dashed border-emerald-400 bg-emerald-500/10 pointer-events-none z-20"
                  />
                )}
              </div>

              {/* Floating HMI Controls Toolbar */}
              <div className="absolute top-2 left-2 z-30 flex items-center gap-1.5 bg-[#0f111a]/95 backdrop-blur-md px-2 py-1 border border-cyan-500/20 rounded-lg shadow-lg no-draw">
                <button
                  onClick={() => setInteractionMode("draw")}
                  className={`p-1 rounded transition-all flex items-center justify-center ${
                    interactionMode === "draw"
                      ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                      : "text-gray-400 hover:text-white border border-transparent"
                  }`}
                  title="Draw Mode"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </button>
                <button
                  onClick={() => setInteractionMode("pan")}
                  className={`p-1 rounded transition-all flex items-center justify-center ${
                    interactionMode === "pan"
                      ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                      : "text-gray-400 hover:text-white border border-transparent"
                  }`}
                  title="Pan Mode"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5" />
                    <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6" />
                    <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v4.5" />
                    <path d="M6 14v-1.5a1.5 1.5 0 0 0-3 0V18a6 6 0 0 0 6 6h4a6 6 0 0 0 6-6v-3a1.5 1.5 0 0 0-3 0" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    setInteractionMode("line");
                    setSelectedBox(null);
                  }}
                  className={`p-1 rounded transition-all flex items-center justify-center ${
                    interactionMode === "line"
                      ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                      : "text-gray-400 hover:text-white border border-transparent"
                  }`}
                  title="Draw Pipe Lines"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="19" x2="19" y2="5" />
                    <circle cx="5" cy="19" r="1.5" fill="currentColor" />
                    <circle cx="19" cy="5" r="1.5" fill="currentColor" />
                  </svg>
                </button>
                <div className="w-[1px] h-3 bg-gray-800 mx-1" />
                <button
                  onClick={() => setZoom(Math.min(zoom * 1.2, 5))}
                  className="p-1 rounded text-gray-400 hover:text-white transition-all flex items-center justify-center"
                  title="Zoom In"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="11" y1="8" x2="11" y2="14" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                </button>
                <button
                  onClick={() => setZoom(Math.max(zoom / 1.2, 0.5))}
                  className="p-1 rounded text-gray-400 hover:text-white transition-all flex items-center justify-center"
                  title="Zoom Out"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  className="p-1 rounded text-gray-400 hover:text-white transition-all flex items-center justify-center"
                  title="Reset View"
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 4v6h-6M1 20v-6h6" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                </button>
                <span className="text-[9px] text-gray-400 font-mono min-w-[28px] text-center select-none font-semibold ml-1">
                  {Math.round(zoom * 100)}%
                </span>
              </div>
            </div>
          )}

          {fileUploaded && (
            <div className="absolute bottom-2 left-4 text-[9px] font-mono text-[var(--text-muted)]">
              * Click and drag to manually add a missing symbol detection box.
            </div>
          )}
        </div>

        {/* Bounding box correction details panel */}
        <div className="w-96 bg-[var(--bg-panel)] border border-[var(--border-panel)] rounded-lg p-3 flex flex-col justify-between transition-colors overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
            <h3 className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-panel)] pb-1.5 sticky top-0 bg-[var(--bg-panel)] z-10">
              BBox Inspector
            </h3>

            {selectedLine ? (
              <div className="space-y-2.5">
                <div className="bg-[var(--bg-card-dark)] p-2 rounded border border-[var(--border-panel)]">
                  <span className="text-[8px] text-[var(--text-muted)] uppercase block font-semibold">Selected Piping Line</span>
                  <p className="text-xs font-bold text-[var(--text-main)] font-mono">{selectedLine.id}</p>
                </div>
                
                <div className="bg-[var(--bg-card-dark)] p-2 rounded border border-[var(--border-panel)] space-y-1.5">
                  <span className="text-[8px] text-[var(--text-muted)] uppercase block font-semibold">Geometry (Normalized Coordinates)</span>
                  <div className="grid grid-cols-2 gap-1.5 text-[9px] font-mono text-[var(--text-main)]">
                    <div>Start X: {selectedLine.startX.toFixed(3)}</div>
                    <div>Start Y: {selectedLine.startY.toFixed(3)}</div>
                    <div>End X: {selectedLine.endX.toFixed(3)}</div>
                    <div>End Y: {selectedLine.endY.toFixed(3)}</div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => {
                      setLines((prev) => prev.filter((l) => l.id !== selectedLine.id));
                      setSelectedLine(null);
                    }}
                    className="w-full py-1.5 bg-red-950/20 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-[9px] uppercase font-bold rounded cursor-pointer transition-colors"
                  >
                    Delete Pipe Line
                  </button>
                </div>
              </div>
            ) : selectedBox ? (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[var(--bg-card-dark)] p-2 rounded border border-[var(--border-panel)]">
                    <span className="text-[8px] text-[var(--text-muted)] uppercase">Symbol ID</span>
                    <p className="text-xs font-bold text-[var(--text-main)] font-mono">{selectedBox.id}</p>
                  </div>
                  <div className="bg-[var(--bg-card-dark)] p-2 rounded border border-[var(--border-panel)]">
                    <span className="text-[8px] text-[var(--text-muted)] uppercase">Confidence</span>
                    <p className="text-xs font-bold text-[var(--text-main)] font-mono">{selectedBox.confidence}%</p>
                  </div>
                </div>

                <div className="bg-[var(--bg-card-dark)] p-2 rounded border border-[var(--border-panel)] space-y-1">
                  <span className="text-[8px] text-[var(--text-muted)] uppercase block font-semibold">Geometry (Normalized 0-1)</span>
                  <div className="grid grid-cols-4 gap-1 text-[8.5px] font-mono text-[var(--text-main)]">
                    <div>X: {selectedBox.x.toFixed(3)}</div>
                    <div>Y: {selectedBox.y.toFixed(3)}</div>
                    <div>W: {selectedBox.w.toFixed(3)}</div>
                    <div>H: {selectedBox.h.toFixed(3)}</div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[8.5px] text-[var(--text-muted)] font-semibold uppercase block">Associated Tag</label>
                  <input
                    type="text"
                    value={editTag}
                    onChange={(e) => setEditTag(e.target.value)}
                    placeholder="e.g. AV-40613"
                    className="w-full px-2 py-1 bg-[var(--bg-card-dark)] border border-[var(--border-panel)] rounded text-xs text-[var(--text-main)] focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[8.5px] text-[var(--text-muted)] font-semibold uppercase block">Detection Name / Type</label>
                  <input
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="w-full px-2 py-1 bg-[var(--bg-card-dark)] border border-[var(--border-panel)] rounded text-xs text-[var(--text-main)] focus:outline-none focus:border-cyan-500 font-semibold"
                  />
                </div>

                {/* Dynamic Properties */}
                <div className="space-y-1.5 pt-2 border-t border-[var(--border-panel)] mt-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[8.5px] text-[var(--text-muted)] font-semibold uppercase">Technical / Operational Data</label>
                  </div>
                  
                  {getDynamicSchema(editLabel).map((prop) => renderDynamicProp(prop))}

                  {(editCustomProps["Max Pressure"] || editCustomProps["Max Temperature"]) && (
                    <div className="bg-[var(--bg-card-dark)] p-2 rounded border border-[var(--border-panel)] mt-2">
                      <span className="text-[8px] text-[var(--text-muted)] uppercase block font-semibold mb-1">Technical Limits (From Model Specs)</span>
                      <div className="flex gap-4 text-[10px] font-mono">
                        {editCustomProps["Max Temperature"] && <div><span className="text-amber-500 font-bold">Max Temp:</span> <span className="text-amber-400">{editCustomProps["Max Temperature"]}</span></div>}
                        {editCustomProps["Max Pressure"] && <div><span className="text-emerald-500 font-bold">Max Press:</span> <span className="text-emerald-400">{editCustomProps["Max Pressure"]}</span></div>}
                      </div>
                    </div>
                  )}
                  
                  {/* Datasheet Upload Simulation */}
                  <div className="pt-2 space-y-1">
                    {editCustomProps["_datasheetFileName"] && (
                      <div className="bg-indigo-950/30 border border-indigo-500/20 p-1.5 rounded flex items-center justify-between text-[9px] font-mono">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" strokeWidth="2" fill="none" className="text-indigo-400 shrink-0">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                          <span className="text-indigo-200 truncate">{editCustomProps["_datasheetFileName"]}</span>
                        </div>
                        <button 
                          onClick={() => {
                            setEditCustomProps(prev => {
                              const next = { ...prev };
                              delete next["_datasheetFileName"];
                              delete next["_datasheetMimeType"];
                              return next;
                            });
                          }}
                          className="text-gray-500 hover:text-red-400 p-0.5"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    <input 
                      type="file" 
                      accept=".pdf,.txt" 
                      ref={datasheetInputRef} 
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setIsParsingDatasheet(true);
                          
                          const processFile = (textContent: string | null) => {
                            setTimeout(() => {
                              const schema = getDynamicSchema(editLabel);
                              const newValues: Record<string, string> = {};
                              
                              if (textContent) {
                                // Actual rudimentary text parser!
                                const lines = textContent.split('\n');
                                for (const prop of schema) {
                                  const baseProp = prop.split('(')[0].trim().toLowerCase();
                                  const match = lines.find(l => l.toLowerCase().includes(baseProp));
                                  if (match) {
                                    const valMatch = match.match(/[:=]\s*(.+)/);
                                    if (valMatch) {
                                      newValues[prop] = valMatch[1].trim();
                                    }
                                  }
                                }
                              }
                              
                              // Fallback to mock values if parsing failed or it's a PDF
                              if (Object.keys(newValues).length === 0) {
                                if (schema === PUMP_SCHEMA) {
                                  newValues["Nominal Motor Power (kW)"] = "75.0";
                                  newValues["Nominal Motor Current (A)"] = "135";
                                  newValues["Nominal Motor Voltage (V)"] = "400";
                                  newValues["Maximum Motor Speed (tr/min)"] = "1450";
                                  newValues["Pump Max Flow (l/s)"] = "120";
                                } else if (schema === SOLENOID_VALVE_SCHEMA) {
                                  newValues["Voltage range"] = "24-240V AC/DC";
                                  newValues["Modulating control"] = "4-20mA";
                                  newValues["Operating time"] = "12s";
                                  newValues["Maximum break torque"] = "60 Nm";
                                  newValues["Maximum operating torque"] = "55 Nm";
                                  newValues["IP Rating"] = "IP67";
                                  newValues["Working angle"] = "90°";
                                  newValues["Weight"] = "2.5 kg";
                                } else {
                                  newValues["Manufacturer"] = "Flowserve";
                                  newValues["Installation Date"] = new Date().toISOString().split('T')[0];
                                  newValues["Max Pressure"] = "8 bar";
                                  newValues["Max Temperature"] = "90 °C";
                                }
                              }
                              
                              newValues["_datasheetFileName"] = file.name;
                              newValues["_datasheetMimeType"] = file.type || "application/pdf";
                              
                              setEditCustomProps(prev => ({ ...prev, ...newValues }));
                              setIsParsingDatasheet(false);
                              if (datasheetInputRef.current) datasheetInputRef.current.value = "";
                            }, 1500);
                          };

                          if (file.type === "text/plain") {
                            const reader = new FileReader();
                            reader.onload = (event) => processFile(event.target?.result as string);
                            reader.readAsText(file);
                          } else {
                            processFile(null);
                          }
                        }
                      }}
                    />
                    <button
                      onClick={() => datasheetInputRef.current?.click()}
                      disabled={isParsingDatasheet}
                      className="w-full py-1.5 bg-indigo-950/20 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-[9px] uppercase font-bold rounded cursor-pointer transition-colors flex items-center justify-center gap-1"
                    >
                      {isParsingDatasheet ? (
                        <>
                          <div className="w-2 h-2 rounded-full border-t border-indigo-400 animate-spin" />
                          Extracting...
                        </>
                      ) : (
                        "Upload Datasheet (PDF/TXT)"
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex gap-1.5 pt-1">
                  <button
                    onClick={handleSaveLabel}
                    className="flex-1 py-1.5 bg-cyan-950/20 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-[9px] uppercase font-bold rounded cursor-pointer transition-colors"
                  >
                    Save Change
                  </button>
                  <button
                    onClick={() => handleDeleteBox(selectedBox.id)}
                    className="px-2 py-1.5 bg-red-950/20 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-[9px] uppercase font-bold rounded cursor-pointer transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-[var(--text-muted)] text-xs">
                {fileUploaded ? "Select a bounding box to inspect/modify details." : "Upload a document to parse schema detections."}
              </div>
            )}
          </div>

          {fileUploaded && (
            <div className="pt-2 mt-1.5 border-t border-[var(--border-panel)] bg-[var(--bg-panel)]">
              <button 
                onClick={handlePublishAAS}
                disabled={isPublishing || publishSuccess}
                className={`w-full py-1.5 border text-[9px] uppercase font-bold rounded tracking-widest transition-all duration-300 ${
                  publishSuccess 
                    ? "bg-emerald-500/40 border-emerald-400 text-emerald-100" 
                    : isPublishing
                    ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-400/50 cursor-not-allowed animate-pulse"
                    : "bg-emerald-950/20 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-400 cursor-pointer"
                }`}
              >
                {publishSuccess ? "✓ AAS MODELS PUBLISHED" : isPublishing ? "PUBLISHING TO REGISTRY..." : "PUBLISH TO AAS"}
              </button>
            </div>
          )}
        </div>
        </div>

        {/* Bottom Table Area */}
        {fileUploaded && bboxes.length > 0 && (
          <div className="h-40 shrink-0 border border-[var(--border-panel)] bg-[var(--bg-panel)]/80 rounded-lg p-3 flex flex-col overflow-hidden no-draw transition-colors">
            <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-panel)] pb-1.5 mb-2">
              Detected Symbols & Tags
            </h3>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-panel)] text-[var(--text-muted)] font-mono">
                    <th className="py-1.5 px-2.5">Symbol ID</th>
                    <th className="py-1.5 px-2.5">Detection Name / Type</th>
                    <th className="py-1.5 px-2.5">Associated Tag</th>
                    <th className="py-1.5 px-2.5">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-panel)] font-mono text-[var(--text-main)]">
                  {bboxes.map((box) => (
                    <tr 
                      key={box.id} 
                      onClick={() => {
                        setSelectedBox(box);
                        setSelectedLine(null);
                        setEditLabel(box.label);
                        setEditTag(box.tag || "");
                      }}
                      className={`hover:bg-cyan-500/10 cursor-pointer transition-colors ${
                        selectedBox?.id === box.id ? "bg-cyan-500/15 text-cyan-400" : ""
                      }`}
                    >
                      <td className="py-1 px-2.5">{box.id}</td>
                      <td className="py-1 px-2.5">{box.label.split("/").pop() || box.label}</td>
                      <td className="py-1 px-2.5">
                        <span className="text-emerald-400 font-semibold">{box.tag || box.label}</span>
                      </td>
                      <td className="py-1 px-2.5">{box.confidence}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
