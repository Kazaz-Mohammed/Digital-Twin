'use client';

import { useFBX } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';

export default function WastewaterPlant() {
  const fbx = useFBX('/C-20252990G03-P-DRW-004_A1 3D Modelling _ All area 1.fbx');

  useMemo(() => {
    fbx.rotation.x = -Math.PI / 2;
    fbx.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(fbx);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    
    fbx.position.x = -center.x;
    fbx.position.z = -center.z;
    fbx.position.y = -box.min.y;
    
    console.log('Model Size after Rotation:', size);
    console.log('Model Rotated and Aligned to Y=0');

    fbx.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => {
              if ('metalness' in m) m.metalness = 0.2;
              if ('roughness' in m) m.roughness = 0.8;
            });
          } else {
            if ('metalness' in child.material) child.material.metalness = 0.2;
            if ('roughness' in child.material) child.material.roughness = 0.8;
          }
        }
      }
    });
  }, [fbx]);

  return (
    <primitive 
      object={fbx} 
      scale={1}
      position={[0, 0, 0]} 
    />
  );
}
