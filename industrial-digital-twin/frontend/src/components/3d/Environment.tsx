'use client';

import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Color, Fog } from 'three';

export default function Environment() {
  const { scene } = useThree();

  useEffect(() => {
    try {
      scene.background = new Color(0x0f172a);
      scene.fog = new Fog(0x1e293b, 50, 200);
    } catch (error) {
      console.error('[v0] Error setting scene environment:', error);
    }
  }, [scene]);

  return null;
}
