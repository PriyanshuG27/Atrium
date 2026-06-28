/* ══════════════════════════════════════════════════════════════════════════
   AudioEngine — Cybernetic UI sound effects and voice synthesis
   Uses Web Audio API & Speech Synthesis API (zero external assets, 100% local)
   ══════════════════════════════════════════════════════════════════════════ */

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (typeof Ctor !== 'function') {
      throw new Error('AudioContext constructor not found');
    }
    audioCtx = new Ctor();
  }
  return audioCtx;
}

const AudioEngine = {
  // Sound defaults to muted to align with browser autoplay policy
  isMuted() {
    const val = localStorage.getItem('recall_muted');
    return val === null ? true : val === 'true';
  },

  setMuted(muted) {
    localStorage.setItem('recall_muted', muted ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('recall-mute-toggle', { detail: muted }));
    // Resume audio context if unmuting
    if (!muted) {
      try {
        const ctx = getAudioContext();
        if (ctx && ctx.state === 'suspended') {
          ctx.resume();
        }
      } catch (e) {
        console.warn('AudioEngine: failed to resume context', e);
      }
    }
  },

  /* ── Synthesize simple click beep ── */
  playClick() {
    if (this.isMuted()) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.09);
    } catch (e) {
      console.warn('AudioEngine: click sound failed', e);
    }
  },

  /* ── Synthesize sweep transition sound ── */
  playTransition() {
    if (this.isMuted()) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(480, ctx.currentTime + 0.35);

      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.38);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
      console.warn('AudioEngine: transition sound failed', e);
    }
  },

  /* ── Synthesize soft tag cluster chord ── */
  playClusterChord() {
    if (this.isMuted()) return;
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
      const notes = [220, 277.18, 329.63, 440]; // A major 7th feel
      
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.02);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.025, now + 0.06);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + i * 0.02);
        osc.stop(now + 0.5);
      });
    } catch (e) {
      console.warn('AudioEngine: cluster chord failed', e);
    }
  },

};

export default AudioEngine;
