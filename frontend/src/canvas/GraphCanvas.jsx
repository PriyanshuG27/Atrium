import React, { useRef, useEffect, useState, useMemo } from 'react';
import * as d3 from 'd3';

// Helper to get node radius
function getNodeRadius(node, hubs = []) {
  if (node.type === 'hub' || node.id < 0) {
    const hubId = node.id < 0 ? -node.id : node.id;
    const hub = hubs.find(h => h.id === hubId);
    const memberCount = hub?.member_ids?.length || 0;
    return Math.max(14, 14 + Math.min(10, memberCount) * 0.4);
  }
  return 6;
}

function getSourceColor(sourceType) {
  switch (sourceType) {
    case 'url':
      return '#00F2FE'; // Neon Cyan
    case 'pdf':
      return '#FF0844'; // Ruby Crimson
    case 'voice':
      return '#B100FF'; // Electric Purple
    case 'image':
    case 'photo':
      return '#00FF87'; // Neon Mint
    case 'text':
      return '#F9D423'; // Golden Amber
    default:
      return '#6C63FF'; // Electric Indigo
  }
}

// Helper to draw geometric shapes based on source type to avoid standard "electrons/atoms" circles
function drawNodeShape(ctx, x, y, radius, sourceType) {
  ctx.beginPath();
  
  // Safe guard for primitive mock canvas contexts in unit test environments
  if (typeof ctx.lineTo !== 'function' || typeof ctx.moveTo !== 'function') {
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    return;
  }

  switch (sourceType) {
    case 'url': // Hexagon
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * 2 * Math.PI;
        ctx.lineTo(x + radius * 1.15 * Math.cos(angle), y + radius * 1.15 * Math.sin(angle));
      }
      ctx.closePath();
      break;
    case 'pdf': // Document card shape (drawn with lineTo for test mock compatibility)
      ctx.moveTo(x - radius * 0.8, y - radius * 1.1);
      ctx.lineTo(x + radius * 0.8, y - radius * 1.1);
      ctx.lineTo(x + radius * 0.8, y + radius * 1.1);
      ctx.lineTo(x - radius * 0.8, y + radius * 1.1);
      ctx.closePath();
      break;
    case 'voice': // Perfect circle
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      break;
    case 'image':
    case 'photo': // Diamond
      ctx.moveTo(x, y - radius * 1.25);
      ctx.lineTo(x + radius * 1.25, y);
      ctx.lineTo(x, y + radius * 1.25);
      ctx.lineTo(x - radius * 1.25, y);
      ctx.closePath();
      break;
    case 'text': // Triangle
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * 2 * Math.PI - Math.PI / 2;
        ctx.lineTo(x + radius * 1.25 * Math.cos(angle), y + radius * 1.25 * Math.sin(angle));
      }
      ctx.closePath();
      break;
    default:
      ctx.arc(x, y, radius, 0, Math.PI * 2);
  }
}

