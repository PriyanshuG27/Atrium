import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
// @react-three/postprocessing removed — incompatible with three@0.185.
// Stubbed to passthrough so old Graph3DScene code compiles without errors.
const EffectComposer = ({ children }) => <>{children}</>;
const Bloom = () => null;
const DepthOfField = () => null;
const Noise = () => null;

import * as THREE from 'three';
import GraphNode3D from './GraphNode3D';
import GraphEdge3D from './GraphEdge3D';

/* ============================================================
   Graph3DScene — The 3D universe inside the R3F Canvas.
   Owns: camera parallax, lighting, post-processing, node+edge renders.
   ============================================================ */

// Seeded "random" Z so nodes always get the same depth value
function seededZ(id, range) {
  const h = Math.abs((id * 2654435761) >>> 0) / 0xFFFFFFFF;
  return (h - 0.5) * 2 * range;
}

export default function Graph3DScene({
  simNodesRef,
  edges = [],
  hubs = [],
  matchingNodeIds = null,
  selectedNodeId = null,
  onNodeClick,
  flyTargetRef,
  mode,
}) {
  const { camera } = useThree();
  const mouseRef = useRef({ x: 0, y: 0 });
  const timeRef = useRef(0);

  // ── Mouse tracking for parallax ───────────────────────────────────────────
  React.useEffect(() => {
    const onMove = (e) => {
      mouseRef.current.x = (e.clientX / window.innerWidth  - 0.5) * 2;
      mouseRef.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const lookAtTarget = useRef(new THREE.Vector3(0, 0, 0));

  // ── Camera: idle drift + mouse parallax + fly-to ─────────────────────────
  useFrame((_, delta) => {
    timeRef.current += delta;
    const t = timeRef.current;

    const fly = flyTargetRef?.current;
    if (fly) {
      // Offset target to the right (x + 150) so the selected node centers on the left side of screen
      const targetX = fly.x + 150;
      const targetY = fly.y;
      const targetZ = fly.z + 80;

      camera.position.x += (targetX - camera.position.x) * 0.05;
      camera.position.y += (targetY - camera.position.y) * 0.05;
      camera.position.z += (targetZ - camera.position.z) * 0.05;

      const targetLook = new THREE.Vector3(targetX, targetY, 0);
      lookAtTarget.current.lerp(targetLook, 0.05);
    } else {
      // Idle: gentle sinusoidal drift + mouse parallax looking at center [0,0,0]
      const idleX = Math.sin(t * 0.00035) * 6 + mouseRef.current.x * 9;
      const idleY = Math.cos(t * 0.00028) * 4 - mouseRef.current.y * 6;
      const idleZ = 700 + Math.sin(t * 0.0002) * 15;

      camera.position.x += (idleX - camera.position.x) * 0.02;
      camera.position.y += (idleY - camera.position.y) * 0.02;
      camera.position.z += (idleZ - camera.position.z) * 0.02;

      const targetLook = new THREE.Vector3(0, 0, 0);
      lookAtTarget.current.lerp(targetLook, 0.02);
    }

    camera.lookAt(lookAtTarget.current);
  });


  // ── Assign Z depth per node (stable, seeded) ──────────────────────────────
  // Hub → z≈0  |  orbital → ±50  |  singleton → ±90
  const nodeZMap = useMemo(() => {
    const map = new Map();
    const nodes = simNodesRef.current || [];
    nodes.forEach(n => {
      if (n.type === 'hub' || n.id < 0) {
        map.set(n.id, seededZ(n.id, 20));
      } else {
        // Check if in a hub
        const inHub = hubs.some(h => h.member_ids?.includes(n.id));
        map.set(n.id, seededZ(n.id, inHub ? 55 : 90));
      }
    });
    return map;
  }, [simNodesRef, hubs]); // eslint-disable-line react-hooks/exhaustive-deps

  const nodes = simNodesRef.current || [];

  return (
    <>
      {/* ── Lighting ──────────────────────────────────────────────────── */}
      <ambientLight intensity={0.07} color="#C9A97A" />
      <pointLight position={[0, 0, 400]} color="#C9A97A" intensity={0.5} decay={2} />
      <pointLight position={[-300, 200, 100]} color="#7C6FD4" intensity={0.15} decay={2} />
      <pointLight position={[300, -150, 100]} color="#3DAA8A" intensity={0.12} decay={2} />

      {/* ── Edges ─────────────────────────────────────────────────────── */}
      {edges.map((edge, i) => {
        const srcId = typeof edge.source === 'object' ? edge.source.id : edge.source;
        const tgtId = typeof edge.target === 'object' ? edge.target.id : edge.target;
        const src = nodes.find(n => n.id === srcId);
        const tgt = nodes.find(n => n.id === tgtId);
        if (!src || !tgt) return null;
        return (
          <GraphEdge3D
            key={`edge-${srcId}-${tgtId}-${i}`}
            source={{ ...src, z: nodeZMap.get(srcId) ?? 0 }}
            target={{ ...tgt, z: nodeZMap.get(tgtId) ?? 0 }}
            weight={edge.weight ?? 0.5}
            matchingNodeIds={matchingNodeIds}
            simNodesRef={simNodesRef}
          />

        );
      })}

      {/* ── Nodes ─────────────────────────────────────────────────────── */}
      {nodes.map(node => (
        <GraphNode3D
          key={`node-${node.id}`}
          node={node}
          nodeZ={nodeZMap.get(node.id) ?? 0}
          hubs={hubs}
          matchingNodeIds={matchingNodeIds}
          selectedNodeId={selectedNodeId}
          onNodeClick={onNodeClick}
          simNodesRef={simNodesRef}
        />
      ))}

      {/* ── Post-Processing Pipeline ───────────────────────────────────── */}
      <EffectComposer multisampling={0}>
        <Bloom
          mipmapBlur
          luminanceThreshold={0.18}
          luminanceSmoothing={0.92}
          intensity={1.6}
          radius={0.75}
        />
        <DepthOfField
          focusDistance={selectedNodeId ? 0.008 : 0.014}
          focalLength={0.014}
          bokehScale={selectedNodeId ? 7 : 2.5}
        />
        <Noise opacity={0.025} />
      </EffectComposer>
    </>
  );
}
