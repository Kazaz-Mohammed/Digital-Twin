"use client";

import React, { useState, useEffect } from "react";
import { useDigitalTwin, AssetNode, AAS_PLANT_NODES } from "../context/DigitalTwinContext";

interface BaSyxNode {
  id: string;
  name: string;
  status: string;
  tag?: string;
  children?: BaSyxNode[];
}

const FALLBACK_HIERARCHY: BaSyxNode = {
  id: "root",
  name: "Plant Root",
  status: "green",
  children: [
    {
      id: "main-station",
      name: "Main Station",
      status: "green",
      children: [
        {
          id: "intake-section",
          name: "Intake Section",
          status: "green",
          children: [
            { id: "urn:jesa:P01:Intake:Pump:P101", name: "Intake Pump P101", status: "green", tag: "P-101" },
            { id: "urn:jesa:P01:Filtration:Filter:F102", name: "Filter Unit 1", status: "green", tag: "F-102" }
          ]
        },
        {
          id: "pump-station",
          name: "Pump Station",
          status: "green"
        }
      ]
    },
    { id: "storage", name: "Storage", status: "green" },
    { id: "ro-system", name: "RO System", status: "green" },
    { id: "bottling-line", name: "Bottling Line", status: "green" }
  ]
};

const FolderIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1 align-middle text-cyan-500">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const FileIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1 align-middle text-cyan-400">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

interface BaSyxShell {
  id: string;
  idShort: string;
  assetInformation?: {
    assetKind: string;
    globalAssetId: string;
  };
}

interface BaSyxSubmodel {
  idShort: string;
  id: string;
  modelType: string;
  submodelElements: Array<{
    idShort: string;
    modelType: string;
    valueType?: string;
    value?: any;
  }>;
}

import QRCode from "qrcode";

const QrCodeIcon = ({ value }: { value: string }) => {
  const [qrUrl, setQrUrl] = useState<string>("");

  useEffect(() => {
    QRCode.toDataURL(
      value,
      {
        width: 100,
        margin: 1.5,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      },
      (err, url) => {
        if (!err) setQrUrl(url);
      }
    );
  }, [value]);

  if (!qrUrl) {
    return (
      <div className="w-[100px] h-[100px] bg-white rounded-lg flex items-center justify-center text-[8px] text-gray-400 font-mono mt-2">
        Generating QR...
      </div>
    );
  }

  return (
    <img 
      src={qrUrl} 
      alt="Dynamic Asset ID QR Code" 
      className="p-1 rounded-lg bg-white shadow-md mt-2 w-[100px] h-[100px]" 
    />
  );
};

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1 align-middle text-cyan-500">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const GlobeIcon = () => (
  <svg viewBox="0 0 24 24" width="11" height="11" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1 align-middle text-cyan-400">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" width="10" height="10" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1 align-middle text-gray-600">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

const FolderIconOrange = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" stroke="#ff9e64" strokeWidth="2" fill="none" className="inline mr-1 align-middle">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" fill="#ff9e64" fillOpacity="0.2" />
  </svg>
);

const FileIconOrange = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" stroke="#ff9e64" strokeWidth="2" fill="none" className="inline mr-1 align-middle">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="#ff9e64" fillOpacity="0.05" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

interface BaSyxHierarchyItemProps {
  node: BaSyxNode;
  depth: number;
  selectedShell: BaSyxShell | null;
  setSelectedShell: (shell: BaSyxShell | null) => void;
  shells: BaSyxShell[];
  setSelectedAsset: (asset: AssetNode) => void;
}

