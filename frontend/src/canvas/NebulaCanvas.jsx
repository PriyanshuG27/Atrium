import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { usePerf } from '../context/PerfContext';


/* ============================================================
   NebulaCanvas — R3F constellation sky.

   Tags are star-words floating in 3D space.
   Brownian particle field provides atmosphere.
   On hover: constellation threads ignite (100% opacity),
   orbiting star points appear.
   Fast mouse movement triggers shockwave rings.
   ============================================================ */

const PARTICLE_COUNT = 1200;

/* ── Fibonacci spiral layout for tags ───────────────────────────────────── */
function getTagPosition(index) {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const radius = 1.0 + Math.sqrt(index) * 1.35;
  const angle = index * goldenAngle;
  // Deterministic seeded "random" for z so positions are stable
  const z = ((Math.sin(index * 127.1) + 1) / 2 - 0.5) * 4;
  return [
    Math.cos(angle) * radius,
    Math.sin(angle) * radius * 0.55,
    z,
  ];
}

/* ── Brownian particle field ─────────────────────────────────────────────── */
function ParticleField({ count = PARTICLE_COUNT }) {
  const pointsRef = useRef();

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Deterministic positions using index-based seeding
      pos[i * 3]     = (Math.sin(i * 127.1 + 1) * 0.5 + 0.5) * 60 - 30;
      pos[i * 3 + 1] = (Math.sin(i * 311.7 + 2) * 0.5 + 0.5) * 40 - 20;
      pos[i * 3 + 2] = (Math.sin(i * 74.3  + 3) * 0.5 + 0.5) * 30 - 15;
    }
    return pos;
  }, [count]);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    const t = clock.getElapsedTime();
    pointsRef.current.rotation.y = t * 0.01;
    pointsRef.current.rotation.x = Math.sin(t * 0.007) * 0.05;
  });

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [positions]);

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        color="#F4EFEB"
        size={0.06}
        transparent
        opacity={0.18}
        sizeAttenuation
      />
    </points>
  );
}

/* ── Tag star word ──────────────────────────────────────────────────────── */
function TagStar({ tag, tagIndex, isHovered, isSelected, onHover, onClick }) {
  const groupRef = useRef();
  const phase = useMemo(() => Math.sin(tagIndex * 127.1) * Math.PI, [tagIndex]);
  const driftPeriod = useMemo(() => 6 + (tagIndex % 5) * 1.2, [tagIndex]);
  const basePos = useMemo(() => new THREE.Vector3(...getTagPosition(tagIndex)), [tagIndex]);
  const { mouse, viewport } = useThree();

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.getElapsedTime();

    // Breathe ±3% scale
    const breathe = 1 + Math.sin(t * 0.8 + phase) * 0.03;

    // Slow drift ±0.25 units
    const driftX = Math.sin(t / driftPeriod + phase) * 0.25;
    const driftY = Math.cos(t / (driftPeriod * 1.3) + phase) * 0.25;

    // Cursor lean within 4 world units
    const worldX = mouse.x * viewport.width * 0.5;
    const worldY = mouse.y * viewport.height * 0.5;
    const dx = worldX - basePos.x;
    const dy = worldY - basePos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const lean = dist < 4 ? (1 - dist / 4) * 0.35 : 0;

    groupRef.current.position.x = basePos.x + driftX + dx * lean;
    groupRef.current.position.y = basePos.y + driftY + dy * lean;
    groupRef.current.position.z = basePos.z;
    groupRef.current.scale.setScalar(breathe * (isHovered ? 1.2 : 1));
  });

  // Size proportional to tag weight (item count), 12px to 38px
  const weight = Math.min(tag.items?.length || 1, 20);
  const size = 12 + (weight / 20) * 26;

  return (
    <group ref={groupRef}>
      <Html center distanceFactor={10}>
        <div
          onMouseEnter={() => onHover(tag)}
          onMouseLeave={() => onHover(null)}
          onClick={() => onClick(tag)}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: `${size}px`,
            fontWeight: isHovered ? 600 : 400,
            color: isHovered || isSelected ? 'var(--accent-gold)' : 'var(--text-muted)',
            textShadow: isHovered
              ? '0 0 20px rgba(207,163,101,0.8), 0 0 40px rgba(207,163,101,0.4)'
              : '0 0 8px rgba(244,239,235,0.15)',
            cursor: 'pointer',
            transition: 'color 0.2s ease, text-shadow 0.2s ease',
            userSelect: 'none',
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
            padding: '4px',
          }}
        >
          {tag.name}
        </div>
      </Html>
    </group>
  );
}

/* ── Constellation thread line ──────────────────────────────────────────── */
function ThreadLine({ start, end, opacity = 0.65 }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...start),
      new THREE.Vector3(...end),
    ]);
    return geo;
  }, [start[0], start[1], start[2], end[0], end[1], end[2]]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#CFA365" transparent opacity={opacity} />
    </lineSegments>
  );
}

