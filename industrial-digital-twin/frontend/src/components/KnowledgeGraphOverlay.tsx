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
  const { expandedPanel } = useDigitalTwin();
  const isExpanded = expandedPanel === "graph";

  const [data, setData] = useState<{ nodes: NodeItem[]; edges: EdgeItem[] } | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeItem | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    fetch("http://localhost:8000/api/graph/topology")
      .then(res => res.json())
      .then(topology => {
        setData(topology);
        
        // Group nodes into functional columns to create a clean left-to-right process flow layout
        const cols: Record<string, string[]> = {
          sensors: [],
          valves: [],
          pumps_etc: [],
          filters: [],
          tanks: [],
          others: []
        };

        topology.nodes.forEach((node: NodeItem) => {
          const id = node.id.toUpperCase();
          if (id.startsWith("SNS-") || node.type === "sensor") {
            cols.sensors.push(node.id);
          } else if (id.startsWith("VLV-") || node.type === "valve") {
            cols.valves.push(node.id);
          } else if (id.startsWith("PMP-") || id.startsWith("HEX-") || id.startsWith("MXR-") || node.type === "pump" || node.type === "mixer" || node.type === "heatexchanger") {
            cols.pumps_etc.push(node.id);
          } else if (id.startsWith("FLT-") || node.type === "filter") {
            cols.filters.push(node.id);
          } else if (id.startsWith("TNK-") || node.type === "tank") {
            cols.tanks.push(node.id);
          } else {
            cols.others.push(node.id);
          }
        });

        const activeCols = [
          cols.sensors,
          cols.valves,
          cols.pumps_etc,
          cols.filters,
          cols.tanks,
          cols.others
        ].filter(c => c.length > 0);

        const initialPositions: Record<string, { x: number; y: number }> = {};
        const totalCols = activeCols.length;
        
        const width = isExpanded ? 500 : 340; // Adjust graph width when expanded to fit properties panel
        const height = isExpanded ? 400 : 160;

        activeCols.forEach((colNodes, colIdx) => {
          // Evenly space columns across layout width
          const x = 35 + (colIdx * (width - 70)) / Math.max(1, totalCols - 1);
          const colSize = colNodes.length;
          
          colNodes.forEach((nodeId, nodeIdx) => {
            // Space out items vertically; center columns containing single nodes
            let y = height / 2;
            if (colSize > 1) {
              y = 28 + (nodeIdx * (height - 56)) / (colSize - 1);
            }
            initialPositions[nodeId] = { x, y };
          });
        });
        setPositions(initialPositions);

        // Auto select first node on expand
        if (topology.nodes.length > 0 && !selectedNode) {
          setSelectedNode(topology.nodes[0]);
        }
      })
      .catch(err => {
        console.error("Error loading Neo4j topology graph:", err);
      });
  }, [isExpanded]);

  const handleMouseDown = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDraggingNodeId(nodeId);
    
    // Set selected node on click
    const node = data?.nodes.find(n => n.id === nodeId);
    if (node) {
      setSelectedNode(node);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingNodeId || !svgRef.current) return;
    
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setPositions(prev => ({
      ...prev,
      [draggingNodeId]: { 
        x: Math.max(10, Math.min(rect.width - 10, x)), 
        y: Math.max(10, Math.min(rect.height - 10, y)) 
      }
    }));
  };

  const handleMouseUp = () => {
    setDraggingNodeId(null);
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

    // Radius of circular node is 20 (or 32 if expanded). Terminate lines exactly at circle boundaries.
    const nodeRadius = isExpanded ? 32 : 20;
    const padX1 = (dx / dist) * nodeRadius; 
    const padY1 = (dy / dist) * nodeRadius;
    const padX2 = (dx / dist) * (nodeRadius + 5); // Terminate 5px earlier for arrow head clearance
    const padY2 = (dy / dist) * (nodeRadius + 5);

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
          {data ? (
            <svg 
              ref={svgRef}
              width="100%" 
              height="100%" 
              viewBox={isExpanded ? "0 0 500 400" : "0 0 340 160"}
              className="w-full h-full cursor-grab active:cursor-grabbing"
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
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

              {/* Draw Relationships Edges */}
              {data.edges.map((edge, idx) => renderEdge(edge, idx))}

              {/* Draw Nodes (Circular Neo4j layout style) */}
              {data.nodes.map((node) => {
                const pos = positions[node.id];
                if (!pos) return null;

                // Dynamic coloring mapping matching Neo4j styles
                const colors = getNodeColors(node.type);

                // Split label text to display short tags inside circles neatly
                const cleanLabel = node.label.replace(/[\[\]]/g, "");
                const nodeRadius = isExpanded ? 32 : 20;
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
                    <text 
                      x="0" 
                      y={isExpanded ? "3" : "2"} 
                      fill="#ffffff" 
                      fontSize={isExpanded ? "9" : "6"} 
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
                    <title>{cleanLabel}</title>
                  </g>
                );
              })}
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