const BaSyxHierarchyItem: React.FC<BaSyxHierarchyItemProps> = ({
  node,
  depth,
  selectedShell,
  setSelectedShell,
  shells,
  setSelectedAsset
}) => {
  const hasChildren = node.children && node.children.length > 0;
  const [collapsed, setCollapsed] = useState(false);

  const isSelected = selectedShell && (selectedShell.idShort === node.tag || selectedShell.idShort === node.name || selectedShell.id === node.id);

  const handleNodeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) {
      setCollapsed(!collapsed);
    } else {
      const matchedShell = shells.find(s => s.idShort === node.tag || s.idShort === node.name || s.id === node.id);
      if (matchedShell) {
        setSelectedShell(matchedShell);
      } else {
        const tempShell: BaSyxShell = {
          id: node.id,
          idShort: node.tag || node.name,
          assetInformation: {
            assetKind: "Instance",
            globalAssetId: `https://jesa.ma/assets/${node.tag || node.name}`
          }
        };
        setSelectedShell(tempShell);
      }

      const matchingCtxNode = AAS_PLANT_NODES.find(n => n.tag === node.tag || n.id === node.id);
      if (matchingCtxNode) {
        setSelectedAsset(matchingCtxNode);
      }
    }
  };

  return (
    <div className="select-none">
      <div 
        onClick={handleNodeClick}
        style={{ paddingLeft: `${depth * 10}px` }}
        className={`flex items-center justify-between py-1 px-1.5 rounded cursor-pointer transition-colors group ${
          isSelected 
            ? "bg-[#00f0ff]/10 text-[#00f0ff] font-bold" 
            : "hover:bg-[var(--bg-card-dark)]/40 theme-text-primary"
        }`}
      >
        <div className="flex items-center gap-1 min-w-0">
          {hasChildren && (
            <span className="text-[8px] text-gray-500 mr-0.5 animate-none">
              {collapsed ? "▶" : "▼"}
            </span>
          )}
          {!hasChildren && <span className="w-2.5" />}
          {hasChildren ? <FolderIcon /> : <FileIcon />}
          <span className="truncate text-[10.5px] font-mono tracking-wide">{node.name}</span>
        </div>
        
        <span className="w-1.5 h-1.5 rounded-full bg-[#00e676] shadow-[0_0_6px_#00e676] shrink-0 ml-2" />
      </div>

      {hasChildren && !collapsed && (
        <div className="mt-0.5 space-y-0.5">
          {node.children!.map(child => (
            <BaSyxHierarchyItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedShell={selectedShell}
              setSelectedShell={setSelectedShell}
              shells={shells}
              setSelectedAsset={setSelectedAsset}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default function AasAssetTree() {
  const { selectedAsset, setSelectedAsset, expandedPanel } = useDigitalTwin();
  const isExpanded = expandedPanel === "aas";

  const [hierarchy, setHierarchy] = useState<BaSyxNode>(FALLBACK_HIERARCHY);
  const [shells, setShells] = useState<BaSyxShell[]>([]);
  const [selectedShell, setSelectedShell] = useState<BaSyxShell | null>(null);
  const [submodels, setSubmodels] = useState<BaSyxSubmodel[]>([]);
  const [selectedSubmodel, setSelectedSubmodel] = useState<BaSyxSubmodel | null>(null);
  const [selectedElement, setSelectedElement] = useState<any>(null);
  const [shellSearch, setShellSearch] = useState("");
  const [submodelSearch, setSubmodelSearch] = useState("");
  const [rightTab, setRightTab] = useState<"details" | "json">("details");

  // Fetch Shells and Hierarchy on mount with polling
  useEffect(() => {
    const fetchShells = () => {
      fetch("http://localhost:8000/api/aas/shells")
        .then(res => res.json())
        .then(data => {
          setShells(data);
          if (data.length > 0 && !selectedShell) {
            setSelectedShell(data[0]);
          }
        })
        .catch(err => console.error("Error loading AAS Shells:", err));
    };

    const fetchHierarchy = () => {
      fetch("http://localhost:8000/api/aas/hierarchy")
        .then(res => res.json())
        .then(data => {
          setHierarchy(data);
        })
        .catch(err => console.error("Error loading AAS Hierarchy:", err));
    };

    fetchShells();
    fetchHierarchy();

    const interval = setInterval(() => {
      fetchShells();
      fetchHierarchy();
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedShell]);

  // Fetch Submodels whenever selected shell changes
  useEffect(() => {
    if (!selectedShell) return;
    const cleanId = selectedShell.idShort;
    fetch(`http://localhost:8000/api/aas/shells/${cleanId}/submodels`)
      .then(res => res.json())
      .then(data => {
        setSubmodels(data);
        if (data.length > 0) {
          setSelectedSubmodel(data[0]);
          setSelectedElement(data[0]);
        }
      })
      .catch(err => console.error(`Error loading Submodels for ${cleanId}:`, err));
  }, [selectedShell]);

  // Filter shells based on search term
  const filteredShells = shells.filter(s => 
    s.idShort.toLowerCase().includes(shellSearch.toLowerCase())
  );

  if (!isExpanded) {
    return (
      <div className="dashboard-panel h-full flex flex-col overflow-hidden">
        <div className="dashboard-panel-header">
          <div>
            <h2 className="text-xs font-bold theme-text-primary uppercase tracking-wider">AAS Hierarchy</h2>
            <span className="text-[9px] theme-text-muted font-mono block mt-0.5">Eclipse BaSyx API Connection</span>
          </div>
        </div>

        {/* High-Fidelity Tree view replica of Eclipse BaSyx UI */}
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 py-1">
          <BaSyxHierarchyItem
            node={hierarchy}
            depth={0}
            selectedShell={selectedShell}
            setSelectedShell={setSelectedShell}
            shells={shells}
            setSelectedAsset={setSelectedAsset}
          />
        </div>
      </div>
    );
  }

  // Render Full 3-Column Expanded AAS Web UI Clone
  return (
    <div className="flex flex-col h-full w-full bg-[#0f1015] text-[#b9bbbe] font-sans text-xs">
      
      {/* AAS Web UI Inner header */}
      <div className="h-10 border-b border-[#202225] bg-[#18191d] flex items-center justify-between px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
        <span>Eclipse BaSyx AAS Management Environment</span>
        <span className="text-cyan-500 font-mono">v3.0.0-milestone-03</span>
      </div>

      <div className="flex-1 flex min-h-0 bg-[#0f1015]">
        
        {/* Column 1: Shells Panel (Width: 28%) */}
        <div className="w-[28%] border-r border-[#202225] flex flex-col p-3 bg-[#111215]">
          <div className="mb-3">
            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Search for AAS...</span>
            <input 
              type="text" 
              placeholder={`${shells.length} Shells`}
              value={shellSearch}
              onChange={(e) => setShellSearch(e.target.value)}
              className="w-full bg-[#18191d] border border-[#202225] rounded p-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-orange-500 font-mono"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {filteredShells.map(s => {
              const isSel = selectedShell?.idShort === s.idShort;
              return (
                <div 
                  key={s.idShort}
                  onClick={() => setSelectedShell(s)}
                  className={`p-2.5 rounded border cursor-pointer transition-all ${
                    isSel 
                      ? "bg-orange-500/10 border-orange-500/40 text-orange-400" 
                      : "bg-[#18191d] border-[#202225] hover:border-gray-700 text-gray-300"
                  }`}
                >
                  <div className="font-bold text-xs">{s.idShort}</div>
                  <div className="text-[9px] text-gray-500 truncate mt-0.5 font-mono">{s.id}</div>
                </div>
              );
            })}
          </div>

          {/* QR Code and Shell Metadata */}
          {selectedShell && (
            <div className="border-t border-[#202225] pt-3 mt-3 flex flex-col items-center gap-2">
              <div className="text-left w-full space-y-1 font-mono text-[9px] text-gray-500">
                <div className="flex items-center gap-1"><CalendarIcon /> 2026-04-01 14:46:24</div>
                <div className="flex items-center gap-1 min-w-0"><GlobeIcon /> <span className="font-bold text-gray-400 shrink-0">Global ID:</span> <span className="truncate">{selectedShell.assetInformation?.globalAssetId || `https://jesa.ma/assets/${selectedShell.idShort}`}</span></div>
              </div>
              <QrCodeIcon value={selectedShell.assetInformation?.globalAssetId || `https://jesa.ma/assets/${selectedShell.idShort}`} />
              <span className="text-[8px] font-bold text-gray-600 uppercase tracking-wider mt-1">Global Asset ID QR-Code</span>
            </div>
          )}
        </div>

        {/* Column 2: Submodels Tree (Width: 32%) */}
        <div className="w-[32%] border-r border-[#202225] flex flex-col p-3 bg-[#111215]">
          <div className="mb-3">
            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Search for SM/SME...</span>
            <input 
              type="text" 
              placeholder={`${submodels.length} Submodels`}
              value={submodelSearch}
              onChange={(e) => setSubmodelSearch(e.target.value)}
              className="w-full bg-[#18191d] border border-[#202225] rounded p-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-orange-500 font-mono"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs select-none">
            {submodels.map(sm => {
              const isSmSel = selectedElement?.idShort === sm.idShort;
              return (
                <div key={sm.idShort} className="space-y-1.5">
                  <div 
                    onClick={() => {
                      setSelectedSubmodel(sm);
                      setSelectedElement(sm);
                    }}
                    className={`flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors ${
                      isSmSel ? "bg-[#ff9e64]/10 text-[#ff9e64] font-bold" : "hover:bg-[#18191d] text-gray-300"
                    }`}
                  >
                    <span className="flex items-center">
                      <FolderIconOrange />
                      <span className="font-mono">{sm.idShort}</span>
                    </span>
                    <span className="text-[7.5px] bg-[#ff9e64]/10 text-[#ff9e64] px-1 rounded border border-[#ff9e64]/20 font-bold">Submodel</span>
                  </div>

                  <div className="ml-3 pl-3 border-l border-[#202225] space-y-1">
                    {sm.submodelElements.map(el => {
                      const isElSel = selectedElement?.idShort === el.idShort && selectedSubmodel?.idShort === sm.idShort;
                      const isColl = el.modelType === "SubmodelElementCollection";
                      return (
                        <div key={el.idShort} className="space-y-1">
                          <div 
                            onClick={() => {
                              setSelectedSubmodel(sm);
                              setSelectedElement(el);
                            }}
                            className={`flex items-center justify-between p-1 rounded cursor-pointer transition-colors ${
                              isElSel ? "bg-[#ff9e64]/15 text-[#ff9e64] font-bold" : "hover:bg-[#18191d]/60 text-gray-400"
                            }`}
                          >
                            <span className="flex items-center">
                              {isColl ? <FolderIconOrange /> : <FileIconOrange />}
                              <span className="font-mono">{el.idShort}</span>
                            </span>
                            <span className="text-[7px] text-gray-600 bg-black/20 px-1 rounded font-sans truncate max-w-[80px]">
                              {isColl ? "Collection" : el.modelType}
                            </span>
                          </div>

                          {isColl && isElSel && Array.isArray(el.value) && (
                            <div className="ml-3 pl-3 border-l border-orange-500/20 space-y-1">
                              {el.value.map((nested: any) => (
                                <div 
                                  key={nested.idShort}
                                  onClick={() => {
                                    setSelectedSubmodel(sm);
                                    setSelectedElement(nested);
                                  }}
                                  className="flex items-center justify-between p-1 hover:bg-[#18191d]/60 rounded text-gray-500 cursor-pointer font-mono"
                                >
                                  <span className="flex items-center gap-1">
                                    <FileIconOrange />
                                    <span>{nested.idShort}</span>
                                  </span>
                                  <span className="text-[7px] text-orange-400 bg-orange-500/5 px-1 rounded">Element</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Column 3: Detail Workspace Panel (Width: 40%) */}
        <div className="w-[40%] flex flex-col p-3 bg-[#15161b]">
          {/* Detail Tabs bar */}
          <div className="flex border-b border-[#202225] pb-2 mb-3 bg-[#111215]/40 p-0.5 rounded">
            {[
              { id: "details", label: "Element Details" },
              { id: "json", label: "JSON Raw Data" }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setRightTab(tab.id as any)}
                className={`flex-1 py-1 text-[9px] uppercase tracking-wider font-bold rounded transition-colors ${
                  rightTab === tab.id ? "bg-orange-500 text-white" : "text-gray-550 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto pr-1">
            {selectedElement ? (
              rightTab === "details" ? (
                <div className="space-y-4">
                  <div className="border-b border-[#202225] pb-2">
                    <h3 className="text-sm font-bold text-orange-400 font-mono">{selectedElement.idShort}</h3>
                    <span className="text-[8px] bg-[#ff9e64]/10 text-[#ff9e64] px-1.5 py-0.5 rounded border border-[#ff9e64]/20 font-bold uppercase tracking-wider inline-block mt-1">
                      {selectedElement.modelType || "Submodel"}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {/* Render details based on Element type */}
                    {selectedElement.submodelElements ? (
                      // Render Submodel Properties List
                      <div className="space-y-3 font-mono">
                        {selectedElement.submodelElements.map((el: any) => (
                          <div key={el.idShort} className="bg-[#18191d] border border-[#202225] rounded p-2.5 flex flex-col gap-1">
                            <div className="text-[9px] text-gray-500 uppercase tracking-widest">{el.idShort}</div>
                            <div className="text-xs text-white font-bold">{String(el.value)}</div>
                            <div className="text-[8px] text-cyan-500 mt-0.5">{el.modelType} • {el.valueType || "xs:string"}</div>
                          </div>
                        ))}
                      </div>
                    ) : selectedElement.modelType === "SubmodelElementCollection" && Array.isArray(selectedElement.value) ? (
                      // Render Nested Collection Items
                      <div className="space-y-2.5 font-mono">
                        {selectedElement.value.map((child: any) => (
                          <div key={child.idShort} className="bg-[#18191d] border border-[#202225] rounded p-2 flex flex-col gap-0.5">
                            <div className="text-[9px] text-orange-400">{child.idShort}</div>
                            <div className="text-xs text-gray-300 font-bold">{child.modelType || "Property"}</div>
                            {Array.isArray(child.value) && (
                              <div className="text-[8px] text-cyan-400 font-sans mt-0.5">{child.value.length} child elements</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      // Render Leaf node details
                      <div className="bg-[#18191d] border border-[#202225] rounded p-3 space-y-2 font-mono">
                        <div>
                          <span className="text-[9px] text-gray-500 block uppercase">Key Short</span>
                          <span className="text-xs text-white font-bold">{selectedElement.idShort}</span>
                        </div>
                        {selectedElement.value !== undefined && (
                          <div>
                            <span className="text-[9px] text-gray-500 block uppercase">Current Value</span>
                            <span className="text-xs text-orange-400 font-bold break-all">{String(selectedElement.value)}</span>
                          </div>
                        )}
                        {selectedElement.valueType && (
                          <div>
                            <span className="text-[9px] text-gray-500 block uppercase">Value Type</span>
                            <span className="text-xs text-cyan-400">{selectedElement.valueType}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                // JSON Tab
                <pre className="bg-[#111215] border border-[#202225] rounded p-3 text-[10px] text-cyan-400 font-mono overflow-x-auto selection:bg-cyan-500/20 whitespace-pre-wrap leading-normal">
                  {JSON.stringify(selectedElement, null, 2)}
                </pre>
              )
            ) : (
              <div className="h-full flex items-center justify-center text-[10px] text-gray-500 italic text-center">
                Select a submodel node from the list to view elements.
              </div>
            )}
          </div>

          <div className="border-t border-[#202225] pt-2 mt-3 text-[9px] text-gray-600 font-mono text-center flex items-center justify-center gap-1">
            <RefreshIcon /> Last sync: 2026-04-01 14:46:24
          </div>
        </div>

      </div>
    </div>
  );
}
