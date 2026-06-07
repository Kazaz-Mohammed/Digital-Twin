'use client';

export default function Lighting() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[20, 30, 20]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
      />
      <directionalLight
        position={[-20, 20, -20]}
        intensity={0.5}
        color="#87ceeb"
      />
      <pointLight position={[0, 20, 0]} intensity={0.3} color="#e0f2fe" />
    </>
  );
}
