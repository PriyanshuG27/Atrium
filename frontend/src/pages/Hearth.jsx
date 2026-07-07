/**
 * frontend/src/pages/Hearth.jsx
 * ==============================
 * Hearth — shared home progression for two paired users.
 *
 * State 1 (unpaired): Landing page with CSS isometric hut, invite flow,
 *                     and connection animation.
 * State 2 (paired):   Full-screen 3D BranchingPOC with minimal HUD overlay,
 *                     flip clock counter, and milestone celebration.
 */

import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';

const BranchingPOC = lazy(() => import('./BranchingPOC'));

/* ═══════════════════════════════════════════════════════════════════════════
   SCORE / STAGE HELPERS (mirrors backend/routes/hearth.py)
   ═══════════════════════════════════════════════════════════════════════════ */

function sharedDaysToScore(days) {
  if (days <= 20)  return days * 0.80;
  if (days <= 40)  return 16 + (days - 20) * 0.85;
  if (days <= 65)  return 33 + (days - 40) * 0.76;
  if (days <= 120) return 52 + (days - 65) * 0.38;
  return Math.min(96, 73 + (days - 120) * 0.30);
}

const STAGE_NAMES   = ['Hut', 'Cottage', 'House', 'Manor', 'Villa', 'Castle'];
const STAGE_EMOJIS  = { Hut:'🪵', Cottage:'🏡', House:'🏠', Manor:'🏛', Villa:'🏰', Castle:'🔒' };
const STAGE_DAYS    = { Hut:0, Cottage:20, House:40, Manor:65, Villa:120, Castle:200 };

function nextStage(stage) {
  const idx = STAGE_NAMES.indexOf(stage);
  return idx < STAGE_NAMES.length - 1 ? STAGE_NAMES[idx + 1] : null;
}
function daysToNext(stage, sharedDays) {
  const next = nextStage(stage);
  if (!next || stage === 'Castle') return null;
  return Math.max(0, STAGE_DAYS[next] - sharedDays);
}

/* ═══════════════════════════════════════════════════════════════════════════
   CSS STYLES (injected once)
   ═══════════════════════════════════════════════════════════════════════════ */

const HEARTH_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;600&family=JetBrains+Mono:wght@400;500&display=swap');

.hearth-root {
  width: 100vw; height: 100vh;
  background: #0C0B0F;
  position: relative; overflow: hidden;
  font-family: 'Outfit', sans-serif;
  color: #F0EDE8;
}

/* ── Film grain ──────────────────────────────────────────────────────────── */
.hearth-root::after {
  content: '';
  position: fixed; inset: 0; pointer-events: none; z-index: 999;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  opacity: 0.035;
}

