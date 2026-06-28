import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/* ============================================================
   GraphEdge3D — A dynamic line between two nodes in WebGL.

   Reads coordinates dynamically from D3 simulation ref
   (simNodesRef) on every frame to remain perfectly aligned
   with the nodes.
   ============================================================ */

export default function GraphEdge3D({ source, target, weight = 0.5, matchingNodeIds, simNodesRef }) {
  const lineRef = useRef();

  // Create a static buffer array for the two vertices (start and end points)
  const initialPositions = useMemo(() => {
    const s = new THREE.Vector3(source.x - 600, -(source.y - 450), source.z ?? 0);
    const t = new THREE.Vector3(target.x - 600, -(target.y - 450), target.z ?? 0);
    const arr = new Float32Array(6);
    arr[0] = s.x; arr[1] = s.y; arr[2] = s.z;
    arr[3] = t.x; arr[4] = t.y; arr[5] = t.z;
    return arr;
  }, [source.z, target.z]);

  // Per-frame: read simulated position of both nodes and update the line vertices
  useFrame(() => {
    if (!lineRef.current || !simNodesRef || !simNodesRef.current) return;

    const liveNodes = simNodesRef.current;
    const srcNode = liveNodes.find(n => n.id === source.id);
    const tgtNode = liveNodes.find(n => n.id === target.id);

    if (srcNode && tgtNode) {
      const posAttr = lineRef.current.geometry.attributes.position;
      const array = posAttr.array;

      // Update start node coordinates
      array[0] = srcNode.x - 600;
      array[1] = -(srcNode.y - 450);
      array[2] = source.z ?? 0;

      // Update end node coordinates
      array[3] = tgtNode.x - 600;
      array[4] = -(tgtNode.y - 450);
      array[5] = target.z ?? 0;

      posAttr.needsUpdate = true;
    }
  });

  // Dim edges when search is active and neither endpoint matches
  const bothDimmed = matchingNodeIds !== null &&
    !matchingNodeIds.has(source.id) &&
    !matchingNodeIds.has(target.id);

  const isHubConnection = source.type === 'hub' || target.type === 'hub' || source.id < 0 || target.id < 0;
  const opacity = bothDimmed ? 0.012 : isHubConnection ? 0.35 : Math.max(0.06, weight * 0.14);
  const color = isHubConnection ? '#CFA365' : '#8A8582';
  const linewidth = isHubConnection ? 1.6 : 0.8;

  return (
    <line ref={lineRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[initialPositions, 3]}
        />
      </bufferGeometry>
      <lineBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        linewidth={linewidth}
      />
    </line>
  );
}

