import { useEffect, useRef } from 'react';

/* ============================================================
   CustomCursor — Phase 5 upgrade.

   Features:
   - Warm amber dot (6px) + lagging glow ring (32px)
   - Magnetic snap: dot is attracted to buttons within 48px
     (8px snap distance, cubic falloff)
   - Reticle morph: glow ring expands 44px + rotates 45deg
     when hovering cards / archive items
   - Elastic pull-away: extra velocity burst when leaving a magnet
   - Click compress: dot scales to 60% on mousedown
   - CSS mix-blend-mode: difference on the dot for dark/light surfaces
   ============================================================ */

const MAGNETIC_RADIUS = 48;  // px — attraction starts
const MAGNETIC_PULL   = 0.28; // strength multiplier
const GLOW_LERP       = 0.09; // glow lag factor
const DOT_LERP        = 0.75; // dot lerp (still snappy but not instant)

const INTERACTIVE = [
  'button',
  'a',
  '[role="button"]',
  'input',
  'select',
  'textarea',
  '[tabindex]:not([tabindex="-1"])',
  '.archive-card',
  '.sidebar-icon-btn',
].join(', ');

export default function CustomCursor() {
  const dotRef  = useRef(null);
  const glowRef = useRef(null);
  const state   = useRef({
    // raw mouse
    mx: -200, my: -200,
    // dot actual (lerped + magnet)
    dx: -200, dy: -200,
    // glow actual (lerped)
    gx: -200, gy: -200,
    // magnet pull
    snapX: 0, snapY: 0,
    raf: null,
    isHover: false,
    isClick: false,
    // elastic rebound velocity
    velX: 0, velY: 0,
  });

  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const dot  = dotRef.current;
    const glow = glowRef.current;
    if (!dot || !glow) return;

    document.body.classList.add('custom-cursor-active');
    const s = state.current;

    /* ── Mouse position ─────────────────────────────────────── */
    const onMove = (e) => {
      s.mx = e.clientX;
      s.my = e.clientY;

      // Find nearest interactive element for magnetic snap
      let bestEl = null;
      let bestDist = MAGNETIC_RADIUS;

      document.querySelectorAll(INTERACTIVE).forEach(el => {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width  / 2;
        const cy = rect.top  + rect.height / 2;
        const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
        if (dist < bestDist) { bestDist = dist; bestEl = el; }
      });

      if (bestEl) {
        const rect = bestEl.getBoundingClientRect();
        const cx = rect.left + rect.width  / 2;
        const cy = rect.top  + rect.height / 2;
        const t = 1 - (bestDist / MAGNETIC_RADIUS); // 0→1
        const ease = t * t * (3 - 2 * t);            // smoothstep
        s.snapX = (cx - e.clientX) * ease * MAGNETIC_PULL;
        s.snapY = (cy - e.clientY) * ease * MAGNETIC_PULL;
      } else {
        // Elastic rebound
        s.velX = s.snapX * 0.4;
        s.velY = s.snapY * 0.4;
        s.snapX = 0;
        s.snapY = 0;
      }
    };

    /* ── Animation tick ─────────────────────────────────────── */
    const tick = () => {
      // Elastic decay
      s.velX *= 0.82;
      s.velY *= 0.82;

      const targetX = s.mx + s.snapX + s.velX;
      const targetY = s.my + s.snapY + s.velY;

      s.dx += (targetX - s.dx) * DOT_LERP;
      s.dy += (targetY - s.dy) * DOT_LERP;

      s.gx += (targetX - s.gx) * GLOW_LERP;
      s.gy += (targetY - s.gy) * GLOW_LERP;

      dot.style.left = `${s.dx}px`;
      dot.style.top  = `${s.dy}px`;
      glow.style.left = `${s.gx}px`;
      glow.style.top  = `${s.gy}px`;

      s.raf = requestAnimationFrame(tick);
    };

    /* ── Click compress ─────────────────────────────────────── */
    const onDown = () => {
      dot.classList.add('cursor-click');
      s.isClick = true;
    };
    const onUp = () => {
      dot.classList.remove('cursor-click');
      s.isClick = false;
    };

    /* ── Hover reticle morph ────────────────────────────────── */
    const CARD_SELECTORS = '.archive-card, [data-cursor="card"]';

    const setHover = (on, isCard = false) => {
      s.isHover = on;
      dot.classList.toggle('cursor-hover', on);
      glow.classList.toggle('cursor-hover', on);
      glow.classList.toggle('cursor-card', on && isCard);
    };

    const attachHover = () => {
      document.querySelectorAll(INTERACTIVE).forEach(el => {
        el.removeEventListener('mouseenter', el._cursorEnter);
        el.removeEventListener('mouseleave', el._cursorLeave);
        const isCard = el.matches?.(CARD_SELECTORS) ?? false;
        el._cursorEnter = () => setHover(true, isCard);
        el._cursorLeave = () => setHover(false, false);
        el.addEventListener('mouseenter', el._cursorEnter);
        el.addEventListener('mouseleave', el._cursorLeave);
      });
    };

    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mousedown', onDown);
    document.addEventListener('mouseup',   onUp);
    attachHover();

    const obs = new MutationObserver(attachHover);
    obs.observe(document.body, { childList: true, subtree: true });

    tick();

    return () => {
      document.body.classList.remove('custom-cursor-active');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('mouseup',   onUp);
      obs.disconnect();
      if (s.raf) cancelAnimationFrame(s.raf);
    };
  }, []);

  return (
    <>
      <div ref={dotRef}  className="cursor-dot"  aria-hidden="true" />
      <div ref={glowRef} className="cursor-glow" aria-hidden="true" />
    </>
  );
}