/* ── Fog layers ──────────────────────────────────────────────────────────── */
.hearth-fog { position: absolute; inset: 0; pointer-events: none; }
.hearth-fog-1 { background: radial-gradient(ellipse 70% 50% at 50% 65%, transparent 30%, #0C0B0F 100%); }
.hearth-fog-2 { background: radial-gradient(ellipse 90% 65% at 50% 80%, transparent 40%, #0C0B0F 90%); opacity: 0.7; }
.hearth-fog-3 { background: radial-gradient(ellipse 110% 80% at 50% 100%, transparent 50%, #0C0B0F 85%); opacity: 0.5; }

/* ── Landing page ────────────────────────────────────────────────────────── */
.hearth-landing {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 0;
}

.hearth-title {
  font-size: clamp(42px, 7vw, 80px);
  font-weight: 200;
  letter-spacing: 0.55em;
  color: #F0EDE8;
  text-transform: uppercase;
  margin: 0 0 10px 0;
  opacity: 0;
  transform: translateY(18px);
  animation: hearth-fadein 0.9s cubic-bezier(0.16,1,0.3,1) 0.3s forwards;
}
.hearth-subtitle {
  font-size: 13px;
  letter-spacing: 0.22em;
  color: #8A8582;
  text-transform: lowercase;
  margin: 0 0 48px 0;
  opacity: 0;
  animation: hearth-fadein 0.7s cubic-bezier(0.16,1,0.3,1) 0.55s forwards;
}

/* ── CSS Isometric hut ───────────────────────────────────────────────────── */
.hearth-hut-wrap {
  position: relative;
  width: 180px; height: 160px;
  margin-bottom: 48px;
  opacity: 0;
  animation: hearth-fadein 0.7s cubic-bezier(0.16,1,0.3,1) 0.4s forwards;
}
.hearth-iso {
  position: absolute; top: 20px; left: 10px;
  transform: rotateX(52deg) rotateZ(-45deg);
  transform-style: preserve-3d;
}
.iso-block {
  position: absolute;
  background: #4A5880;
  border-top: 1px solid rgba(255,255,255,0.12);
  border-right: 1px solid rgba(0,0,0,0.25);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04);
  opacity: 0;
  transform: translateY(-80px);
  animation: iso-drop 0.45s cubic-bezier(0.34,1.56,0.64,1) both;
}
.iso-roof {
  position: absolute;
  background: #7A4A3A;
  clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
  opacity: 0;
  animation: hearth-fadein 0.4s ease both;
}
.iso-window {
  position: absolute;
  background: rgba(201,137,60,0.6);
  border-radius: 1px;
  box-shadow: 0 0 6px rgba(201,137,60,0.4);
}
@keyframes iso-drop {
  to { opacity: 1; transform: translateY(0); }
}

/* ── Amber firelight ─────────────────────────────────────────────────────── */
.hearth-glow {
  position: absolute;
  bottom: -28px; left: 50%; transform: translateX(-50%);
  width: 200px; height: 60px;
  background: radial-gradient(ellipse, rgba(201,137,60,0.22) 0%, transparent 70%);
  animation: glow-breathe 3.2s ease-in-out infinite;
  pointer-events: none;
}
@keyframes glow-breathe {
  0%,100% { opacity: 0.55; transform: translateX(-50%) scaleX(1); }
  50%      { opacity: 1.0;  transform: translateX(-50%) scaleX(1.12); }
}

/* ── Pairing card ────────────────────────────────────────────────────────── */
.hearth-card {
  background: rgba(20,18,24,0.88);
  border: 1px solid rgba(240,237,232,0.08);
  border-radius: 12px;
  padding: 24px 28px;
  width: min(400px, 90vw);
  display: flex; flex-direction: column; align-items: center; gap: 20px;
  opacity: 0;
  transform: translateY(24px);
  animation: hearth-spring 0.6s cubic-bezier(0.34,1.56,0.64,1) 1.0s forwards;
  backdrop-filter: blur(12px);
}
@keyframes hearth-fadein { to { opacity: 1; transform: translateY(0); } }
@keyframes hearth-spring  { to { opacity: 1; transform: translateY(0); } }

/* ── Avatar connector ────────────────────────────────────────────────────── */
.hearth-avatars {
  display: flex; align-items: center; gap: 0; width: 100%;
}
.hearth-avatar-slot {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  flex: 0 0 72px;
}
.hearth-avatar-circle {
  width: 52px; height: 52px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; font-weight: 600;
  position: relative;
}
.hearth-avatar-circle.self-avatar {
  background: rgba(124,111,212,0.15);
  border: 1.5px solid rgba(124,111,212,0.45);
  color: #7C6FD4;
}
.hearth-avatar-circle.partner-empty {
  background: rgba(240,237,232,0.04);
  border: 1.5px dashed rgba(240,237,232,0.2);
  color: #4A4845;
  animation: pulse-ring 2s ease-in-out infinite;
}
.hearth-avatar-circle.partner-filled {
  background: rgba(61,170,138,0.15);
  border: 1.5px solid rgba(61,170,138,0.45);
  color: #3DAA8A;
  animation: partner-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both;
}
@keyframes pulse-ring {
  0%,100% { box-shadow: 0 0 0 0 rgba(240,237,232,0.06); }
  50%      { box-shadow: 0 0 0 6px rgba(240,237,232,0); }
}
@keyframes partner-pop {
  from { transform: scale(0); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}
.hearth-avatar-label {
  font-size: 10px; letter-spacing: 0.1em; color: #4A4845; text-transform: uppercase;
}
.hearth-connector {
  flex: 1; height: 1px;
  background: linear-gradient(90deg, rgba(124,111,212,0.3), rgba(240,237,232,0.06), rgba(61,170,138,0.2));
  position: relative; overflow: hidden;
}
.hearth-connector-light {
  position: absolute; top: 0; left: -100%; width: 100%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(240,237,232,0.6), transparent);
  animation: connector-travel 2s ease-in-out infinite 1.2s;
}
@keyframes connector-travel {
  0%   { left: -100%; }
  100% { left: 100%; }
}

/* ── Invite code ─────────────────────────────────────────────────────────── */
.hearth-code-wrap {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  background: rgba(240,237,232,0.04);
  border: 1px solid rgba(240,237,232,0.07);
  border-radius: 6px; width: 100%;
}
.hearth-code-text {
  font-family: 'JetBrains Mono', monospace;
  font-size: 15px; letter-spacing: 0.12em;
  color: #C9893C; flex: 1;
}
.hearth-code-btn {
  background: none; border: none; cursor: pointer; padding: 4px;
  color: #8A8582; font-size: 11px; letter-spacing: 0.1em;
  font-family: 'JetBrains Mono', monospace;
  transition: color 0.2s;
}
.hearth-code-btn:hover { color: #F0EDE8; }

.hearth-cta-btn {
  width: 100%; padding: 12px;
  background: rgba(201,137,60,0.1);
  border: 1px solid rgba(201,137,60,0.25);
  border-radius: 6px; cursor: pointer;
  font-family: 'Outfit', sans-serif;
  font-size: 13px; letter-spacing: 0.18em; text-transform: uppercase;
  color: #C9893C;
  transition: background 0.2s, border-color 0.2s;
}
.hearth-cta-btn:hover {
  background: rgba(201,137,60,0.18);
  border-color: rgba(201,137,60,0.4);
}
.hearth-accept-input {
  width: 100%; padding: 10px 12px;
  background: rgba(240,237,232,0.04);
  border: 1px solid rgba(240,237,232,0.1);
  border-radius: 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px; color: #F0EDE8;
  outline: none; letter-spacing: 0.1em;
  transition: border-color 0.2s;
}
.hearth-accept-input:focus { border-color: rgba(124,111,212,0.4); }
.hearth-accept-input::placeholder { color: #4A4845; }

/* ── Connection animation overlay ────────────────────────────────────────── */
.hearth-connect-overlay {
  position: fixed; inset: 0; z-index: 100;
  display: flex; align-items: center; justify-content: center;
  background: rgba(12,11,15,0);
  animation: connect-darken 0.4s ease 2s forwards;
  pointer-events: none;
}
@keyframes connect-darken { to { background: rgba(12,11,15,0.92); } }
.hearth-first-flame {
  font-size: 28px; font-weight: 200;
  letter-spacing: 0.35em; color: #F0EDE8;
  text-transform: uppercase;
  opacity: 0;
  animation: flame-text 2s ease 2.6s forwards;
}
@keyframes flame-text {
  0%   { opacity: 0; transform: translateY(8px); }
  20%  { opacity: 1; transform: translateY(0); }
  80%  { opacity: 1; }
  100% { opacity: 0; }
}

/* ── Active HUD ──────────────────────────────────────────────────────────── */
.hearth-hud {
  position: absolute; inset: 0; pointer-events: none; z-index: 10;
}
.hearth-hud-top {
  position: absolute; top: 0; left: 0; right: 0;
  padding: 20px 24px;
  display: flex; align-items: center; justify-content: space-between;
  background: linear-gradient(to bottom, rgba(12,11,15,0.7) 0%, transparent 100%);
  pointer-events: auto;
}
.hearth-partner-info {
  display: flex; align-items: center; gap: 10px;
}
.hearth-partner-avatar {
  width: 34px; height: 34px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 600;
  background: rgba(61,170,138,0.15);
  border: 1.5px solid rgba(61,170,138,0.3);
  color: #3DAA8A; position: relative;
}
.hearth-partner-dot {
  position: absolute; bottom: -1px; right: -1px;
  width: 9px; height: 9px; border-radius: 50%;
  border: 1.5px solid #0C0B0F;
}
.hearth-partner-dot.active-today  { background: #3DAA8A; box-shadow: 0 0 5px #3DAA8A88; }
.hearth-partner-dot.active-recent { background: #C9893C; }
.hearth-partner-dot.inactive      { background: #4A4845; }
.hearth-partner-text { display: flex; flex-direction: column; gap: 1px; }
.hearth-partner-name { font-size: 13px; font-weight: 400; color: #F0EDE8; }
.hearth-partner-status {
  font-size: 10px; letter-spacing: 0.12em;
  font-family: 'JetBrains Mono', monospace; color: #8A8582;
}
.hearth-hud-settings {
  background: none; border: none; cursor: pointer;
  color: #4A4845; font-size: 18px; padding: 6px;
  pointer-events: auto; transition: color 0.2s;
}
.hearth-hud-settings:hover { color: #8A8582; }

.hearth-hud-bottom {
  position: absolute; bottom: 0; left: 0; right: 0;
  padding: 0 24px 28px;
  background: linear-gradient(to top, rgba(12,11,15,0.75) 0%, transparent 100%);
  display: flex; align-items: flex-end; justify-content: space-between; gap: 16px;
}
.hearth-progress-card {
  display: flex; flex-direction: column; gap: 7px;
  min-width: 200px;
}
.hearth-stage-label {
  font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase;
  color: #8A8582; font-family: 'JetBrains Mono', monospace;
}
.hearth-stage-name {
  font-size: 20px; font-weight: 300; color: #F0EDE8;
  letter-spacing: 0.06em;
}
.hearth-progress-track {
  height: 2px; background: rgba(240,237,232,0.08); border-radius: 1px; overflow: hidden;
}
.hearth-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #7C6FD4, #C9893C);
  border-radius: 1px;
  transition: width 1.4s cubic-bezier(0.16,1,0.3,1);
  position: relative; overflow: hidden;
}
.hearth-progress-fill::after {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%);
  background-size: 200% 100%;
  animation: shimmer 2.5s ease-in-out infinite;
}
@keyframes shimmer {
  0%,100% { background-position: -100% 0; }
  50%      { background-position: 200% 0; }
}
.hearth-next-label {
  font-size: 10px; color: #4A4845;
  font-family: 'JetBrains Mono', monospace;
}

/* ── Flip clock ──────────────────────────────────────────────────────────── */
.hearth-days-card {
  display: flex; flex-direction: column; align-items: flex-end; gap: 4px;
}
.hearth-flip-counter {
  display: flex; align-items: baseline; gap: 3px;
}
.flip-digit-wrap {
  display: inline-block; perspective: 60px;
}
.flip-digit {
  font-family: 'JetBrains Mono', monospace;
  font-size: 28px; font-weight: 500;
  color: #C9893C; display: block;
  transition: transform 0.3s ease, opacity 0.2s;
}
.flip-digit.flipping {
  transform: rotateX(90deg); opacity: 0;
}
.hearth-days-label {
  font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase;
  color: #4A4845; font-family: 'JetBrains Mono', monospace; margin-top: 2px;
}

/* ── Milestone overlay ───────────────────────────────────────────────────── */
.hearth-milestone {
  position: fixed; inset: 0; z-index: 200;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 20px;
  background: rgba(12,11,15,0.93);
  animation: hearth-fadein 0.35s ease both;
}
.hearth-milestone-emoji {
  font-size: 80px; line-height: 1;
  animation: emoji-spring 0.65s cubic-bezier(0.34,1.56,0.64,1) both;
}
@keyframes emoji-spring {
  from { transform: scale(0); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}
.hearth-milestone-stage {
  font-size: clamp(28px, 5vw, 52px);
  font-weight: 200; letter-spacing: 0.45em;
  text-transform: uppercase; color: #F0EDE8;
}
.hearth-milestone-sub {
  font-size: 14px; color: #8A8582; max-width: 340px; text-align: center; line-height: 1.6;
}
.hearth-milestone-path {
  display: flex; align-items: center; gap: 8px;
  font-size: 11px; letter-spacing: 0.14em; font-family: 'JetBrains Mono', monospace;
  color: #4A4845;
}
.hearth-milestone-path .active-stage { color: #7C6FD4; }
.hearth-milestone-actions {
  display: flex; gap: 12px; margin-top: 8px;
}
.btn-milestone-primary {
  padding: 11px 24px;
  background: linear-gradient(135deg, rgba(201,137,60,0.2), rgba(201,137,60,0.1));
  border: 1px solid rgba(201,137,60,0.35);
  border-radius: 6px; cursor: pointer;
  font-family: 'Outfit', sans-serif;
  font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase;
  color: #C9893C; transition: background 0.2s;
}
.btn-milestone-primary:hover { background: rgba(201,137,60,0.25); }
.btn-milestone-secondary {
  padding: 11px 24px;
  background: none; border: 1px solid rgba(240,237,232,0.1);
  border-radius: 6px; cursor: pointer;
  font-family: 'Outfit', sans-serif;
  font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase;
  color: #8A8582; transition: border-color 0.2s, color 0.2s;
}
.btn-milestone-secondary:hover { border-color: rgba(240,237,232,0.22); color: #F0EDE8; }

/* ── Block toast ─────────────────────────────────────────────────────────── */
.hearth-toast {
  position: fixed; top: 24px; right: 24px; z-index: 150;
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px;
  background: rgba(20,18,24,0.92);
  border: 1px solid rgba(240,237,232,0.1);
  border-radius: 8px; backdrop-filter: blur(8px);
  animation: toast-in 0.4s cubic-bezier(0.34,1.56,0.64,1) both;
}
.hearth-toast.hiding { animation: toast-out 0.3s cubic-bezier(0.4,0,1,1) both; }
@keyframes toast-in  { from { transform: translateX(120%); opacity:0; } to { transform:translateX(0); opacity:1; } }
@keyframes toast-out { to   { transform: translateX(120%); opacity:0; } }
.toast-icon { font-size: 18px; }
.toast-title { font-size: 13px; font-weight: 500; color: #F0EDE8; }
.toast-sub   { font-size: 11px; color: #8A8582; font-family: 'JetBrains Mono', monospace; margin-top: 1px; }

/* ── Partner glow on canvas ─────────────────────────────────────────────── */
.hearth-canvas-wrap { position: absolute; inset: 0; }
.hearth-canvas-wrap.partner-active-today {
  animation: partner-glow 3s ease-in-out infinite;
}
@keyframes partner-glow {
  0%,100% { box-shadow: 0 0 0 0 rgba(61,170,138,0); }
  50%      { box-shadow: inset 0 0 60px rgba(61,170,138,0.06); }
}
`;

/* ═══════════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

/** Pure-CSS isometric hut — zero Three.js overhead */
function CSSHut() {
  const blocks = [
    // [left, top, width, height, delay]
    [60,  90,  60, 20, 0],
    [20,  70,  60, 20, 80],
    [100, 70,  60, 20, 160],
    [40,  50,  60, 20, 240],
    [80,  50,  60, 20, 320],
    [60,  30,  60, 20, 400],
  ];
  return (
    <div className="hearth-hut-wrap">
      <div className="hearth-iso">
        {blocks.map(([l, t, w, h, d], i) => (
          <div key={i} className="iso-block" style={{
            left: l, top: t, width: w, height: h,
            animationDelay: `${d}ms`,
          }}>
            <div className="iso-window" style={{ width:8, height:8, top:4, left:20 }} />
          </div>
        ))}
        {/* Roof */}
        <div className="iso-roof" style={{
          left: 40, top: 0, width: 100, height: 36,
          animationDelay: '520ms',
        }} />
      </div>
      <div className="hearth-glow" />
    </div>
  );
}

/** Flip clock digit */
function FlipDigit({ value }) {
  const [display, setDisplay] = useState(String(value).padStart(2, '0'));
  const [flipping, setFlipping] = useState(false);

  useEffect(() => {
    const next = String(value).padStart(2, '0');
    if (next === display) return;
    setFlipping(true);
    const t = setTimeout(() => { setDisplay(next); setFlipping(false); }, 300);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <div className="flip-digit-wrap">
      <span className={`flip-digit ${flipping ? 'flipping' : ''}`}>{display}</span>
    </div>
  );
}

function FlipClock({ days }) {
  const d = String(days).padStart(3, '0');
  return (
    <div className="hearth-flip-counter">
      {d.split('').map((ch, i) => <FlipDigit key={i} value={ch} />)}
    </div>
  );
}

/** Stage milestone overlay */
function MilestoneOverlay({ stage, partnerName, sharedDays, onDismiss }) {
  const prev = STAGE_NAMES[STAGE_NAMES.indexOf(stage) - 1] || 'Hut';
  return (
    <div className="hearth-milestone">
      <div className="hearth-milestone-emoji">{STAGE_EMOJIS[stage]}</div>
      <div className="hearth-milestone-stage">{stage}</div>
      <div className="hearth-milestone-sub">
        You and {partnerName} have been building together for {sharedDays} days
      </div>
      <div className="hearth-milestone-path">
        {STAGE_NAMES.filter(s => s !== 'Castle').map((s, i) => (
          <span key={s}>
            <span className={s === stage ? 'active-stage' : ''}>{s.toUpperCase()}</span>
            {i < STAGE_NAMES.length - 2 && <span> ——— </span>}
          </span>
        ))}
      </div>
      <div className="hearth-milestone-actions">
        <button className="btn-milestone-primary" onClick={() => {
          if (navigator.share) {
            navigator.share({ title: `${stage} unlocked!`, text: `${sharedDays} days together on Recall Hearth 🔥` });
          }
        }}>Share this moment</button>
        <button className="btn-milestone-secondary" onClick={onDismiss}>Continue building</button>
      </div>
    </div>
  );
}

/** Block drop toast */
function BlockToast({ days, onHide }) {
  const [hiding, setHiding] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => { setHiding(true); setTimeout(onHide, 350); }, 3000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={`hearth-toast ${hiding ? 'hiding' : ''}`}>
      <span className="toast-icon">🏗</span>
      <div>
        <div className="toast-title">Block placed</div>
        <div className="toast-sub">{days} days together</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function Hearth() {
  const [hearthData,   setHearthData]   = useState(null);   // null = loading
  const [loading,      setLoading]      = useState(true);
  const [inviteCode,   setInviteCode]   = useState('');
  const [acceptInput,  setAcceptInput]  = useState('');
  const [acceptErr,    setAcceptErr]    = useState('');
  const [connecting,   setConnecting]   = useState(false);  // connection anim
  const [milestone,    setMilestone]    = useState(null);   // stage name or null
  const [toast,        setToast]        = useState(false);
  const [copied,       setCopied]       = useState(false);
  const prevStageRef = useRef(null);

  /* ── Fetch hearth state ─────────────────────────────────────────────── */
  const fetchHearth = useCallback(async () => {
    try {
      const r = await fetch('/api/hearth', { credentials: 'include' });
      if (!r.ok) return;
      const data = await r.json();
      setHearthData(prev => {
        // Detect stage change → show milestone
        if (prev && prev.stage !== data.stage && data.stage !== 'Hut') {
          setMilestone(data.stage);
        }
        // Detect score increase → show block toast
        if (prev && data.score > prev.score) {
          setToast(true);
        }
        return data;
      });
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchHearth();
    const interval = setInterval(fetchHearth, 30_000); // poll every 30s
    return () => clearInterval(interval);
  }, [fetchHearth]);

  /* ── Generate invite ────────────────────────────────────────────────── */
  const generateInvite = async () => {
    try {
      const r = await fetch('/api/hearth/invite', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (d.invite_code) setInviteCode(d.invite_code);
    } catch { /* ignore */ }
  };

  /* ── Accept invite ──────────────────────────────────────────────────── */
  const acceptInvite = async () => {
    setAcceptErr('');
    try {
      const r = await fetch('/api/hearth/accept', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_code: acceptInput.trim() }),
      });
      const d = await r.json();
      if (d.success) {
        setConnecting(true);
        setTimeout(() => {
          setConnecting(false);
          fetchHearth();
        }, 4500);
      } else {
        setAcceptErr(d.detail || 'Invalid code');
      }
    } catch { setAcceptErr('Something went wrong'); }
  };

  /* ── Copy code ──────────────────────────────────────────────────────── */
  const copyCode = () => {
    navigator.clipboard.writeText(inviteCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  /* ── LOADING ────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="hearth-root">
        <style>{HEARTH_CSS}</style>
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:11, letterSpacing:'0.2em', color:'#4A4845' }}>
            LIGHTING...
          </span>
        </div>
      </div>
    );
  }

  const isPaired = hearthData?.is_paired;

  /* ── ACTIVE STATE (paired) ──────────────────────────────────────────── */
  if (isPaired) {
    const { score, shared_days, stage, partner_name, partner_active_today, self_active_today } = hearthData;
    const progressPct = Math.min(100, (score / 96) * 100);
    const toNext      = daysToNext(stage, shared_days);
    const dotClass    = partner_active_today ? 'active-today' : (shared_days > 0 ? 'active-recent' : 'inactive');

    return (
      <div className="hearth-root">
        <style>{HEARTH_CSS}</style>

        {/* 3D building full screen */}
        <div className={`hearth-canvas-wrap ${partner_active_today ? 'partner-active-today' : ''}`}>
          <Suspense fallback={<div style={{ background:'#0C0B0F', inset:0, position:'absolute' }} />}>
            <BranchingPOC externalScore={score} hearthMode />
          </Suspense>
        </div>

        {/* HUD */}
        <div className="hearth-hud">
          {/* Top bar */}
          <div className="hearth-hud-top">
            <div className="hearth-partner-info">
              <div className="hearth-partner-avatar">
                {partner_name?.[0]?.toUpperCase() || '?'}
                <div className={`hearth-partner-dot ${dotClass}`} />
              </div>
              <div className="hearth-partner-text">
                <span className="hearth-partner-name">{partner_name}</span>
                <span className="hearth-partner-status">
                  {partner_active_today ? '● active today' : '● last seen recently'}
                </span>
              </div>
            </div>
            <button className="hearth-hud-settings" title="Settings">⚙</button>
          </div>

          {/* Bottom bar */}
          <div className="hearth-hud-bottom">
            <div className="hearth-progress-card">
              <span className="hearth-stage-label">Current Stage</span>
              <span className="hearth-stage-name">{stage} {STAGE_EMOJIS[stage]}</span>
              <div className="hearth-progress-track">
                <div className="hearth-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="hearth-next-label">
                {toNext !== null ? `${toNext} more days to ${nextStage(stage)}` : 'Maximum stage reached'}
              </span>
            </div>
            <div className="hearth-days-card">
              <FlipClock days={shared_days} />
              <span className="hearth-days-label">Days Together</span>
            </div>
          </div>
        </div>

        {/* Toast */}
        {toast && <BlockToast days={shared_days} onHide={() => setToast(false)} />}

        {/* Milestone */}
        {milestone && (
          <MilestoneOverlay
            stage={milestone}
            partnerName={partner_name}
            sharedDays={shared_days}
            onDismiss={() => setMilestone(null)}
          />
        )}
      </div>
    );
  }

  /* ── LANDING STATE (unpaired) ───────────────────────────────────────── */
  return (
    <div className="hearth-root">
      <style>{HEARTH_CSS}</style>

      {/* Fog layers */}
      <div className="hearth-fog hearth-fog-1" />
      <div className="hearth-fog hearth-fog-2" />
      <div className="hearth-fog hearth-fog-3" />

      {/* Connection animation overlay */}
      {connecting && (
        <div className="hearth-connect-overlay">
          <span className="hearth-first-flame">Your first flame</span>
        </div>
      )}

      <div className="hearth-landing">
        <h1 className="hearth-title">Hearth</h1>
        <p className="hearth-subtitle">A home grows where curiosity lives</p>

        <CSSHut />

        <div className="hearth-card">
          {/* Avatar connector */}
          <div className="hearth-avatars">
            <div className="hearth-avatar-slot">
              <div className="hearth-avatar-circle self-avatar">✦</div>
              <span className="hearth-avatar-label">You</span>
            </div>
            <div className="hearth-connector">
              <div className="hearth-connector-light" />
            </div>
            <div className="hearth-avatar-slot">
              <div className={`hearth-avatar-circle ${inviteCode ? 'partner-empty' : 'partner-empty'}`}>
                {inviteCode ? '···' : '+'}
              </div>
              <span className="hearth-avatar-label">Waiting…</span>
            </div>
          </div>

          {/* Invite code display */}
          {inviteCode ? (
            <div className="hearth-code-wrap">
              <span className="hearth-code-text">{inviteCode}</span>
              <button className="hearth-code-btn" onClick={copyCode}>
                {copied ? 'COPIED' : 'COPY'}
              </button>
              <button className="hearth-code-btn" onClick={() => {
                if (navigator.share) navigator.share({
                  title: 'Light my Hearth',
                  text: `Join me on Recall Hearth: ${inviteCode}`,
                  url: `https://t.me/recall_bot?start=hearth_${inviteCode}`,
                });
              }}>SHARE</button>
            </div>
          ) : (
            <button className="hearth-cta-btn" onClick={generateInvite}>
              Light your Hearth
            </button>
          )}

          {/* Accept someone else's invite */}
          <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:8 }}>
            <input
              className="hearth-accept-input"
              placeholder="Have a code? Enter it here — RCL-XXXX-XXXX"
              value={acceptInput}
              onChange={e => setAcceptInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && acceptInvite()}
            />
            {acceptInput.length > 3 && (
              <button className="hearth-cta-btn" style={{ marginTop:0 }} onClick={acceptInvite}>
                Join Hearth
              </button>
            )}
            {acceptErr && (
              <span style={{ fontSize:11, color:'#8A5A3A', letterSpacing:'0.08em', fontFamily:'JetBrains Mono,monospace' }}>
                {acceptErr}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
