"use client";

import React, { Suspense, useState, useRef } from "react";
import { OrbitControls, Html } from "@react-three/drei";
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

export default function ThreeCanvas() {
  const { 
    uploadedModel, 
    setUploadedModel, 
    uploadedModelName, 
    setUploadedModelName 
  } = useDigitalTwin();

  const [isLoading, setIsLoading] = useState(false);
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
        <OrbitControls 
          makeDefault
          enableDamping 
          dampingFactor={0.05}
          autoRotate={false}
          minDistance={1}
          maxDistance={5000}
          maxPolarAngle={Math.PI / 2.1}
          screenSpacePanning={true}
        />

        {isLoading && <LoadingModel message="Parsing FBX Model..." />}

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