export default function GraphCanvas({
  activeNodes = [],
  edges = [],
  matchingNodeIds = null,
  pan = { x: 0, y: 0 },
  zoom = 1,
  handleNodeClick,
  onNodeClick,
  selectedNodeId = null,
  mode = 'nodes',
  hubs = []
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const overlayRef = useRef(null);

  // Fallbacks for onClick handler
  const clickHandler = onNodeClick || handleNodeClick;

  const isHubsMode = mode === 'hubs';
  const isGraphMode = mode === 'graph';
  const displayNodes = isGraphMode
    ? activeNodes
    : isHubsMode
      ? activeNodes.filter(n => n.type === 'hub' || n.id < 0)
      : activeNodes.filter(n => n.id > 0);

  const displayEdges = useMemo(() => {
    if (isGraphMode) {
      return edges;
    }
    if (!isHubsMode) {
      // In nodes mode, only keep item-to-item similarity edges
      return edges.filter(edge => {
        const s = typeof edge.source === 'object' ? edge.source.id : edge.source;
        const t = typeof edge.target === 'object' ? edge.target.id : edge.target;
        return s > 0 && t > 0;
      });
    }
    
    // Map item ID to hub node ID (negative integer)
    const itemToHubMap = new Map();
    hubs.forEach(h => {
      const hubNodeId = -h.id;
      if (h.member_ids) {
        h.member_ids.forEach(mId => {
          itemToHubMap.set(mId, hubNodeId);
        });
      }
    });

    const hubEdgesMap = new Map();
    edges.forEach(edge => {
      const s = typeof edge.source === 'object' ? edge.source.id : edge.source;
      const t = typeof edge.target === 'object' ? edge.target.id : edge.target;
      
      // Only look at similarity edges between items (positive IDs)
      if (s > 0 && t > 0) {
        const hubS = itemToHubMap.get(s);
        const hubT = itemToHubMap.get(t);
        if (hubS && hubT && hubS !== hubT) {
          const uS = Math.min(hubS, hubT);
          const uT = Math.max(hubS, hubT);
          const key = `${uS}_${uT}`;
          if (!hubEdgesMap.has(key)) {
            hubEdgesMap.set(key, { source: uS, target: uT, weight: edge.weight || 1.0 });
          }
        }
      }
    });
    return Array.from(hubEdgesMap.values());
  }, [edges, hubs, isHubsMode, isGraphMode]);

  // Local pan and zoom states in case parent does not manage them
  const [localPan, setLocalPan] = useState(pan);
  const [localZoom, setLocalZoom] = useState(zoom);

  // Sync props to local state
  useEffect(() => {
    setLocalPan(pan);
  }, [pan.x, pan.y]);

  useEffect(() => {
    setLocalZoom(zoom);
  }, [zoom]);

  // Keep refs for pan and zoom to read inside requestAnimationFrame without closures
  const panRef = useRef(localPan);
  const zoomRef = useRef(localZoom);
  useEffect(() => {
    panRef.current = localPan;
  }, [localPan]);
  useEffect(() => {
    zoomRef.current = localZoom;
  }, [localZoom]);

  // Refs for tracking drag state
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Refs for D3 simulation
  const simulationRef = useRef(null);
  const nodesRef = useRef([]);
  const linksRef = useRef([]);

  // Animation values
  const animationFrameRef = useRef(null);
  const rotAngleRef = useRef(0);
  const flowOffsetRef = useRef(0);
  const hoveredNodeIdRef = useRef(null);

  // Detect prefers-reduced-motion
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const listener = (e) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  // Handle window resizing using ResizeObserver
  // Initialize with actual DOM size immediately to avoid forceCenter targeting the wrong point
  const getDimensions = () => {
    const container = containerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return { width: rect.width, height: rect.height };
      }
    }
    return { width: 900, height: 650 };
  };
  const [dimensions, setDimensions] = useState(() => getDimensions());
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Read real size immediately on mount
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setDimensions({ width: rect.width, height: rect.height });
    }

    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setDimensions({ width, height });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Use the completely static, mathematically perfect Golden Spiral layout from Dashboard.
  // We completely strip D3 here because physics engines on densely connected star graphs
  // inevitably collapse into a singularity or explode unless perfectly tuned.
  // This guarantees 0 overlaps, 0 crashes, and instant performance.
  useEffect(() => {
    if (!displayNodes || displayNodes.length === 0) {
      nodesRef.current = [];
      linksRef.current = [];
      return;
    }

    // 1. Direct copy of pre-computed, guaranteed-spread positions
    nodesRef.current = displayNodes.map(node => ({ ...node }));

    // 2. Map links to node object references safely
    const nodeMap = new Map(nodesRef.current.map(n => [n.id, n]));
    linksRef.current = (displayEdges || [])
      .map(edge => {
        const s = typeof edge.source === 'object' ? edge.source.id : edge.source;
        const t = typeof edge.target === 'object' ? edge.target.id : edge.target;
        return { ...edge, source: nodeMap.get(s), target: nodeMap.get(t) };
      })
      .filter(edge => edge.source && edge.target);

    if (typeof window !== 'undefined') window.__graphNodes = nodesRef.current;
  }, [displayNodes, displayEdges]);

  // Setup canvas drawing loop (requestAnimationFrame)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastTime = 0;

    const renderLoop = (timestamp) => {
      if (!lastTime) lastTime = timestamp;
      const dt = timestamp - lastTime;
      lastTime = timestamp;

      // Update offsets for rotations and dashes
      if (!prefersReducedMotion) {
        rotAngleRef.current += 0.0005 * dt; // slow rotating hub halo
        flowOffsetRef.current += 0.1 * dt; // flowing pulse offset
      }

      // 1. Clear Canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 2. Apply Pan & Zoom Transform
      ctx.save();
      ctx.translate(panRef.current.x, panRef.current.y);
      ctx.scale(zoomRef.current, zoomRef.current);

      const nodesList = nodesRef.current;
      const linksList = linksRef.current;

      // Check if a hub is selected
      const isHubSelected = selectedNodeId !== null && selectedNodeId < 0;
      const selectedHubMemberIds = new Set();
      if (isHubSelected) {
        linksList.forEach(link => {
          const s = typeof link.source === 'object' ? link.source.id : link.source;
          const t = typeof link.target === 'object' ? link.target.id : link.target;
          if (s === selectedNodeId) {
            selectedHubMemberIds.add(t);
          } else if (t === selectedNodeId) {
            selectedHubMemberIds.add(s);
          }
        });
      }

      const hubsList = [];
      const orbitals = [];
      nodesList.forEach(n => {
        if (n.type === 'hub' || n.id < 0) {
          hubsList.push(n);
        } else {
          orbitals.push(n);
        }
      });

      // 4. Draw Edges
      linksList.forEach((link, idx) => {
        const sourceNode = link.source;
        const targetNode = link.target;
        if (!sourceNode || !targetNode || sourceNode.x === undefined || targetNode.x === undefined) return;

        const x1 = sourceNode.x;
        const y1 = sourceNode.y;
        const x2 = targetNode.x;
        const y2 = targetNode.y;

        const isHubConnection = sourceNode.id < 0 || targetNode.id < 0;

        // Calculate control point for curved bezier line
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const controlX = midX + (y2 - y1) * 0.04;
        const controlY = midY - (x2 - x1) * 0.04;

        // Edge opacity and glow based on matching/selection
        let opacity = 0.12;
        let isHighlighted = false;

        if (isHubSelected) {
          if (sourceNode.id === selectedNodeId || targetNode.id === selectedNodeId) {
            isHighlighted = true;
            opacity = 0.85;
          } else {
            opacity = 0.02;
          }
        } else if (matchingNodeIds !== null) {
          const sMatched = matchingNodeIds.has(sourceNode.id);
          const tMatched = matchingNodeIds.has(targetNode.id);
          if (isHubConnection) {
            const memberId = sourceNode.id < 0 ? targetNode.id : sourceNode.id;
            if (matchingNodeIds.has(memberId)) {
              isHighlighted = true;
              opacity = 0.75;
            } else {
              opacity = 0.02;
            }
          } else {
            if (sMatched && tMatched) {
              isHighlighted = true;
              opacity = 0.65;
            } else {
              opacity = 0.02;
            }
          }
        } else {
          if (isHubConnection) {
            opacity = 0.35; // Make hub edges clearly visible by default
          } else {
            opacity = 0.18; // Similarity edges visible but clean
          }
        }

        const sourceColor = sourceNode.id < 0 ? '#00D4AA' : getSourceColor(sourceNode.source_type);
        const targetColor = targetNode.id < 0 ? '#00D4AA' : getSourceColor(targetNode.source_type);

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.beginPath();

        // Draw curved bezier line with a beautiful linear gradient between the two node colors!
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(controlX, controlY, x2, y2);
        
        let strokeStyle = sourceColor;
        if (typeof ctx.createLinearGradient === 'function') {
          const edgeGrad = ctx.createLinearGradient(x1, y1, x2, y2);
          edgeGrad.addColorStop(0, sourceColor);
          edgeGrad.addColorStop(1, targetColor);
          strokeStyle = edgeGrad;
        }
        
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = isHighlighted ? 2.0 : 1.0;

        if (isHighlighted) {
          ctx.shadowBlur = 6;
          ctx.shadowColor = isHubConnection ? '#00D4AA' : '#6C63FF';
        }
        
        ctx.stroke();
        ctx.restore();

        // Draw flowing pulse particle (skip if prefers-reduced-motion is active)
        if (!prefersReducedMotion && (isHighlighted || (matchingNodeIds === null && opacity > 0.1))) {
          // Flow from source to target (t goes from 0.0 to 1.0)
          const speed = 0.0006;
          const t = (timestamp * speed + idx * 0.15) % 1.0;
          const mt = 1 - t;
          
          // Quadratic bezier interpolation formula
          const px = mt * mt * x1 + 2 * mt * t * controlX + t * t * x2;
          const py = mt * mt * y1 + 2 * mt * t * controlY + t * t * y2;

          ctx.save();
          ctx.globalAlpha = opacity * 1.3;
          ctx.beginPath();
          ctx.arc(px, py, 1.8, 0, Math.PI * 2);
          
          // Pulse particle color: mix color or use white core with connection glow
          ctx.fillStyle = '#FFFFFF';
          ctx.shadowBlur = 8;
          ctx.shadowColor = targetColor;
          ctx.fill();
          ctx.restore();
        }
      });

      // 5. Draw Orbital Nodes (Standard Items)
      orbitals.forEach(node => {
        if (node.x === undefined || node.y === undefined) return;
        const isHovered = hoveredNodeIdRef.current === node.id;
        const isSelected = selectedNodeId === node.id;
        const color = getSourceColor(node.source_type);
        
        let opacity = 1.0;
        if (isHubSelected) {
          opacity = selectedHubMemberIds.has(node.id) ? 1.0 : 0.15;
        } else if (matchingNodeIds !== null) {
          opacity = matchingNodeIds.has(node.id) ? 1.0 : 0.1;
        }

        ctx.save();
        ctx.globalAlpha = opacity;

        const baseRadius = 6;
        const radius = (isHovered || isSelected ? 8 : baseRadius);

        // A. Draw Star Glow (radial gradient behind node)
        const glowRadius = radius * (isHovered || isSelected ? 3.5 : 2.2);
        if (typeof ctx.createRadialGradient === 'function') {
          const radialGlow = ctx.createRadialGradient(node.x, node.y, radius * 0.2, node.x, node.y, glowRadius);
          radialGlow.addColorStop(0, `${color}66`); // 40% opacity glow
          radialGlow.addColorStop(0.5, `${color}1A`); // 10% opacity glow
          radialGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
          
          ctx.fillStyle = radialGlow;
          ctx.beginPath();
          ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
          ctx.fill();
        }

        // B. Draw Custom Geometric Star Shape
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 2.2 : 1.2;
        
        if (isHovered || isSelected) {
          ctx.shadowBlur = 10;
          ctx.shadowColor = color;
        } else {
          ctx.shadowBlur = 4;
          ctx.shadowColor = color;
        }

        // Fill with a nice solid colored glass core
        ctx.fillStyle = 'rgba(7, 7, 15, 0.9)'; // Dark center to stand out
        drawNodeShape(ctx, node.x, node.y, radius, node.source_type);
        ctx.fill();
        ctx.stroke();

        // C. Draw a small bright white center dot inside the geometric shape to make it sparkle like a star!
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowBlur = 0; // reset
        ctx.beginPath();
        ctx.arc(node.x, node.y, 2, 0, Math.PI * 2);
        ctx.fill();

        // D. Draw Labels for hovered/selected nodes
        if (isHovered || isSelected) {
          ctx.font = '500 11px Inter';
          ctx.fillStyle = '#F1F1F6';
          ctx.textAlign = 'center';
          ctx.fillText(node.title, node.x, node.y + radius + 18);
        }

        ctx.restore();
      });

      // 6. Draw Hub Centroid Nodes (Louvain Communities)
      hubsList.forEach(node => {
        if (node.x === undefined || node.y === undefined) return;
        const isHovered = hoveredNodeIdRef.current === node.id;
        const isSelected = selectedNodeId === node.id;
        
        let opacity = 1.0;
        if (isHubSelected) {
          opacity = node.id === selectedNodeId ? 1.0 : 0.15;
        } else if (matchingNodeIds !== null) {
          const isMatched = [...matchingNodeIds].some(mId => 
            linksList.some(l => 
              (l.source.id === node.id && l.target.id === mId) ||
              (l.target.id === node.id && l.source.id === mId)
            )
          );
          opacity = isMatched ? 1.0 : 0.1;
        }

        ctx.save();
        ctx.globalAlpha = opacity;

        const radius = getNodeRadius(node, hubs);

        // A. Draw Centroid Glow (neon mint halo)
        const glowRadius = radius * (isHovered || isSelected ? 2.5 : 1.8);
        if (typeof ctx.createRadialGradient === 'function') {
          const radialGlow = ctx.createRadialGradient(node.x, node.y, radius * 0.1, node.x, node.y, glowRadius);
          radialGlow.addColorStop(0, 'rgba(0, 212, 170, 0.2)');
          radialGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = radialGlow;
          ctx.beginPath();
          ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
          ctx.fill();
        }

        // B. Draw Clean Transparent Ring Surface
        ctx.fillStyle = 'rgba(7, 7, 15, 0.4)'; // transparent glass core
        ctx.strokeStyle = '#00D4AA'; // Neon mint border
        ctx.lineWidth = isSelected ? 2.5 : 1.5;

        if (isHovered || isSelected) {
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#00D4AA';
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // C. Draw Slow-Rotating Outer Dashed Ring
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(0, 212, 170, 0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 6, rotAngleRef.current, rotAngleRef.current + Math.PI * 2);
        ctx.stroke();

        // D. Draw label for Hub centroids on canvas (collision-aware placement)
        ctx.font = '600 10px JetBrains Mono';
        ctx.fillStyle = isHovered || isSelected ? '#00D4AA' : '#8E8E9F';
        ctx.textAlign = 'center';
        
        let labelY = node.y + radius + 18;
        const closeHub = hubsList.find(other => {
          if (other.id === node.id || other.x === undefined || other.y === undefined) return false;
          const dx = Math.abs(node.x - other.x);
          const dy = Math.abs(node.y - other.y);
          return dx < 240 && dy < 50; // horizontal collision zone is 240px, vertical is 50px
        });
        if (closeHub) {
          const isAbove = node.id < closeHub.id;
          if (isAbove) {
            labelY = node.y - radius - 12;
          }
        }
        ctx.fillText(node.title.toUpperCase(), node.x, labelY);

        ctx.restore();
      });

      ctx.restore();

      // 7. Imperatively update transparent DOM overlay positions at 60 FPS
      if (overlayRef.current) {
        overlayRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${zoomRef.current})`;
        
        const overlayChildren = overlayRef.current.children;
        for (let i = 0; i < overlayChildren.length; i++) {
          const child = overlayChildren[i];
          const nodeId = parseInt(child.getAttribute('data-node-id'));
          const node = nodesList.find(n => n.id === nodeId);
          if (node && node.x !== undefined) {
            child.style.left = `${node.x}px`;
            child.style.top = `${node.y}px`;

            // Sync visual opacity for Vitest selectors
            let opacityVal = '1';
            if (isHubSelected) {
              if (node.id === selectedNodeId) {
                opacityVal = '1';
              } else if (node.id < 0) {
                opacityVal = '0.2';
              } else {
                opacityVal = selectedHubMemberIds.has(node.id) ? '1' : '0.2';
              }
            } else if (matchingNodeIds === null) {
              opacityVal = '1';
            } else if (node.id < 0) {
              const isMatched = [...matchingNodeIds].some(mId => 
                linksList.some(link => 
                  (link.source.id === node.id && link.target.id === mId) ||
                  (link.target.id === node.id && link.source.id === mId)
                )
              );
              opacityVal = isMatched ? '1' : '0.1';
            } else {
              opacityVal = matchingNodeIds.has(node.id) ? '1' : '0.1';
            }
            child.style.opacity = opacityVal;
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animationFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [matchingNodeIds, selectedNodeId, prefersReducedMotion, mode, hubs, displayNodes, displayEdges]);

  // Local drag pan mouse handlers
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    const isNode = e.target.closest('.constellation-node');
    if (isNode) return;

    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX - localPan.x, y: e.clientY - localPan.y };
  };

  const handleMouseMove = (e) => {
    if (!isDraggingRef.current) return;
    const newPan = {
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y
    };
    setLocalPan(newPan);
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  // Local scroll-wheel zoom handler
  // Wheel zoom — must use native listener with {passive:false} to call preventDefault.
  // React's onWheel is passive by default in modern browsers.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e) => {
      e.preventDefault();
      const zoomFactor = 0.05;
      const nextZoom = Math.min(Math.max(zoomRef.current * (1 - e.deltaY * zoomFactor * 0.01), 0.3), 3);
      setLocalZoom(nextZoom);
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Helper to compute initial node opacities for JSDOM / test runners
  const getInitialOpacity = (node) => {
    const isHubSelected = selectedNodeId !== null && selectedNodeId < 0;
    if (isHubSelected) {
      if (node.id === selectedNodeId) return '1';
      if (node.id < 0) return '0.2';
      const isMember = edges.some(edge => {
        const sId = typeof edge.source === 'object' ? edge.source.id : edge.source;
        const tId = typeof edge.target === 'object' ? edge.target.id : edge.target;
        return (sId === selectedNodeId && tId === node.id) ||
               (tId === selectedNodeId && sId === node.id);
      });
      return isMember ? '1' : '0.2';
    }
    if (matchingNodeIds === null) return '1';
    if (node.id < 0) {
      const isMatched = edges.some(edge => {
        const sId = typeof edge.source === 'object' ? edge.source.id : edge.source;
        const tId = typeof edge.target === 'object' ? edge.target.id : edge.target;
        return (sId === node.id && matchingNodeIds.has(tId)) ||
               (tId === node.id && matchingNodeIds.has(sId));
      });
      return isMatched ? '1' : '0.1';
    }
    return matchingNodeIds.has(node.id) ? '1' : '0.1';
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#030307',
        userSelect: 'none'
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* 1. Star Constellation Canvas Drawing Layer */}
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{
          display: 'block',
          width: '100%',
          height: '100%'
        }}
      />

      {/* 2. Interactive DOM overlay container for clicks, hovers, accessibility, and Vitest test selectors */}
      <div
        ref={overlayRef}
        className="graph-canvas-inner"
        role="application"
        aria-label="Knowledge constellation"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          transformOrigin: '0 0',
          transform: `translate(${localPan.x}px, ${localPan.y}px) scale(${localZoom})`
        }}
      >
        {displayNodes.map((node) => {
          const isHub = node.type === 'hub' || node.id < 0;
          const isSelected = selectedNodeId === node.id;
          const initialOpacity = getInitialOpacity(node);
          const radius = getNodeRadius(node, hubs);
          
          let labelStyle = { pointerEvents: 'none' };
          if (isHub) {
            const closeHub = displayNodes.find(other => {
              if (other.id === node.id || other.x === undefined || other.y === undefined) return false;
              const dx = node.x - other.x;
              const dy = node.y - other.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              return dist < 120;
            });
            if (closeHub) {
              const isAbove = node.id < closeHub.id;
              if (isAbove) {
                labelStyle = {
                  ...labelStyle,
                  top: 'auto',
                  bottom: '100%',
                  transform: 'translateX(-50%) translateY(-4px)'
                };
              }
            }
          }
          
          return (
            <div
              key={node.id}
              data-node-id={node.id}
              onClick={(e) => {
                e.stopPropagation();
                if (clickHandler) clickHandler(node);
              }}
              onMouseEnter={() => {
                hoveredNodeIdRef.current = node.id;
              }}
              onMouseLeave={() => {
                hoveredNodeIdRef.current = null;
              }}
              role="button"
              tabIndex={0}
              aria-label={`Select node ${node.title}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (clickHandler) clickHandler(node);
                }
              }}
              className={`constellation-node ${isHub ? 'glass-glow-top' : ''} ${isSelected ? 'selected-node' : ''}`}
              style={{
                position: 'absolute',
                left: node.x !== undefined ? `${node.x}px` : '50%',
                top: node.y !== undefined ? `${node.y}px` : '50%',
                opacity: initialOpacity,
                cursor: 'pointer',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'auto',
                width: `${radius * 2}px`,
                height: `${radius * 2}px`,
                borderRadius: '50%',
                background: 'transparent',
                border: 'none',
                transition: 'opacity 0.35s ease'
              }}
            >
              {isHub ? (
                <span className="constellation-node-hub-label" style={labelStyle}>
                  {node.title}
                </span>
              ) : (
                <span className="constellation-node-label" style={{ pointerEvents: 'none' }}>
                  {node.title}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
