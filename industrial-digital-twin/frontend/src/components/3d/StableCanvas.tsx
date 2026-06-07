'use client';

import React, { memo, ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';

interface StableCanvasProps {
  children: ReactNode;
}

const StableCanvas = memo(({ children }: StableCanvasProps) => {
  return (
    <Canvas
      gl={{
        antialias: false,
        alpha: false,
        powerPreference: "high-performance",
        failIfMajorPerformanceCaveat: false,
        stencil: false,
        depth: true,
        preserveDrawingBuffer: false,
      }}
      dpr={1}
      shadows={false}
      camera={{ fov: 45, position: [0, 15, 30], near: 0.1, far: 10000 }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x0f172a);
      }}
    >
      {children}
    </Canvas>
  );
});

StableCanvas.displayName = 'StableCanvas';

export default StableCanvas;
