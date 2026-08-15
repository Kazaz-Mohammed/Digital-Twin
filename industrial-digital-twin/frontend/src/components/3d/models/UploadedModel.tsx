'use client';

import { useMemo } from 'react';
import * as THREE from 'three';

interface UploadedModelProps {
  model: THREE.Group;
}

export default function UploadedModel({ model }: UploadedModelProps) {
  useMemo(() => {
    if (!model) return;

    // Reset transform before calculations
    model.rotation.set(0, 0, 0);
    model.position.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    model.updateMatrixWorld(true);

    // Compute bounding box
    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    // Auto-scale model if it is excessively large or small
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      // Aim for a bounding box dimension of ~25 units
      const targetScale = 25 / maxDim;
      model.scale.setScalar(targetScale);
      model.updateMatrixWorld(true);
    }

    // Re-compute bounding box with the new scale
    const scaledBox = new THREE.Box3().setFromObject(model);
    const scaledCenter = new THREE.Vector3();
    scaledBox.getCenter(scaledCenter);

    // Center and place base on Y=0
    model.position.x = -scaledCenter.x;
    model.position.z = -scaledCenter.z;
    model.position.y = -scaledBox.min.y;

    // Standardize materials
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        
        if (child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((m) => {
            if ('metalness' in m) m.metalness = 0.2;
            if ('roughness' in m) m.roughness = 0.8;
          });
        }
      }
    });
  }, [model]);

  return (
    <primitive 
      object={model} 
      position={[0, 0, 0]} 
    />
  );
}
