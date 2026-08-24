import React, { Suspense, useState, useRef, useEffect } from "react";
import { OrbitControls, Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useDigitalTwin } from "../context/DigitalTwinContext";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";
import StableCanvas from "./3d/StableCanvas";
import Lighting from "./3d/Lighting";
import Environment from "./3d/Environment";
import WastewaterPlant from "./3d/models/WastewaterPlant";
import UploadedModel from "./3d/models/UploadedModel";

function LoadingModel({ message = "Loading 3D Model..." }: { message?: string }) {
  return (
    <Html center>
      <div className="flex flex-col items-center justify-center text-white bg-slate-900/80 p-4 rounded-lg backdrop-blur-sm border border-slate-700 select-none min-w-[200px] z-50">
        <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-2"></div>
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">{message}</p>
        <p className="text-[10px] text-slate-400 mt-1 font-mono">This may take a moment</p>
      </div>
    </Html>
  );
}

function CameraManager() {
  const { camera, controls } = useThree();
  const { cameraAction } = useDigitalTwin();

  useEffect(() => {
    if (!cameraAction || !controls) return;

    const orbit = controls as any;
    switch (cameraAction.type) {
      case "orbit-up":
        orbit.polarAngle = Math.max(0.1, orbit.polarAngle - 0.15);
        break;
      case "pan-down":
        orbit.target.y -= 1.5;
        camera.position.y -= 1.5;
        break;
      case "orbit-left":
        orbit.azimuthAngle -= 0.15;
        break;
      case "zoom-in":
        camera.position.sub(orbit.target).multiplyScalar(0.85).add(orbit.target);
        break;
      case "reset":
        camera.position.set(0, 15, 30);
        orbit.target.set(0, 0, 0);
        break;
      case "view-1":
        camera.position.set(40.25, 4.86, 34.47);
        orbit.target.set(0.00, 0.00, 0.00);
        break;
      default:
        break;
    }
    orbit.update();
  }, [cameraAction, camera, controls]);

  return null;
}



interface Hotspot {
  id: string;
  name: string;
  position: [number, number, number];
  type: "pump" | "tank";
}

const HOTSPOTS: Hotspot[] = [
  { id: "PMP-001", name: "Inlet Feed Pump (PMP-001)", position: [35.5, 2.2, 29.0], type: "pump" },
  { id: "PMP-002", name: "Outlet Transfer Pump (PMP-002)", position: [32.12, 1.2, 26.88], type: "pump" },
  { id: "TK-001", name: "Process Buffer Tank (TK-001)", position: [32.04, 2.5, 22.88], type: "tank" },
];

