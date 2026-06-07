"use client";

import React, { Suspense } from "react";
import { OrbitControls, Html } from "@react-three/drei";
import StableCanvas from "./3d/StableCanvas";
import Lighting from "./3d/Lighting";
import Environment from "./3d/Environment";
import WastewaterPlant from "./3d/models/WastewaterPlant";

function LoadingModel() {
  return (
    <Html center>
      <div className="flex flex-col items-center justify-center text-white bg-slate-900/80 p-4 rounded-lg backdrop-blur-sm border border-slate-700 select-none min-w-[200px]">
        <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-2"></div>
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Loading 3D Model...</p>
        <p className="text-[10px] text-slate-400 mt-1 font-mono">This may take a moment</p>
      </div>
    </Html>
  );
}

export default function ThreeCanvas() {
  return (
    <div className="w-full h-full relative">
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
          maxPolarAngle={Math.PI / 2.1} // Prevent going under the floor/upside down
          screenSpacePanning={true} // Move right/left/up/down intuitively in screen space
        />

        <Suspense fallback={<LoadingModel />}>
          <WastewaterPlant />
        </Suspense>
      </StableCanvas>
    </div>
  );
}
