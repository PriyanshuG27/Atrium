import React, { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import NodeHoverCard from './NodeHoverCard';

/* ============================================================
   GraphNode3D — A single node in the 3D graph.

   Hub nodes:
     • Larger sphere with emissive glow
     • 2 concentric torusGeometry rings rotating in opposite directions
     • A point light underneath (illuminates cluster in hub colour)
     • Member nodes orbit the hub slowly

   All nodes:
     • Breathe (sinusoidal scale pulse)
     • Lean toward cursor (visual gravity field, max ±5 units)
     • Show NodeHoverCard on hover
     • Click fires onNodeClick
   ============================================================ */

// ── Source colours (match theme.css / worker.py) ─────────────────────────────
const SOURCE_COLORS = {
  url:   '#7C6FD4',
  voice: '#3DAA8A',
  pdf:   '#C9893C',
  image: '#3D8AAA',
  text:  '#8A8582',
  hub:   '#A89880',
  default: '#8A7A6A',
};
function getColor(node) {
  if (node.type === 'hub' || node.id < 0) return SOURCE_COLORS.hub;
  return SOURCE_COLORS[node.source_type] || SOURCE_COLORS.default;
}

// ── Radius based on type ──────────────────────────────────────────────────────
function getRadius(node, hubs) {
  if (node.type === 'hub' || node.id < 0) {
    const hubId = node.id < 0 ? -node.id : node.id;
    const hub = hubs.find(h => h.id === hubId);
    const mc = hub?.member_ids?.length || 0;
    return Math.max(14, 14 + Math.min(12, mc) * 0.7);
  }
  return 5.5;
}

// ── Mouse position in scene-space (shared across all nodes) ──────────────────
const globalMouse = { x: 0, y: 0 };
if (typeof window !== 'undefined') {
  window.addEventListener('mousemove', e => {
    // Map to roughly the same space as D3 layout (-600..+600)
    globalMouse.x = (e.clientX / window.innerWidth  - 0.5) * 1200;
    globalMouse.y = -(e.clientY / window.innerHeight - 0.5) * 900;
  });
}

export default function GraphNode3D({
  node,
  nodeZ = 0,
  hubs = [],
  matchingNodeIds = null,
  selectedNodeId,
  onNodeClick,
  simNodesRef,
}) {
  const groupRef   = useRef();
  const meshRef    = useRef();
  const ring1Ref   = useRef();
  const ring2Ref   = useRef();

  const [hovered, setHovered] = useState(false);

  const isHub      = node.type === 'hub' || node.id < 0;
  const isSelected = selectedNodeId === node.id;
  const color      = getColor(node);
  const radius     = getRadius(node, hubs);

  // Unique breathe phase per node
  const breatheOffset = useMemo(() => (Math.abs(node.id) * 0.618) % (Math.PI * 2), [node.id]);
  const breatheRate   = useMemo(() => 0.4 + (Math.abs(node.id) % 17) * 0.02,        [node.id]);

  // Is this node dimmed by search or selection?
  const isDimmed = useMemo(() => {
    if (matchingNodeIds !== null && !matchingNodeIds.has(node.id)) return true;
    if (selectedNodeId !== null && selectedNodeId !== node.id && !isSelected) return true;
    return false;
  }, [matchingNodeIds, selectedNodeId, node.id, isSelected]);

  const threeColor = useMemo(() => new THREE.Color(color), [color]);

  /* ── Per-frame animation ──────────────────────────────────────────────── */
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const group = groupRef.current;
    const mesh  = meshRef.current;
    if (!group || !mesh) return;

    // 1. Sync position from D3 simulation
    const liveNode = simNodesRef.current.find(n => n.id === node.id);
    if (liveNode) {
      const tx = liveNode.x - 600;  // centre: D3 uses [0,1200] range approx
      const ty = -(liveNode.y - 450);
      group.position.x += (tx - group.position.x) * 0.12;
      group.position.y += (ty - group.position.y) * 0.12;
      group.position.z  = nodeZ;
    }

    // 2. Cursor gravity lean (purely visual, max ±5 units)
    const dx = globalMouse.x - group.position.x;
    const dy = globalMouse.y - group.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const leanStrength = Math.max(0, 1 - dist / 200) * 5;
    mesh.position.x += ((dx / (dist || 1)) * leanStrength - mesh.position.x) * 0.06;
    mesh.position.y += ((dy / (dist || 1)) * leanStrength - mesh.position.y) * 0.06;

    // 3. Breathe — sinusoidal scale
    const breathe = 1 + Math.sin(t * breatheRate + breatheOffset) * (isHub ? 0.04 : 0.055);
    const targetScale = isSelected ? breathe * 1.35 : isDimmed ? 0.55 : breathe;
    mesh.scale.setScalar(mesh.scale.x + (targetScale - mesh.scale.x) * 0.08);

    // 4. Ring rotation (hubs only)
    if (ring1Ref.current) ring1Ref.current.rotation.z += 0.003;
    if (ring2Ref.current) ring2Ref.current.rotation.z -= 0.002;

    // 5. Emissive intensity
    if (mesh.material) {
      const targetEmissive = isDimmed
        ? 0.02
        : hovered ? 0.95 : isSelected ? 1.1 : isHub ? 0.7 : 0.38;
      mesh.material.emissiveIntensity +=
        (targetEmissive - mesh.material.emissiveIntensity) * 0.1;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, nodeZ]}>
      {/* Core sphere */}
      <mesh
        ref={meshRef}
        data-testid={`node-mesh-${node.id}`}
        onClick={(e) => { e.stopPropagation(); onNodeClick?.(node); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true);  document.body.style.cursor = 'none'; }}
        onPointerOut={(e)  => { e.stopPropagation(); setHovered(false); }}
      >
        <sphereGeometry args={[radius, isHub ? 32 : 20, isHub ? 32 : 20]} />
        <meshStandardMaterial
          color={threeColor}
          emissive={threeColor}
          emissiveIntensity={isHub ? 0.7 : 0.38}
          roughness={0.65}
          metalness={0.08}
          transparent={isDimmed}
          opacity={isDimmed ? 0.25 : 1}
        />
      </mesh>

      {/* Hub only: 2 torus rings */}
      {isHub && (
        <>
          <mesh ref={ring1Ref} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[radius + 9, 0.45, 8, 64]} />
            <meshBasicMaterial color={color} transparent opacity={0.28} />
          </mesh>
          <mesh ref={ring2Ref} rotation={[Math.PI / 2, 0, Math.PI / 4]}>
            <torusGeometry args={[radius + 16, 0.25, 8, 64]} />
            <meshBasicMaterial color={color} transparent opacity={0.14} />
          </mesh>
          {/* Cluster ambient light */}
          <pointLight color={color} intensity={22} distance={180} decay={2} />
        </>
      )}

      {/* Hover card — HTML overlay anchored in 3D space */}
      {hovered && !isDimmed && (
        <Html
          position={[0, radius + 16, 0]}
          center
          style={{ pointerEvents: 'none', userSelect: 'none' }}
          zIndexRange={[200, 210]}
        >
          <NodeHoverCard node={node} isHub={isHub} color={color} />
        </Html>
      )}
    </group>
  );
}