export default function ThreeCanvas() {
  const { 
    uploadedModel, 
    setUploadedModel, 
    uploadedModelName, 
    setUploadedModelName,
    telemetry,
    simStatus
  } = useDigitalTwin();

  const [isLoading, setIsLoading] = useState(false);
  const [selectedHotspot, setSelectedHotspot] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadedModelName(file.name);
    setIsLoading(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      const contents = e.target?.result;
      if (!contents) {
        setIsLoading(false);
        return;
      }

      const loader = new FBXLoader();
      try {
        const object = loader.parse(contents, "");
        setUploadedModel(object);
        setIsLoading(false);
      } catch (error) {
        console.error("Error parsing FBX file:", error);
        alert("Failed to parse FBX model. Make sure it is a valid binary or ASCII FBX file.");
        setUploadedModelName(null);
        setUploadedModel(null);
        setIsLoading(false);
      }
    };

    reader.onerror = () => {
      alert("Error reading file.");
      setIsLoading(false);
    };

    reader.readAsArrayBuffer(file);
  };

  const handleReset = () => {
    setUploadedModel(null);
    setUploadedModelName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="w-full h-full relative">
      {/* Floating Upload controls (Bottom Center/Right overlay) */}
      <div className="absolute bottom-4 right-4 z-30 flex flex-col gap-2 bg-slate-900/90 border border-slate-700/80 p-3 rounded shadow-lg backdrop-blur-md max-w-xs text-white">
        <div className="text-[10px] uppercase font-mono tracking-widest text-slate-400 mb-1">
          3D Model Controller
        </div>

        {uploadedModelName ? (
          <div className="flex flex-col gap-1.5">
            <div className="text-xs truncate font-medium text-emerald-400" title={uploadedModelName}>
              📄 {uploadedModelName}
            </div>
            <button
              onClick={handleReset}
              className="w-full px-3 py-1.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded text-[10px] font-bold uppercase transition-colors"
            >
              Reset to Default Plant
            </button>
          </div>
        ) : (
          <div>
            <input
              type="file"
              accept=".fbx"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 active:bg-cyan-800 text-white rounded text-xs font-bold uppercase tracking-wide transition-colors flex items-center justify-center gap-2"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
              </svg>
              Upload FBX Model
            </button>
          </div>
        )}
      </div>

      <StableCanvas>
        <Lighting />
        <Environment />
        <CameraManager />
        <OrbitControls 
          makeDefault
          enableDamping 
          dampingFactor={0.05}
          autoRotate={false}
          minDistance={1}
          maxDistance={5000}
          maxPolarAngle={Math.PI / 2.1}
          screenSpacePanning={true}
          onEnd={(e: any) => {
            const controls = e.target;
            console.log(`CURRENT_CAMERA_VIEWPOINT: position=[${controls.object.position.x.toFixed(2)}, ${controls.object.position.y.toFixed(2)}, ${controls.object.position.z.toFixed(2)}] target=[${controls.target.x.toFixed(2)}, ${controls.target.y.toFixed(2)}, ${controls.target.z.toFixed(2)}]`);
          }}
        />

        {isLoading && <LoadingModel message="Parsing FBX Model..." />}

        {/* 3D Hotspot Overlays */}
        {!isLoading && HOTSPOTS.map((hotspot) => (
          <Html key={hotspot.id} position={hotspot.position} center>
            <div className="relative flex flex-col items-center select-none font-sans pointer-events-auto">
              
              {/* Glowing marker dot (scaled down to match equipment size) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedHotspot(selectedHotspot === hotspot.id ? null : hotspot.id);
                }}
                className="relative group cursor-pointer flex items-center justify-center w-4 h-4 rounded-full border border-cyan-500/40 bg-slate-950/90 hover:bg-cyan-500/30 transition-colors focus:outline-none"
              >
                {/* Outer pulsing ring */}
                <span className="absolute w-2.5 h-2.5 rounded-full bg-cyan-500/40 animate-ping opacity-75" />
                {/* Inner glowing core */}
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 border border-white shadow-md shadow-cyan-500/50" />
                
                {/* Floating equipment small text tag */}
                <span className="absolute bottom-5 bg-slate-900/95 border border-slate-700/80 px-1.5 py-0.5 rounded text-[7px] font-bold text-cyan-400 uppercase tracking-wider shadow-md whitespace-nowrap opacity-75 group-hover:opacity-100 transition-opacity">
                  {hotspot.id}
                </span>
              </button>

              {/* Telemetry Popup Card */}
              {selectedHotspot === hotspot.id && (
                <div 
                  onClick={(e) => e.stopPropagation()}
                  className="absolute left-5 top-0 w-52 bg-slate-950/95 border border-cyan-500/30 p-3 rounded-xl shadow-2xl backdrop-blur-md text-white z-50 text-xs font-sans animate-in fade-in zoom-in-95 duration-200"
                >
                  <div className="flex justify-between items-center border-b border-slate-800/60 pb-1.5 mb-1.5">
                    <h4 className="font-bold text-cyan-400 text-[8.5px] uppercase tracking-wider truncate mr-2">{hotspot.name}</h4>
                    <button 
                      onClick={() => setSelectedHotspot(null)}
                      className="text-slate-400 hover:text-white font-bold px-0.5"
                    >
                      ✕
                    </button>
                  </div>

                  {hotspot.type === "pump" ? (
                    <div className="space-y-1.5 font-mono text-[10px]">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Speed:</span>
                        <span className="text-emerald-400 font-bold">
                          {simStatus 
                            ? (hotspot.id === "PMP-001" ? simStatus.pmp001?.speed_rpm : simStatus.pmp002?.speed_rpm)?.toFixed(0) + " RPM"
                            : "0 RPM"
                          }
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Nominal Voltage:</span>
                        <span className="text-slate-200">
                          {simStatus 
                            ? (hotspot.id === "PMP-001" ? simStatus.pmp001?.voltage_v : simStatus.pmp002?.voltage_v)?.toFixed(1) + " V"
                            : "400.0 V"
                          }
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Active Power:</span>
                        <span className="text-amber-400 font-bold">
                          {simStatus
                            ? (hotspot.id === "PMP-001" ? simStatus.pmp001?.power_kw : simStatus.pmp002?.power_kw)?.toFixed(2) + " kW"
                            : "0.00 kW"
                          }
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Discharge Head:</span>
                        <span className="text-cyan-400 font-bold">
                          {simStatus
                            ? (hotspot.id === "PMP-001" ? simStatus.pmp001?.pressure_bar : simStatus.pmp002?.pressure_bar)?.toFixed(2) + " bar"
                            : "0.00 bar"
                          }
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Temperature:</span>
                        <span className="text-orange-400 font-bold">
                          {simStatus
                            ? (hotspot.id === "PMP-001" ? simStatus.pmp001?.temperature_c : simStatus.pmp002?.temperature_c)?.toFixed(1) + " °C"
                            : "0.0 °C"
                          }
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Bearing wear:</span>
                        <span className={simStatus?.pmp001?.bearing_wear && hotspot.id === "PMP-001" ? "text-red-500 font-bold animate-pulse" : "text-emerald-400 font-bold"}>
                          {simStatus?.pmp001?.bearing_wear && hotspot.id === "PMP-001" ? "ANOMALY (HIGH)" : "HEALTHY"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5 font-mono text-[10px]">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Fill level:</span>
                        <span className="text-cyan-400 font-bold">
                          {simStatus ? simStatus.lit001_pct.toFixed(1) + " %" : "0.0 %"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Max Capacity:</span>
                        <span className="text-slate-200">
                          {simStatus ? simStatus.tank_max_capacity.toFixed(1) + " L" : "1000.0 L"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Liquid volume:</span>
                        <span className="text-orange-400 font-bold">
                          {simStatus ? simStatus.tank_level.toFixed(1) + " L" : "0.0 L"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Html>
        ))}

        <Suspense fallback={<LoadingModel />}>
          {uploadedModel ? (
            <UploadedModel model={uploadedModel} />
          ) : (
            <WastewaterPlant />
          )}
        </Suspense>
      </StableCanvas>
    </div>
  );
}
