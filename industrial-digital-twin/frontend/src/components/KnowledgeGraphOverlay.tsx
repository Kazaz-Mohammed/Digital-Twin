import React, { useEffect, useState, useRef } from "react";
import { useDigitalTwin } from "../context/DigitalTwinContext";

interface NodeItem {
  id: string;
  label: string;
  type: string;
  status: string;
  properties?: Record<string, any>;
}

interface EdgeItem {
  source: string;
  target: string;
  label: string;
}

// Map each distinct node type to its official Neo4j visual colors
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

export default function KnowledgeGraphOverlay() {
  const { expandedPanel, graphData, setGraphData } = useDigitalTwin();
  const isExpanded = expandedPanel === "graph";

  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeItem | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Zoom & Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Calculate dynamic node radius based on count and expansion state
  const nodeCount = graphData ? graphData.nodes.length : 0;
  const baseRadius = isExpanded ? 32 : 20;
  const nodeRadius = nodeCount > 12 
    ? Math.max(isExpanded ? 12 : 7, baseRadius * Math.sqrt(12 / nodeCount))
    : baseRadius;

  useEffect(() => {
    // Always fetch fresh topology when graphData is null (initial load or after clear)
    if (!graphData) {
      fetch("http://localhost:8000/api/graph/topology")
        .then(res => res.json())
        .then(topology => {
          setGraphData(topology);
        })
        .catch(err => {
          console.error("Error loading Neo4j topology graph:", err);
        });
      return;
    }

    // Re-run layout whenever graphData changes (e.g. after AI Parser extraction completes)
    const count = graphData.nodes.length;
    if (count === 0) return;

    // Use a larger virtual space so nodes can spread out naturally without overlap
    const virtualW = 1000;
    const virtualH = 800;

    // Start with a grid layout or simple scattered points in the center area of virtual space
    const initialPositions: Record<string, { x: number; y: number }> = {};
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    const spacingX = (virtualW - 120) / cols;
    const spacingY = (virtualH - 100) / Math.ceil(count / cols);

    graphData.nodes.forEach((node: NodeItem, i: number) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      initialPositions[node.id] = {
        x: 60 + col * spacingX + (Math.random() - 0.5) * 15,
        y: 50 + row * spacingY + (Math.random() - 0.5) * 15
      };
    });

    // Run synchronous force-directed simulation
    const nodeIds = graphData.nodes.map((n: NodeItem) => n.id);
    const iterations = 80;
    for (let iter = 0; iter < iterations; iter++) {
      const forces: Record<string, { fx: number; fy: number }> = {};
      nodeIds.forEach(id => { forces[id] = { fx: 0, fy: 0 }; });

      // 1. Repulsion between nodes
      for (let i = 0; i < nodeIds.length; i++) {
        for (let j = i + 1; j < nodeIds.length; j++) {
          const a = initialPositions[nodeIds[i]];
          const b = initialPositions[nodeIds[j]];
          if (!a || !b) continue;
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minSafeDist = nodeRadius * 3.5; // safe distance in virtual space
          if (dist < minSafeDist) {
            const forceMag = 4000 / (dist * dist);
            const fx = (dx / dist) * forceMag;
            const fy = (dy / dist) * forceMag;
            forces[nodeIds[i]].fx -= fx;
            forces[nodeIds[i]].fy -= fy;
            forces[nodeIds[j]].fx += fx;
            forces[nodeIds[j]].fy += fy;
          }
        }
      }

      // 2. Attraction along edges
      graphData.edges.forEach((edge: EdgeItem) => {
        const a = initialPositions[edge.source];
        const b = initialPositions[edge.target];
        if (!a || !b) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetLen = nodeRadius * 4.5; // line length in virtual space
        const attract = (dist - targetLen) * 0.05;
        const fx = (dx / dist) * attract;
        const fy = (dy / dist) * attract;
        forces[edge.source].fx += fx;
        forces[edge.source].fy += fy;
        forces[edge.target].fx -= fx;
        forces[edge.target].fy -= fy;
      });

      // Apply forces and constrain inside virtual canvas
      const damping = 0.25;
      const margin = 50;
      nodeIds.forEach(id => {
        const pos = initialPositions[id];
        if (!pos) return;
        let nx = pos.x + forces[id].fx * damping;
        let ny = pos.y + forces[id].fy * damping;
        nx = Math.max(margin, Math.min(virtualW - margin, nx));
        ny = Math.max(margin, Math.min(virtualH - margin, ny));
        initialPositions[id] = { x: nx, y: ny };
      });
    }

    setPositions(initialPositions);

    // Compute Auto-Fit scale to fit the virtual positions inside the actual box size
    const width = isExpanded ? 500 : 340;
    const height = isExpanded ? 400 : 160;

    const xs = Object.values(initialPositions).map(p => p.x);
    const ys = Object.values(initialPositions).map(p => p.y);
    if (xs.length > 0) {
      const minX = Math.min(...xs) - 40;
      const maxX = Math.max(...xs) + 40;
      const minY = Math.min(...ys) - 40;
      const maxY = Math.max(...ys) + 40;

      const scaleX = width / (maxX - minX);
      const scaleY = height / (maxY - minY);
      const newZoom = Math.min(scaleX, scaleY, 1.2);
      
      setZoom(newZoom);
      setPan({
        x: (width - (maxX + minX) * newZoom) / 2,
        y: (height - (maxY + minY) * newZoom) / 2
      });
    }

    // Auto select first node on expand
    if (graphData.nodes.length > 0 && !selectedNode) {
      setSelectedNode(graphData.nodes[0]);
    }
  }, [graphData, isExpanded]);

  // Poll backend every 5 seconds so the KG dashboard stays in sync with latest AI extraction
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("http://localhost:8000/api/graph/topology");
        if (res.ok) {
          const topology = await res.json();
          // Only update if node count changed (new extraction happened) to avoid rerender loops
          const newCount = topology?.nodes?.length ?? 0;
          const currentCount = graphData?.nodes?.length ?? 0;
          if (newCount !== currentCount) {
            setGraphData(topology);
          }
        }
      } catch {
        // ignore polling errors silently
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [graphData, setGraphData]);

  // Mouse wheel listener for zoom controls
  useEffect(() => {
    const container = svgRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = 1.1;
      let nextZoom = zoom;
      if (e.deltaY < 0) {
        nextZoom = Math.min(zoom * factor, 6);
      } else {
        nextZoom = Math.max(zoom / factor, 0.1);
      }

      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      setPan(prev => ({
        x: mx - (mx - prev.x) * (nextZoom / zoom),
        y: my - (my - prev.y) * (nextZoom / zoom)
      }));
      setZoom(nextZoom);
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [zoom]);

  const handleMouseDown = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDraggingNodeId(nodeId);
    
    // Set selected node on click
    const node = graphData?.nodes.find(n => n.id === nodeId);
    if (node) {
      setSelectedNode(node);
    }
  };

  const handleSvgMouseDown = (e: React.MouseEvent) => {
    if (!draggingNodeId) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleSvgMouseMove = (e: React.MouseEvent) => {
    if (draggingNodeId && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      // Translate mouse coordinates to virtual space coordinates accounting for zoom and pan
      const x = (e.clientX - rect.left - pan.x) / zoom;
      const y = (e.clientY - rect.top - pan.y) / zoom;
      setPositions(prev => ({
        ...prev,
        [draggingNodeId]: { 
          x: Math.max(20, Math.min(980, x)), 
          y: Math.max(20, Math.min(780, y)) 
        }
      }));
      return;
    }
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
    }
  };

  const handleSvgMouseUp = () => {
    setDraggingNodeId(null);
    setIsPanning(false);
  };

  // Helper to draw curved paths with arrow marker boundary offsets
  const renderEdge = (edge: EdgeItem, idx: number) => {
    const srcPos = positions[edge.source];
    const tgtPos = positions[edge.target];

    if (!srcPos || !tgtPos) return null;

    const dx = tgtPos.x - srcPos.x;
    const dy = tgtPos.y - srcPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist === 0) return null;

    // Radius matches dynamic scaled nodeRadius
    const padX1 = (dx / dist) * nodeRadius; 
    const padY1 = (dy / dist) * nodeRadius;
    const padX2 = (dx / dist) * (nodeRadius + 4); // Terminate 4px earlier for arrow head clearance
    const padY2 = (dy / dist) * (nodeRadius + 4);

    const x1 = srcPos.x + padX1;
    const y1 = srcPos.y + padY1;
    const x2 = tgtPos.x - padX2;
    const y2 = tgtPos.y - padY2;

    const angle = Math.atan2(dy, dx);
    const cx = (x1 + x2) / 2 + Math.sin(angle) * (isExpanded ? 24 : 12);
    const cy = (y1 + y2) / 2 - Math.cos(angle) * (isExpanded ? 24 : 12);

    return (
      <g key={`edge-${idx}`}>
        <path
          d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
          fill="none"
          stroke="var(--text-muted)"
          strokeOpacity="0.5"
          strokeWidth={isExpanded ? "1.8" : "1.2"}
          markerEnd="url(#arrow)"
        />
        {nodeRadius > 10 && (
          <text
            x={cx}
            y={cy - (isExpanded ? 8 : 4)}
            fill="var(--text-muted)"
            fontSize={isExpanded ? "8" : "6"}
            fontWeight="bold"
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            className="select-none"
          >
            {edge.label.toUpperCase()}
          </text>
        )}
      </g>
    );
  };

  return (
    <div className={`dashboard-panel w-full ${isExpanded ? "h-full flex flex-col" : "h-[220px] flex flex-col justify-between"}`}>
      <div className="flex items-center justify-between border-b border-[var(--border-panel)] pb-2 mb-1">
        <span className="text-[10px] font-bold theme-text-primary uppercase tracking-wider">Operational Knowledge Graph</span>
        <span className="text-[8px] text-cyan-400 font-mono">Neo4j API Connection</span>
      </div>

      <div className={`flex-1 flex ${isExpanded ? "flex-row min-h-0" : "flex-col"} relative select-none`}>
        {/* Graph SVG canvas view */}
        <div className="flex-1 relative bg-black/5 rounded overflow-hidden">
          {graphData ? (
            <svg 
              ref={svgRef}
              width="100%" 
              height="100%" 
              className="w-full h-full cursor-grab active:cursor-grabbing"
              onMouseDown={handleSvgMouseDown}
              onMouseMove={handleSvgMouseMove}
              onMouseUp={handleSvgMouseUp}
              onMouseLeave={handleSvgMouseUp}
            >
              {/* SVG Markers definitions for arrows */}
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth={isExpanded ? "8" : "5"}
                  markerHeight={isExpanded ? "8" : "5"}
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--text-muted)" fillOpacity="0.7" />
                </marker>
              </defs>

              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                {/* Draw Relationships Edges */}
                {graphData.edges.map((edge, idx) => renderEdge(edge, idx))}

                {/* Draw Nodes (Circular Neo4j layout style) */}
                {graphData.nodes.map((node) => {
                  const pos = positions[node.id];
                  if (!pos) return null;

                  // Dynamic coloring mapping matching Neo4j styles
                  const colors = getNodeColors(node.type);

                  // Split label text to display short tags inside circles neatly
                  const cleanLabel = node.label.replace(/[\[\]]/g, "");
                  const isSelected = selectedNode?.id === node.id;

                  return (
                    <g 
                      key={node.id} 
                      transform={`translate(${pos.x}, ${pos.y})`}
                      className="cursor-pointer group"
                      onMouseDown={(e) => handleMouseDown(node.id, e)}
                    >
                      {/* Outer circle representing Neo4j nodes */}
                      <circle 
                        cx="0"
                        cy="0"
                        r={nodeRadius}
                        fill={colors.bg}
                        stroke={isSelected ? "#ffffff" : colors.border}
                        strokeWidth={isSelected ? "2.5" : isExpanded ? "2" : "1.5"}
                        className="shadow-md group-hover:brightness-110 transition-all duration-150"
                      />
                      {nodeRadius > 10 && (
                        <text 
                          x="0" 
                          y={isExpanded ? "3" : "2"} 
                          fill="#ffffff" 
                          fontSize={nodeRadius > 15 ? (isExpanded ? "9" : "6") : "4.5"} 
                          fontWeight="bold"
                          textAnchor="middle" 
                          fontFamily="var(--font-sans)"
                          className="select-none pointer-events-none"
                        >
                          {isExpanded 
                            ? (cleanLabel.length > 15 ? cleanLabel.substring(0, 12) + "..." : cleanLabel)
                            : (cleanLabel.length > 9 ? cleanLabel.substring(0, 7) + "..." : cleanLabel)
                          }
                        </text>
                      )}
                      <title>{cleanLabel}</title>
                    </g>
                  );
                })}
              </g>
            </svg>
          ) : (
            <p className="text-xs theme-text-muted flex items-center justify-center h-full">Loading Neo4j Nodes...</p>
          )}
        </div>

        {/* Right Node Properties Inspector Panel (Only shown on expansion) */}
        {isExpanded && (
          <div className="w-[300px] border-l border-[var(--border-panel)] bg-[var(--bg-card-dark)]/60 flex flex-col p-5 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[var(--border-panel)] pb-3 mb-4">
              <h3 className="text-xs font-bold theme-text-primary uppercase tracking-wider flex items-center gap-1.5">
                Node Properties
              </h3>
              <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" className="text-gray-500">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>

            {selectedNode ? (
              <div className="space-y-4 text-xs font-mono">
                {/* Node Label Type Badge */}
                <div>
                  <span 
                    style={{ 
                      backgroundColor: getNodeColors(selectedNode.type).bg,
                      color: "#ffffff"
                    }}
                    className="px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider"
                  >
                    {selectedNode.type}
                  </span>
                </div>

                {/* Properties list */}
                <div className="space-y-3 pt-2">
                  {selectedNode.properties ? (
                    Object.entries(selectedNode.properties).map(([key, val]) => (
                      <div key={key} className="border-b border-[var(--border-panel)]/40 pb-2">
                        <div className="flex justify-between items-center text-[9px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">
                          <span>{key}</span>
                          <button 
                            onClick={() => navigator.clipboard.writeText(String(val))}
                            className="p-0.5 hover:bg-white/5 rounded text-gray-500 hover:text-white transition-colors"
                            title="Copy Value"
                          >
                            <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" strokeWidth="2" fill="none">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          </button>
                        </div>
                        <div className="theme-text-primary text-[10.5px] break-all select-all selection:bg-cyan-500/20">
                          {key === "aas_endpoint" || key === "aas_id" ? (
                            <a 
                              href={String(val)} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="text-cyan-400 hover:underline hover:text-cyan-300 break-all"
                            >
                              {String(val)}
                            </a>
                          ) : (
                            String(val)
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-[10px] text-gray-500 italic">No variables registered.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-[10px] theme-text-muted italic text-center">
                Click a database node symbol to view its metadata properties.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
