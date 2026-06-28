import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import ArchiveCard from '../components/ArchiveCard';
import { usePerf } from '../context/PerfContext';


const CYLINDER_RADIUS = 6;
const CAMERA_Z = 9;

function BackgroundGrid() {
  const meshRef = useRef();
  useFrame(({ clock }) => {
    if (meshRef.current) meshRef.current.rotation.z = Math.sin(clock.getElapsedTime() * 0.05) * 0.02;
  });
  return (
    <mesh ref={meshRef} position={[0, 0, -8]}>
      <planeGeometry args={[40, 30, 20, 15]} />
      <meshBasicMaterial color="#CFA365" wireframe transparent opacity={0.025} />
    </mesh>
  );
}

function CursorFlashlight() {
  const lightRef = useRef();
  const { mouse, viewport } = useThree();
  useFrame(() => {
    if (lightRef.current) {
      lightRef.current.position.x = (mouse.x * viewport.width) / 2;
      lightRef.current.position.y = (mouse.y * viewport.height) / 2;
    }
  });
  return <pointLight ref={lightRef} color="#CFA365" intensity={0.6} distance={8} decay={2} position={[0, 0, 5]} />;
}

function CylinderScene({ items, matchingIds, onCardClick, hasSelection, selectedItemId, searchQuery }) {
  const scrollProgress = useRef(0);
  const targetScrollProgress = useRef(0);
  const groupRef = useRef();
  // Use ref for active index to avoid re-renders on every frame tick
  const activeIndexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);

  // Automatically scroll/transition the cylinder to target card when it is selected
  useEffect(() => {
    if (selectedItemId) {
      const targetIdx = items.findIndex(it => it.id === selectedItemId);
      if (targetIdx !== -1) {
        targetScrollProgress.current = targetIdx;
      }
    }
  }, [selectedItemId, items]);

  // Auto-scroll to first matching result when search query changes
  useEffect(() => {
    if (!searchQuery || !searchQuery.trim()) return; // no search active
    if (!matchingIds || matchingIds.size === 0) return; // no results
    // Find the index of the first matching item and jump there
    const firstMatchIdx = items.findIndex(it => matchingIds.has(it.id));
    if (firstMatchIdx !== -1) {
      targetScrollProgress.current = firstMatchIdx;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, items]); // searchQuery is stable string; items.length catches list changes


  useEffect(() => {
    let touchStart = 0;

    const onWheel = (e) => {
      e.preventDefault();
      // Increase/decrease target scroll progress, bounding it strictly within the items list
      targetScrollProgress.current += e.deltaY * 0.004;
      targetScrollProgress.current = Math.max(0, Math.min(items.length - 1, targetScrollProgress.current));
    };

    const onKeyDown = (e) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        targetScrollProgress.current = Math.max(0, targetScrollProgress.current - 1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        targetScrollProgress.current = Math.min(items.length - 1, targetScrollProgress.current + 1);
      }
    };

    const handleTouchStart = (e) => {
      // If the touch started inside the bottom sheet HUD, don't rotate the 3D cylinder
      if (e.target.closest('.archive-hud') || e.target.closest('input') || e.target.closest('button')) {
        return;
      }
      if (e.touches.length === 1) {
        touchStart = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e) => {
      if (e.target.closest('.archive-hud') || e.target.closest('input') || e.target.closest('button')) {
        return;
      }
      if (e.touches.length === 1 && touchStart !== 0) {
        const touchEnd = e.touches[0].clientY;
        const diff = touchStart - touchEnd;
        // Sensitivity factor for vertical drag mapping to items scroll
        targetScrollProgress.current += diff * 0.009;
        targetScrollProgress.current = Math.max(0, Math.min(items.length - 1, targetScrollProgress.current));
        touchStart = touchEnd;
      }
    };

    const handleTouchEnd = () => {
      touchStart = 0;
    };

    const handleScrollPrev = () => {
      targetScrollProgress.current = Math.max(0, targetScrollProgress.current - 1);
    };

    const handleScrollNext = () => {
      targetScrollProgress.current = Math.min(items.length - 1, targetScrollProgress.current + 1);
    };

    const handleScrollTo = (e) => {
      targetScrollProgress.current = Math.max(0, Math.min(items.length - 1, e.detail.index));
    };

    const el = document.querySelector('.archive-room');
    if (el) {
      el.addEventListener('wheel', onWheel, { passive: false });
      window.addEventListener('keydown', onKeyDown);
      el.addEventListener('touchstart', handleTouchStart, { passive: true });
      el.addEventListener('touchmove', handleTouchMove, { passive: true });
      el.addEventListener('touchend', handleTouchEnd, { passive: true });
    }
    window.addEventListener('archive-scroll-prev', handleScrollPrev);
    window.addEventListener('archive-scroll-next', handleScrollNext);
    window.addEventListener('archive-scroll-to', handleScrollTo);

    return () => {
      if (el) {
        el.removeEventListener('wheel', onWheel);
        el.removeEventListener('touchstart', handleTouchStart);
        el.removeEventListener('touchmove', handleTouchMove);
        el.removeEventListener('touchend', handleTouchEnd);
      }
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('archive-scroll-prev', handleScrollPrev);
      window.removeEventListener('archive-scroll-next', handleScrollNext);
      window.removeEventListener('archive-scroll-to', handleScrollTo);
    };
  }, [items.length]);


  useFrame(() => {
    if (items.length === 0) return;
    scrollProgress.current = THREE.MathUtils.lerp(scrollProgress.current, targetScrollProgress.current, 0.1);

    // Only setState when index actually changes (avoids re-rendering every frame)
    const newActive = Math.round(scrollProgress.current);
    if (newActive !== activeIndexRef.current) {
      activeIndexRef.current = newActive;
      setActiveIndex(newActive);
      window.dispatchEvent(new CustomEvent('archive-active-index', { detail: { index: newActive } }));
    }

    if (groupRef.current) {
      // Center the cylinder on mobile viewports; shift laterally only on desktop
      const navEl = document.querySelector('.mobile-bottom-nav');
      const isMobile = navEl ? window.getComputedStyle(navEl).display === 'flex' : window.innerWidth <= 992;
      const targetX = isMobile ? 0 : (hasSelection ? -2.8 : 1.2);
      groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, targetX, 0.08);
    }
  });

  return (
    <group ref={groupRef}>
      {items.map((item, i) => {
        const dist = i - scrollProgress.current;
        const absDist = Math.abs(dist);

        // Cull cards that are far away from active view
        if (absDist > 1.8) return null;

        // Position next/prev cards vertically and slightly backwards in depth
        const y = -dist * 4.4;
        const z = -absDist * 2.8;

        const isMatch = !matchingIds || matchingIds.has(item.id);
        const opacity = Math.max(0, 1 - absDist * 0.65) * (isMatch ? 1 : 0.12);
        const scale = 1 - absDist * 0.15;
        const blur = Math.min(absDist * 4, 8);
        const isActive = i === activeIndex && isMatch;

        return (
          <group key={item.id} position={[0, y, z]}>
            <Html
              transform={false}
              center
              style={{
                pointerEvents: isActive ? 'all' : 'none',
                opacity: opacity,
              }}
            >
              <div style={{
                transform: `scale(${scale})`,
                transition: 'transform 0.1s linear, opacity 0.15s ease',
              }}>
                <ArchiveCard item={item} isActive={isActive} opacity={1} blur={blur} onClick={() => isActive && onCardClick(item)} />
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}


export default function ArchiveCylinder({ items, matchingIds, loading, onCardClick, hasSelection, selectedItemId, searchQuery }) {
  const { lowPerf } = usePerf();

  if (loading && items.length === 0) {
    return (
      <div style={{ position: 'absolute', inset: 0, background: 'var(--bg-void)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid rgba(207,163,101,0.2)', borderTopColor: 'var(--accent-gold)', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>RETRIEVING SIGNALS…</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }
  return (
    <Canvas camera={{ position: [0, 0, CAMERA_Z], fov: 50 }} style={{ background: 'transparent' }} gl={{ antialias: !lowPerf, alpha: true }}>
      <ambientLight intensity={0.15} color="#F4EFEB" />
      {!lowPerf && <CursorFlashlight />}
      <BackgroundGrid />
      {items.length > 0 && <CylinderScene items={items} matchingIds={matchingIds} onCardClick={onCardClick} hasSelection={hasSelection} selectedItemId={selectedItemId} searchQuery={searchQuery} />}
    </Canvas>
  );
}