/* ── Constellation threads for a tag star ── */
function ConstellationThreads({ tag, tagIndex, isHovered, lowPerf }) {
  const tagItems = tag?.items || [];
  const tagPos = useMemo(() => getTagPosition(tagIndex), [tagIndex]);

  // Render fewer items when not hovered or on low performance to protect framerate
  const itemsLimit = isHovered ? 12 : lowPerf ? 2 : 4;

  const itemPositions = useMemo(() => {
    return tagItems.slice(0, itemsLimit).map((_, i) => {
      const angle = (i / Math.max(tagItems.slice(0, itemsLimit).length, 1)) * Math.PI * 2;
      const r = isHovered 
        ? 1.8 + (i % 3) * 0.45 
        : 1.0 + (i % 2) * 0.25; // tighter orbits when inactive
      return [
        tagPos[0] + Math.cos(angle) * r,
        tagPos[1] + Math.sin(angle) * r * 0.7,
        tagPos[2],
      ];
    });
  }, [tagItems.length, tagPos, isHovered, itemsLimit]);

  if (tagItems.length === 0) return null;

  const threadOpacity = isHovered ? 0.65 : 0.05;
  const starOpacity = isHovered ? 0.8 : 0.12;

  return (
    <>
      {itemPositions.map((itemPos, i) => (
        <ThreadLine key={i} start={tagPos} end={itemPos} opacity={threadOpacity} />
      ))}
      {/* Orbiting star points */}
      {itemPositions.map((pos, i) => (
        <mesh key={`star-${i}`} position={pos}>
          <sphereGeometry args={[0.05, 6, 6]} />
          <meshBasicMaterial color="#CFA365" transparent opacity={starOpacity} />
        </mesh>
      ))}
    </>
  );
}

/* ── Shockwave ring ──────────────────────────────────────────────────────── */
function RingMesh({ x, y, born }) {
  const meshRef = useRef();

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const age = clock.getElapsedTime() - born;
    const progress = Math.min(age / 1.0, 1);
    meshRef.current.scale.setScalar(0.1 + progress * 3.5);
    meshRef.current.material.opacity = (1 - progress) * 0.35;
  });

  return (
    <mesh ref={meshRef} position={[x, y, 0]}>
      <ringGeometry args={[0.9, 1.0, 32]} />
      <meshBasicMaterial color="#CFA365" transparent opacity={0.35} side={THREE.DoubleSide} />
    </mesh>
  );
}

function ShockwaveRings() {
  const { mouse, viewport } = useThree();
  const lastMouse = useRef({ x: 0, y: 0, time: 0 });
  const [rings, setRings] = useState([]);

  useFrame(({ clock }) => {
    const now = clock.getElapsedTime();
    const mx = mouse.x * viewport.width * 0.5;
    const my = mouse.y * viewport.height * 0.5;
    const last = lastMouse.current;
    const dt = Math.max(now - last.time, 0.016);
    const dx = mx - last.x;
    const dy = my - last.y;
    const speed = Math.sqrt(dx * dx + dy * dy) / dt;

    if (speed > 12 && now - last.time > 0.25) {
      setRings(prev => [...prev.slice(-4), { id: now, x: mx, y: my, born: now }]);
    }
    lastMouse.current = { x: mx, y: my, time: now };

    // Decay old rings
    setRings(prev => prev.filter(r => now - r.born < 1.2));
  });

  return (
    <>
      {rings.map(ring => (
        <RingMesh key={ring.id} x={ring.x} y={ring.y} born={ring.born} />
      ))}
    </>
  );
}

/* ── Full Nebula scene ───────────────────────────────────────────────────── */
function NebulaScene({ tags, onTagClick, selectedTag, lowPerf }) {
  const [hoveredTag, setHoveredTag] = useState(null);
  const [hoveredTagIndex, setHoveredTagIndex] = useState(-1);

  const handleHover = useCallback((tag, index) => {
    setHoveredTag(tag);
    setHoveredTagIndex(tag ? index : -1);
  }, []);

  return (
    <>
      <ParticleField count={lowPerf ? 400 : PARTICLE_COUNT} />
      {!lowPerf && <ShockwaveRings />}
      {tags.map((tag, i) => {
        const isHovered = hoveredTag?.name === tag.name;
        return (
          <group key={tag.name}>
            <TagStar
              tag={tag}
              tagIndex={i}
              isHovered={isHovered}
              isSelected={selectedTag?.name === tag.name}
              onHover={(t) => handleHover(t, t ? i : -1)}
              onClick={onTagClick}
            />
            <ConstellationThreads
              tag={tag}
              tagIndex={i}
              isHovered={isHovered}
              lowPerf={lowPerf}
            />
          </group>
        );
      })}
    </>
  );
}


/* ── Main export ─────────────────────────────────────────────────────────── */
export default function NebulaCanvas({ tags, items, loading, onTagClick, selectedTag }) {
  const { lowPerf } = usePerf();
  if (loading && tags.length === 0) {
    return (
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '0.75rem',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          border: '2px solid rgba(207,163,101,0.2)',
          borderTopColor: 'var(--accent-gold)',
          animation: 'spin 1s linear infinite',
        }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
          MAPPING CONSTELLATION…
        </span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <Canvas
      camera={{ position: [0, 0, 12], fov: 60 }}
      style={{ background: 'transparent', position: 'absolute', inset: 0 }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.1} />
      {tags.length > 0 && (
        <NebulaScene
          tags={tags}
          onTagClick={onTagClick}
          selectedTag={selectedTag}
          lowPerf={lowPerf}
        />
      )}
    </Canvas>
  );
}
