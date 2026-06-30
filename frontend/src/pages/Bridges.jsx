import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  UserPlus, Key, Eye, Trash, ArrowLeft, ChartBar, SealCheck, Lock, ClockCounterClockwise
} from '@phosphor-icons/react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import AudioEngine from '../utils/AudioEngine';

/* ── Custom SVGs ────────────────────────────────────────────────────────── */
const GitCompare = ({ size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="18" r="3" />
    <circle cx="6" cy="6" r="3" />
    <path d="M13 6h3a2 2 0 0 1 2 2v7" />
    <path d="M11 18H8a2 2 0 0 1-2-2V9" />
  </svg>
);

const Sparkles = ({ size = 20, color = 'currentColor', className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 3v3m0 12v3M5.6 5.6l2.1 2.1m8.6 8.6l2.1 2.1M3 12h3m12 0h3M5.6 18.4l2.1-2.1m8.6-8.6l2.1-2.1" />
  </svg>
);

/* Palette Colors */
const COLOR_GOLD = '#d4af37';
const COLOR_CERAMIC_WARM = '#d8cca3'; // Glazed Ochre
const COLOR_CERAMIC_WHITE = '#3e3a36'; // Dark Basalt/Slate
const COLOR_GLOW_AMBER = '#a68c5b';
const COLOR_BARK = '#a39785'; // Travertine/Alabaster Limestone
const COLOR_CHARCOAL = '#070709';

export default function Bridges() {
  const [unlocked, setUnlocked] = useState(false);
  const [itemCount, setItemCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [bridges, setBridges] = useState([]);
  const [selectedBridgeId, setSelectedBridgeId] = useState(null);
  const [bridgeDetails, setBridgeDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  
  // Connection states
  const [inviteCode, setInviteCode] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectionSuccess, setConnectionSuccess] = useState(false);
  
  // Active selected matched card inside 3D Canvas
  const [activeSynapseIdx, setActiveSynapseIdx] = useState(null);

  // Audio helper
  const playSound = (type) => {
    try {
      if (type === 'click') AudioEngine.playClick();
      else if (type === 'transition') AudioEngine.playTransition();
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  };

  /* ── Load initial details ───────────────────────────────────────────────── */
  const fetchData = useCallback(async () => {
    try {
      const meRes = await fetch('/api/me');
      if (meRes.ok) {
        const meData = await meRes.json();
        const savesCount = meData.total_saves || 0;
        setItemCount(savesCount);
        if (savesCount >= 50) setUnlocked(true);
      }

      const bridgesRes = await fetch('/api/bridges');
      if (bridgesRes.ok) {
        const list = await bridgesRes.json();
        setBridges(list);
      }
    } catch (err) {
      console.error('Failed to load bridges:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── Create invite code ─────────────────────────────────────────────────── */
  const generateCode = async () => {
    playSound('click');
    try {
      const res = await fetch('/api/bridges/invite', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setGeneratedCode(data.invite_code);
      }
    } catch (e) {
      console.error('Failed to generate invite code:', e);
    }
  };

  /* ── Connect code ───────────────────────────────────────────────────────── */
  const connectLink = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    playSound('click');
    setConnecting(true);
    
    try {
      const res = await fetch('/api/bridges/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_code: inviteCode.trim() })
      });
      
      if (res.ok) {
        setConnectionSuccess(true);
        playSound('transition');
        setTimeout(() => {
          setConnectionSuccess(false);
          setInviteCode('');
          fetchData();
        }, 3200);
      } else {
        const err = await res.json();
        alert(err.detail || 'Connection failed.');
      }
    } catch (e) {
      console.error('Connection failed:', e);
    } finally {
      setConnecting(false);
    }
  };

  /* ── Get bridge details ─────────────────────────────────────────────────── */
  const selectBridge = async (bridgeId) => {
    playSound('click');
    setSelectedBridgeId(bridgeId);
    setDetailsLoading(true);
    
    try {
      const res = await fetch(`/api/bridges/${bridgeId}`);
      if (res.ok) {
        const data = await res.json();
        setBridgeDetails(data);
        setActiveSynapseIdx(null);
      }
    } catch (err) {
      console.error('Failed to load bridge details:', err);
    } finally {
      setDetailsLoading(false);
    }
  };

  /* ── Dissolve connection ────────────────────────────────────────────────── */
  const deleteBridge = async (bridgeId) => {
    if (!confirm('Dissolve this cognitive bridge?')) return;
    playSound('click');
    try {
      const res = await fetch(`/api/bridges/${bridgeId}`, { method: 'DELETE' });
      if (res.ok) {
        setSelectedBridgeId(null);
        setBridgeDetails(null);
        fetchData();
      }
    } catch (e) {
      console.error('Failed to dissolve bridge:', e);
    }
  };

  /* Loading State */
  if (loading) {
    return (
      <div className="br-obsidian-loader">
        <ClockCounterClockwise size={32} className="spin-loader" />
        <div className="loader-lbl">CONNECTING TO OBSERVED MIND...</div>
      </div>
    );
  }

  /* Locked Milestone Screen */
  if (!unlocked) {
    const progress = Math.min(100, (itemCount / 50) * 100);
    return (
      <div className="br-locked-viewport">
        <style>{stylesCss}</style>
        <div className="starfield-bg" />
        <div className="br-locked-card">
          <div className="lock-avatar">
            <Lock size={32} color="var(--accent-gold)" />
          </div>
          <h1 className="locked-card-title">COGNITIVE COMPATIBILITY</h1>
          <p className="locked-card-desc">
            Unlock neural sharing links to blend mental maps, compare specialties, and calculate overlap indices. 
          </p>
          <div className="progress-meter">
            <div className="progress-meter-hdr">
              <span>Saves mapped</span>
              <span>{itemCount} / 50</span>
            </div>
            <div className="progress-meter-track">
              <div className="progress-meter-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="locked-footer-alert">
            <span className="alert-dot" />
            COMPATIBILITY CHANNEL SHIELD ACTIVE
          </div>
        </div>
      </div>
    );
  }

  /* ── Observatory View: Dual Mycelium Root Network ──────────────────────── */
  if (selectedBridgeId) {
    const activeSynapse = activeSynapseIdx !== null ? bridgeDetails?.synapses?.[activeSynapseIdx] : null;

    return (
      <div className="br-observatory-view-fullscreen">
        <style>{stylesCss}</style>
        
        {/* Navigation control rail */}
        <div className="obs-header" style={{
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 2rem',
          borderBottom: '1px solid #1E1810',
          background: '#0D0B09',
          boxSizing: 'border-box',
          zIndex: 100
        }}>
          <button className="obs-back-btn" onClick={() => { playSound('click'); setSelectedBridgeId(null); setBridgeDetails(null); setActiveSynapseIdx(null); }} style={{
            background: 'none',
            border: 'none',
            outline: 'none',
            color: '#5A4A32',
            fontFamily: 'var(--font-mono)',
            fontSize: '7px',
            letterSpacing: '0.15em',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <ArrowLeft size={10} style={{ color: '#C8841A' }} />
            <span>DISMISS OBSERVATION</span>
          </button>
          
          <div className="obs-title-wrap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem' }}>
            <div className="obs-badge" style={{ fontFamily: 'var(--font-mono)', fontSize: '7px', letterSpacing: '0.15em', color: '#4A3A22' }}>INTERFERENCE PATTERN</div>
            <h1 className="obs-title" style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '20px', fontWeight: 'normal', color: '#E8DEC8', margin: 0 }}>
              {bridgeDetails ? bridgeDetails.friend_name.toUpperCase() : '...' } <span style={{ color: '#C8841A', fontSize: '22px', margin: '0 4px', verticalAlign: 'middle' }}>&times;</span> COGNITIVE BLEND
            </h1>
          </div>

          <button className="obs-dissolve-btn" onClick={() => deleteBridge(selectedBridgeId)} style={{
            background: 'none',
            border: 'none',
            outline: 'none',
            color: '#5A4A32',
            fontFamily: 'var(--font-mono)',
            fontSize: '7px',
            letterSpacing: '0.15em',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Trash size={10} style={{ color: '#C8841A' }} />
            <span>DISSOLVE</span>
          </button>
        </div>

        {detailsLoading || !bridgeDetails ? (
          <div className="obs-details-loader" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', background: '#0D0B09' }}>
            <ClockCounterClockwise size={32} className="spin-loader" />
            <div className="loader-lbl">INTERWEAVING NEURAL PATHWAYS...</div>
          </div>
        ) : (
          <div className="obs-editorial-layout slide-in-view" style={{
            display: 'flex',
            flex: 1,
            width: '100%',
            height: 'calc(100vh - 64px)',
            position: 'relative'
          }}>
            
            {/* LEFT STRIP (64px wide, vertical) */}
            <div style={{
              width: '64px',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              paddingTop: '2rem',
              background: '#0D0B09',
              borderRight: '1px solid #1E1810',
              boxSizing: 'border-box',
              zIndex: 10
            }}>
              {/* Matte ceramic disc monogram */}
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: '#E8E0D4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0D0B09',
                fontSize: '10px',
                fontWeight: 'bold',
                fontFamily: 'var(--font-mono)',
                marginBottom: '2.5rem'
              }}>
                {bridgeDetails ? bridgeDetails.user_mind_type?.slice(0, 2).toUpperCase() || 'ME' : 'ME'}
              </div>
              
              {/* Rotated label "YOUR ARCHIVE" */}
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '7px',
                letterSpacing: '0.15em',
                color: '#5A4A32',
                textTransform: 'uppercase',
                writingMode: 'vertical-lr',
                transform: 'rotate(180deg)',
                whiteSpace: 'nowrap'
              }}>
                YOUR ARCHIVE
              </div>
            </div>

            {/* CENTER CANVAS (fills remaining left ~65% of screen) */}
            <div style={{
              flex: '1 1 65%',
              height: '100%',
              position: 'relative',
              overflow: 'hidden',
              background: '#0D0B09'
            }}>
              <WaveInterferencePool 
                synapses={bridgeDetails.synapses}
                activeIndex={activeSynapseIdx}
                onSelectIndex={(idx) => {
                  playSound('click');
                  setActiveSynapseIdx(idx);
                }}
                compatibilityScore={bridgeDetails.compatibility_score}
              />
              {/* Instruction overlay */}
              <div style={{
                position: 'absolute',
                bottom: 24,
                left: 0,
                right: 0,
                textAlign: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: '8px',
                letterSpacing: '0.15em',
                color: '#3D2A14',
                textTransform: 'uppercase',
                pointerEvents: 'none',
                zIndex: 10
              }}>
                OBSERVE · HOVER NODES · CLICK TO DECODE
              </div>
            </div>

            {/* RIGHT PANEL (35% width, full height, border-left 1px solid #1E1810) */}
            <div className="obs-editorial-sidebar" style={{
              width: '35%',
              minWidth: '320px',
              height: '100%',
              borderLeft: '1px solid #1E1810',
              background: '#100E0B',
              overflow: 'hidden',
              position: 'relative',
              boxSizing: 'border-box'
            }}>
              {/* Slide Container */}
              <div style={{
                display: 'flex',
                width: '200%',
                height: '100%',
                transform: activeSynapseIdx !== null ? 'translateX(-50%)' : 'translateX(0)',
                transition: 'transform 240ms cubic-bezier(0.16, 1, 0.3, 1)'
              }}>
                {/* PANEL A: DEFAULT STATE */}
                <div style={{
                  width: '50%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '2.5rem 2rem',
                  boxSizing: 'border-box',
                  overflowY: 'auto'
                }}>
                  {/* Top section: MUTUAL OVERLAP INDEX */}
                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '7px',
                    letterSpacing: '0.15em',
                    color: '#4A3A22',
                    textTransform: 'uppercase',
                    marginBottom: '0.5rem'
                  }}>
                    MUTUAL OVERLAP INDEX
                  </div>

                  {/* Overlap Percentage Large treated numeral */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    fontFamily: '"Cormorant Garamond", serif',
                    color: '#C8841A',
                    marginBottom: '1rem',
                    lineHeight: 1
                  }}>
                    <span style={{ fontSize: '72px', fontWeight: '300' }}>
                      {Math.floor(bridgeDetails.compatibility_score || 0)}
                    </span>
                    <span style={{ fontSize: '32px', fontWeight: '300' }}>
                      .{Math.round(((bridgeDetails.compatibility_score || 0) % 1) * 10)}
                    </span>
                    <span style={{ fontSize: '48px', fontWeight: '300', marginLeft: '2px' }}>
                      %
                    </span>
                  </div>

                  {/* Restrained horizontal amber line */}
                  <div style={{
                    width: '32px',
                    height: '1px',
                    background: '#C8841A',
                    marginBottom: '1.25rem'
                  }} />

                  {/* Interpretive text */}
                  <p style={{
                    fontFamily: '"Cormorant Garamond", serif',
                    fontStyle: 'italic',
                    fontSize: '13px',
                    color: '#8A7560',
                    lineHeight: '1.4',
                    margin: '0 0 2rem 0'
                  }}>
                    {getInterpretiveText(bridgeDetails.compatibility_score)}
                  </p>

                  {/* 1px divider */}
                  <div style={{
                    width: '100%',
                    height: '1px',
                    background: '#1E1810',
                    marginBottom: '1.5rem'
                  }} />

                  {/* FACET LIST */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    flex: 1
                  }}>
                    {bridgeDetails.synapses.map((syn, idx) => (
                      <div 
                        key={idx}
                        className="facet-row-item"
                        onClick={() => {
                          playSound('click');
                          setActiveSynapseIdx(idx);
                        }}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '1rem 0.5rem',
                          borderBottom: '1px solid #1E1810',
                          cursor: 'pointer',
                          position: 'relative',
                          transition: 'background-color 0.2s'
                        }}
                      >
                        {/* 1px Left Accent Bar */}
                        <div className="hover-accent-bar" style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: '1px',
                          background: '#C8841A',
                          opacity: 0,
                          transition: 'opacity 0.2s'
                        }} />

                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '7px',
                          letterSpacing: '0.15em',
                          color: '#4A3A22'
                        }}>
                          FACET 0{idx + 1}
                        </span>
                        
                        <span style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '7px',
                          letterSpacing: '0.15em',
                          color: '#4A3A22'
                        }}>
                          {Math.round(syn.similarity * 100)}% MATCH
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* PANEL B: SELECTED STATE */}
                <div style={{
                  width: '50%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '2.5rem 2rem',
                  boxSizing: 'border-box',
                  overflowY: 'auto'
                }}>
                  {activeSynapse && (
                    <>
                      {/* YOUR MAP SOURCE */}
                      <div style={{ marginBottom: '1.5rem' }}>
                        <div style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '7px',
                          letterSpacing: '0.15em',
                          color: '#C8841A',
                          textTransform: 'uppercase',
                          marginBottom: '0.5rem'
                        }}>
                          YOUR MAP SOURCE
                        </div>
                        <h3 style={{
                          fontFamily: '"Cormorant Garamond", serif',
                          fontSize: '18px',
                          fontWeight: 'normal',
                          color: '#E8DEC8',
                          lineHeight: '1.3',
                          margin: '0 0 0.5rem 0'
                        }}>
                          {activeSynapse.item_a?.title || "Untitled Link"}
                        </h3>
                        <p style={{
                          fontFamily: '"DM Sans", sans-serif',
                          fontSize: '11px',
                          color: '#7A6A52',
                          lineHeight: '1.45',
                          margin: 0,
                          display: '-webkit-box',
                          WebkitLineClamp: 4,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}>
                          {activeSynapse.item_a?.summary || "Concept nodes saved in the observatory cortex."}
                        </p>
                      </div>

                      {/* 1px divider */}
                      <div style={{
                        width: '100%',
                        height: '1px',
                        background: '#1E1810',
                        marginBottom: '1.5rem'
                      }} />

                      {/* AETHER LINK'S SOURCE */}
                      <div style={{ marginBottom: '1.5rem' }}>
                        <div style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '7px',
                          letterSpacing: '0.15em',
                          color: '#C8841A',
                          textTransform: 'uppercase',
                          marginBottom: '0.5rem'
                        }}>
                          AETHER LINK'S SOURCE
                        </div>
                        <h3 style={{
                          fontFamily: '"Cormorant Garamond", serif',
                          fontSize: '18px',
                          fontWeight: 'normal',
                          color: '#E8DEC8',
                          lineHeight: '1.3',
                          margin: '0 0 0.5rem 0'
                        }}>
                          {activeSynapse.item_b?.title || "Untitled Link"}
                        </h3>
                        <p style={{
                          fontFamily: '"DM Sans", sans-serif',
                          fontSize: '11px',
                          color: '#7A6A52',
                          lineHeight: '1.45',
                          margin: 0,
                          display: '-webkit-box',
                          WebkitLineClamp: 4,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}>
                          {activeSynapse.item_b?.summary || "Concept nodes matched from friend's memory indices."}
                        </p>
                      </div>

                      {/* 1px divider */}
                      <div style={{
                        width: '100%',
                        height: '1px',
                        background: '#1E1810',
                        marginBottom: '1.5rem'
                      }} />

                      {/* COGNITIVE SYNERGY */}
                      <div style={{ marginBottom: '2rem' }}>
                        <div style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '7px',
                          letterSpacing: '0.15em',
                          color: '#C8841A',
                          textTransform: 'uppercase',
                          marginBottom: '0.5rem'
                        }}>
                          COGNITIVE SYNERGY
                        </div>
                        <p style={{
                          fontFamily: '"DM Sans", sans-serif',
                          fontSize: '11px',
                          color: '#7A6A52',
                          lineHeight: '1.45',
                          margin: 0
                        }}>
                          This node pair exhibits a similarity score of {Math.round(activeSynapse.similarity * 100)}%. It represents a shared node of thought, linking concept models across both repositories.
                        </p>
                      </div>

                      {/* Back to pool link */}
                      <button 
                        onClick={() => {
                          playSound('click');
                          setActiveSynapseIdx(null);
                        }}
                        style={{
                          alignSelf: 'flex-start',
                          background: 'none',
                          border: 'none',
                          outline: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '7px',
                          letterSpacing: '0.15em',
                          color: '#C8841A',
                          textTransform: 'uppercase',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          marginTop: 'auto'
                        }}
                      >
                        ← BACK TO POOL
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Master List View ──────────────────────────────────────────────────── */
  return (
    <div className="br-observatory-view">
      <style>{stylesCss}</style>
      <div className="obs-main-deck slide-in-view">
        
        {/* Holographic Console Panel */}
        <div className="obs-console-sidebar">
          <div className="obs-glass-box console-box">
            <h2 className="console-title">NEURAL LINK GATEWAY</h2>
            <p className="console-desc">
              Establish a secure bridge overlay by generating an invite code or claiming a friend's connection code.
            </p>
            
            <div className="console-divider" />
            
            {/* Generate box */}
            <div className="console-action-block">
              <button className="console-primary-btn" onClick={generateCode}>
                <UserPlus size={14} />
                <span>Generate Invite Code</span>
              </button>
              {generatedCode && (
                <div className="console-code-output">
                  <span className="code-text">{generatedCode}</span>
                  <button 
                    className="code-copy-btn" 
                    onClick={() => { 
                      navigator.clipboard.writeText(generatedCode); 
                      playSound('click'); 
                    }}
                  >
                    COPY
                  </button>
                </div>
              )}
            </div>

            <div className="console-divider" />

            {/* Connect code */}
            <form onSubmit={connectLink} className="console-connect-form">
              <div className="console-input-label">CLAIM TUNNEL TOKEN</div>
              <div className="console-input-wrapper">
                <input 
                  type="text" 
                  value={inviteCode} 
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="MIND-XXXX-XXXX" 
                  className="console-token-input"
                />
                <button type="submit" className="console-submit-btn" disabled={connecting}>
                  {connecting ? 'LINKING...' : 'CONNECT'}
                </button>
              </div>
            </form>
          </div>

          <div className="obs-privacy-shield">
            <Lock size={12} style={{ color: 'rgba(255,255,255,0.3)', marginRight: 6 }} />
            <span>Strict Zero-Knowledge Analytics. Raw saved files are never shared or readable.</span>
          </div>
        </div>

        {/* Mapped bridges deck */}
        <div className="obs-bridges-deck">
          <h2 className="obs-section-title">ACTIVE NEURAL OVERLAYS</h2>
          {bridges.length === 0 ? (
            <div className="obs-empty-deck">
              <div className="obs-empty-orb" />
              <div className="obs-empty-title">NO ACTIVE OVERLAYS</div>
              <p className="obs-empty-desc">Blends of your mapped concept indices with friends will appear here.</p>
            </div>
          ) : (
            <div className="obs-cards-layout-grid">
              {bridges.map(br => {
                const colors = getArchetypeGradient(br.friend_mind_type);
                return (
                  <div 
                    key={br.id}
                    className="obs-deck-card"
                    onClick={() => selectBridge(br.id)}
                  >
                    <div className="card-glow-back" style={{ background: colors.bg }} />
                    <div className="card-obs-glass">
                      <div className="card-obs-top">
                        <div className="avatar-shield" style={{ background: colors.bg, color: colors.text }}>
                          {br.friend_initials}
                        </div>
                        <div className="avatar-meta">
                          <div className="meta-name">{br.friend_name}</div>
                          <div className="meta-type">Archetype: {br.friend_mind_type || 'UNKNOWN'}</div>
                        </div>
                        <div className="meta-readout">
                          <span className="readout-val">{Math.round(br.compatibility_score)}%</span>
                          <span className="readout-lbl">OVERLAP</span>
                        </div>
                      </div>
                      <div className="card-obs-footer">
                        <span>DECODE NEURAL OVERLAP</span>
                        <GitCompare size={12} color="var(--accent-gold)" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Success quantum gateway animation loop */}
      {connectionSuccess && (
        <div className="obs-success-modal">
          <QuantumTunnelCanvas />
          <div className="obs-success-card">
            <SealCheck size={64} color="#00f0ff" className="br-success-zoom-icon" />
            <h2 className="obs-success-title">COGNITIVE TUNNEL SYNCHRONIZED</h2>
            <p className="obs-success-desc">Neural index coordinates aligned. Syncing semantic horizons...</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* Archetypes color helper */
function getArchetypeGradient(type) {
  if (!type) return { bg: 'rgba(255,255,255,0.06)', text: '#ffffff' };
  const first = type.charAt(0);
  switch (first) {
    case 'F':
      return { bg: 'linear-gradient(135deg, #00f0ff 0%, #0072ff 100%)', text: '#020204' };
    case 'I':
      return { bg: 'linear-gradient(135deg, #ff00ff 0%, #81007f 100%)', text: '#ffffff' };
    case 'V':
      return { bg: 'linear-gradient(135deg, #ffaa00 0%, #993300 100%)', text: '#020204' };
    default:
      return { bg: 'linear-gradient(135deg, #f4f1ea 0%, #8fa382 100%)', text: '#020204' };
  }
}


/* ── WAVE INTERFERENCE POOL COMPONENT ────────────────────────────────── */

function WaveInterferencePool({ synapses, activeIndex, onSelectIndex, compatibilityScore }) {
  const canvasRef = useRef(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId;
    const wavelength = 36;
    const maxRadius = 450;

    let width = canvas.width = canvas.offsetWidth;
    let height = canvas.height = canvas.offsetHeight;

    const handleResize = () => {
      if (canvas) {
        width = canvas.width = canvas.offsetWidth;
        height = canvas.height = canvas.offsetHeight;
      }
    };
    window.addEventListener('resize', handleResize);

    const N = synapses.length || 5;
    const compFactor = (compatibilityScore || 0) / 100.0;

    const getSources = () => {
      return {
        A: { x: width * 0.18, y: height * 0.5 },
        B: { x: width * 0.82, y: height * 0.5 }
      };
    };

    const getNodes = (sources) => {
      const cx = width / 2;
      const cy = height / 2;
      return synapses.map((syn, idx) => {
        const xJitter = (Math.sin(idx * 4.3 + 1.2) * 20) * compFactor + 
                        (Math.cos(idx * 8.7 + 3.4) * 140) * (1 - compFactor);
        const yOffset = (idx - (N - 1) / 2) * (height * 0.65 / Math.max(1, N - 1));
        return {
          x: cx + xJitter,
          y: cy + yOffset,
          synapse: syn,
          idx
        };
      });
    };

    const render = () => {
      const time = performance.now();
      ctx.clearRect(0, 0, width, height);

      // Background
      ctx.fillStyle = '#0D0B09';
      ctx.fillRect(0, 0, width, height);

      const sources = getSources();
      const nodes = getNodes(sources);

      // 1. Concentric wave rings
      const timeOffset = (time * 0.04) % wavelength;
      for (let r = timeOffset; r < maxRadius; r += wavelength) {
        const opacity = 0.22 * (1 - r / maxRadius);
        if (opacity <= 0) continue;

        ctx.lineWidth = 0.8;

        // Source A Waves
        ctx.strokeStyle = `rgba(200, 132, 26, ${opacity})`;
        ctx.beginPath();
        ctx.arc(sources.A.x, sources.A.y, r, 0, Math.PI * 2);
        ctx.stroke();

        // Source B Waves
        ctx.strokeStyle = `rgba(200, 132, 26, ${opacity})`;
        ctx.beginPath();
        ctx.arc(sources.B.x, sources.B.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 2. Source points (ceramic bone white discs)
      const drawSource = (src) => {
        const pulse = (time % 4000) / 4000;
        const ringRadius = 6 + pulse * 24;
        const ringOpacity = 0.3 * (1 - pulse);
        
        ctx.strokeStyle = `rgba(200, 132, 26, ${ringOpacity})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(src.x, src.y, ringRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#E8E0D4';
        ctx.beginPath();
        ctx.arc(src.x, src.y, 6, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#0D0B09';
        ctx.beginPath();
        ctx.arc(src.x, src.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      };

      drawSource(sources.A);
      drawSource(sources.B);

      // 3. Antinodes (shared thoughts)
      nodes.forEach((node) => {
        const isHovered = hoveredIndex === node.idx;
        const isActive = activeIndex === node.idx;

        if (isActive || isHovered) {
          const glowGrd = ctx.createRadialGradient(node.x, node.y, 2, node.x, node.y, 22);
          glowGrd.addColorStop(0, 'rgba(200, 132, 26, 0.25)');
          glowGrd.addColorStop(1, 'rgba(200, 132, 26, 0)');
          ctx.fillStyle = glowGrd;
          ctx.beginPath();
          ctx.arc(node.x, node.y, 22, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.strokeStyle = '#C8841A';
        ctx.lineWidth = (isActive || isHovered) ? 1.0 : 0.5;
        ctx.beginPath();
        ctx.arc(node.x, node.y, 6, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#C8A97E';
        ctx.beginPath();
        ctx.arc(node.x, node.y, 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = 'italic 9px "Cormorant Garamond", serif';
        ctx.fillStyle = (isActive || isHovered) ? '#F4EFEB' : 'rgba(212, 184, 150, 0.7)';
        ctx.textAlign = 'center';
        
        let labelText = node.synapse.item_a?.title || "Untitled";
        if (labelText.length > 22) {
          labelText = labelText.substring(0, 20) + "...";
        }
        ctx.fillText(labelText, node.x, node.y - 12);
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    const getMousePos = (e) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    };

    const handleMouseMove = (e) => {
      const mouse = getMousePos(e);
      const sources = getSources();
      const nodes = getNodes(sources);
      
      let foundIdx = null;
      for (let i = 0; i < nodes.length; i++) {
        const d = Math.hypot(mouse.x - nodes[i].x, mouse.y - nodes[i].y);
        if (d < 16) {
          foundIdx = nodes[i].idx;
          break;
        }
      }
      setHoveredIndex(foundIdx);
      canvas.style.cursor = foundIdx !== null ? 'pointer' : 'default';
    };

    const handleMouseClick = (e) => {
      const mouse = getMousePos(e);
      const sources = getSources();
      const nodes = getNodes(sources);
      
      for (let i = 0; i < nodes.length; i++) {
        const d = Math.hypot(mouse.x - nodes[i].x, mouse.y - nodes[i].y);
        if (d < 16) {
          onSelectIndex(nodes[i].idx);
          break;
        }
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleMouseClick);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      if (canvas) {
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('click', handleMouseClick);
      }
    };
  }, [synapses, activeIndex, compatibilityScore, hoveredIndex]);

  return (
    <canvas 
      ref={canvasRef} 
      style={{ 
        width: '100%', 
        height: '100%', 
        display: 'block', 
        background: '#0D0B09',
        outline: 'none'
      }} 
    />
  );
}

function getInterpretiveText(score) {
  const s = score || 0;
  if (s < 15) {
    return "Parallel thinkers. Rare overlap, distinct lenses.";
  } else if (s < 35) {
    return "Intersecting pathways. Emerging alignment, diverse backgrounds.";
  } else if (s < 55) {
    return "Resonant minds. Shared frequencies, complementary insights.";
  } else if (s < 75) {
    return "Deep cognitive synergy. High coherence, shared intellectual foundation.";
  } else {
    return "Consonant consciousness. Identical wavelengths, unified conceptual map.";
  }
}

/* ── STYLE RULES SHEET ──────────────────────────────────────────────────── */
const stylesCss = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap');

  /* Fullscreen Revamp Styles */
  .br-observatory-view-fullscreen {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    background-color: #0D0B09;
    color: #E8DEC8;
    overflow: hidden;
    position: fixed;
    inset: 0;
    z-index: 9999;
    font-family: "DM Sans", sans-serif;
  }

  .br-observatory-view-fullscreen button {
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .br-observatory-view-fullscreen button:hover {
    opacity: 0.8;
  }

  .facet-row-item:hover {
    background-color: #1A1510;
  }

  .facet-row-item:hover .hover-accent-bar {
    opacity: 1 !important;
  }

  @keyframes spinLoader {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  @keyframes successZoom {
    0% { transform: scale(0.95); opacity: 0.8; }
    100% { transform: scale(1.0); opacity: 1; }
  }

  /* Drei Text labels style */
  .mycelium-drei-label {
    font-family: "Cormorant Garamond", "DM Serif Display", serif;
    font-size: 10px;
    font-style: italic;
    color: rgba(235, 220, 195, 0.42);
    white-space: nowrap;
    text-shadow: 0 2px 4px rgba(0,0,0,0.85);
    background: rgba(6, 6, 8, 0.7);
    border: 1px solid rgba(255,255,255,0.03);
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    transition: all 0.25s ease;
    opacity: 0.85;
    pointer-events: none;
  }
  .mycelium-drei-label.active {
    color: var(--accent-gold);
    border-color: rgba(212, 175, 55, 0.25);
    background: rgba(10, 8, 14, 0.85);
    opacity: 1;
  }

  /* Loaders */
  .br-obsidian-loader {
    display: flex;
    flex-direction: column;
    align-items: center;
    justifyContent: center;
    height: 100%;
    width: 100%;
    background: ${COLOR_CHARCOAL};
    color: #eae9f0;
    gap: 1.25rem;
  }
  .spin-loader {
    animation: spinLoader 4.5s linear infinite;
    color: var(--accent-gold);
  }
  .loader-lbl {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-muted);
    letter-spacing: 0.22em;
  }

  /* Locked progress state viewports */
  .br-locked-viewport {
    position: relative;
    height: 100%;
    width: 100%;
    display: flex;
    align-items: center;
    justifyContent: center;
    background: ${COLOR_CHARCOAL};
    overflow: hidden;
  }
  .starfield-bg {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at center, rgba(207, 163, 101, 0.04) 0%, transparent 70%);
  }
  .br-locked-card {
    position: relative;
    z-index: 10;
    max-width: 440px;
    width: 90%;
    background: rgba(255, 255, 255, 0.012);
    backdrop-filter: blur(24px);
    border: 1px solid rgba(207, 163, 101, 0.12);
    border-radius: 16px;
    padding: 3rem 2.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    box-shadow: 0 35px 90px rgba(0,0,0,0.85);
  }
  .lock-avatar {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: rgba(207, 163, 101, 0.03);
    border: 1px solid rgba(207, 163, 101, 0.15);
    display: flex;
    align-items: center;
    justifyContent: center;
    margin-bottom: 1.5rem;
  }
  .locked-card-title {
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 600;
    color: var(--accent-gold);
    letter-spacing: 0.15em;
    margin-bottom: 1rem;
  }
  .locked-card-desc {
    font-size: 12px;
    line-height: 1.6;
    color: var(--text-muted);
    margin-bottom: 2rem;
  }
  .progress-meter {
    width: 100%;
    margin-bottom: 2.25rem;
  }
  .progress-meter-hdr {
    display: flex;
    justify-content: space-between;
    font-size: 10.5px;
    font-family: var(--font-mono);
    color: var(--text-muted);
    margin-bottom: 0.5rem;
  }
  .progress-meter-track {
    width: 100%;
    height: 4px;
    background: rgba(255,255,255,0.02);
    border-radius: 2px;
    overflow: hidden;
  }
  .progress-meter-fill {
    height: 100%;
    background: linear-gradient(90deg, #8fa382 0%, var(--accent-gold) 100%);
    border-radius: 2px;
    transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .locked-footer-alert {
    display: flex;
    align-items: center;
    font-family: var(--font-mono);
    font-size: 9px;
    color: rgba(255, 60, 60, 0.75);
    letter-spacing: 0.1em;
  }
  .alert-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background-color: #ff3c3c;
    margin-right: 6px;
    box-shadow: 0 0 6px #ff3c3c;
  }

  /* Master layout container */
  .br-observatory-view {
    padding: 2.5rem;
    height: 100%;
    overflow-y: auto;
    background-color: ${COLOR_CHARCOAL};
    color: #eae9f0;
    font-family: system-ui, -apple-system, sans-serif;
  }

  /* Observatory back rail */
  .obs-header {
    display: flex;
    align-items: center;
    justifyContent: space-between;
    margin-bottom: 2rem;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    padding-bottom: 1.25rem;
  }
  .obs-back-btn {
    background: rgba(255,255,255,0.015);
    border: 1px solid rgba(255,255,255,0.08);
    color: var(--text-signal);
    border-radius: 6px;
    padding: 0.5rem 0.85rem;
    cursor: pointer;
    font-size: 11px;
    font-family: var(--font-mono);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: all 0.2s ease;
  }
  .obs-back-btn:hover {
    background: rgba(255,255,255,0.04);
    color: #ffffff;
  }
  .obs-title-wrap {
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .obs-badge {
    font-size: 9px;
    font-family: var(--font-mono);
    color: var(--accent-gold);
    letter-spacing: 0.12em;
  }
  .obs-title {
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 600;
    color: #ffffff;
    letter-spacing: 0.08em;
  }
  .obs-dissolve-btn {
    background: rgba(255, 60, 60, 0.04);
    border: 1px solid rgba(255, 60, 60, 0.18);
    color: #ff3c3c;
    border-radius: 6px;
    padding: 0.5rem 0.85rem;
    cursor: pointer;
    font-size: 11px;
    font-family: var(--font-mono);
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .obs-dissolve-btn:hover {
    background: rgba(255, 60, 60, 0.08);
  }
  .obs-details-loader {
    display: flex;
    flex-direction: column;
    align-items: center;
    justifyContent: center;
    padding: 8rem 0;
    gap: 1.25rem;
  }

  /* Editorial Grid Layout */
  .obs-editorial-layout {
    display: grid;
    grid-template-columns: 1fr 380px;
    gap: 2.5rem;
    max-width: 1200px;
    margin: 0 auto;
    align-items: stretch;
    height: calc(100vh - 160px);
    min-height: 580px;
  }
  
  .obs-canvas-column {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    height: 100%;
  }

  .obs-canvas-box {
    flex: 1;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.035);
    box-shadow: 0 15px 35px rgba(0,0,0,0.35);
    position: relative;
    overflow: hidden;
  }

  .canvas-instruction-label {
    position: absolute;
    bottom: 1.25rem;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(8, 8, 10, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 20px;
    padding: 0.45rem 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 9px;
    font-family: var(--font-mono);
    color: rgba(255,255,255,0.45);
    letter-spacing: 0.08em;
    pointer-events: none;
  }

  .facets-selector-row {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.75rem;
  }
  .facet-tab {
    background: rgba(255, 255, 255, 0.015);
    border: 1px solid rgba(255, 255, 255, 0.03);
    border-radius: 6px;
    padding: 0.75rem 0.5rem;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    transition: all 0.2s ease;
  }
  .facet-tab span {
    font-size: 10px;
    font-family: var(--font-mono);
    color: var(--text-muted);
  }
  .facet-tab-pct {
    font-size: 11.5px;
    font-weight: 600;
  }
  .facet-tab:hover {
    background: rgba(255,255,255,0.03);
    border-color: rgba(255,255,255,0.08);
  }
  .facet-tab.active {
    background: rgba(207, 163, 101, 0.03);
    border-color: rgba(207, 163, 101, 0.25);
  }
  .facet-tab.active span {
    color: var(--accent-gold);
  }
  .facet-tab.active .facet-tab-pct {
    color: #ffffff;
  }

  /* Editorial Sidebar */
  .obs-editorial-sidebar {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    height: 100%;
    overflow-y: auto;
  }

  .editorial-score-box {
    background: rgba(255, 255, 255, 0.012);
    border: 1px solid rgba(255, 255, 255, 0.03);
    border-radius: 12px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .score-hdr {
    font-size: 9px;
    font-family: var(--font-mono);
    color: var(--text-muted);
    letter-spacing: 0.05em;
  }
  .score-num-row {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .score-large {
    font-size: 32px;
    font-weight: 700;
    font-family: var(--font-mono);
    color: #ffffff;
  }
  .score-label {
    font-size: 9.5px;
    font-family: var(--font-mono);
    color: var(--accent-gold);
  }
  .compatibility-indicator-track {
    width: 100%;
    height: 3px;
    background: rgba(255,255,255,0.02);
    border-radius: 1.5px;
    overflow: hidden;
  }
  .compatibility-indicator-fill {
    height: 100%;
    background-color: var(--accent-gold);
  }

  /* Active Synapse Card detailed split view */
  .editorial-active-synapse-card {
    background: rgba(255, 255, 255, 0.015);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.035);
    border-radius: 12px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    box-shadow: 0 10px 30px rgba(0,0,0,0.25);
  }
  .synapse-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .synapse-index-pill {
    font-size: 9px;
    font-family: var(--font-mono);
    color: var(--accent-gold);
    background: rgba(207,163,101,0.05);
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
    border: 1px solid rgba(207,163,101,0.15);
  }
  .synapse-sim-badge {
    font-size: 9.5px;
    font-family: var(--font-mono);
    color: rgba(255,255,255,0.45);
  }
  .synapse-split-column {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .source-label {
    font-size: 8px;
    font-family: var(--font-mono);
    margin-bottom: 0.15rem;
  }
  .source-label.yours { color: #00f0ff; }
  .source-label.theirs { color: #ff00ff; }
  .source-title {
    font-size: 13.5px;
    font-weight: 600;
    color: #ffffff;
    line-height: 1.4;
    margin: 0;
  }
  .source-summary {
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-muted);
    margin: 0;
  }
  .synapse-divider-dash {
    height: 1px;
    border-top: 1px dashed rgba(255,255,255,0.06);
    width: 100%;
  }

  .editorial-profile-box {
    background: rgba(255, 255, 255, 0.012);
    border: 1px solid rgba(255, 255, 255, 0.03);
    border-radius: 12px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }
  .profile-hdr {
    font-size: 9px;
    font-family: var(--font-mono);
    color: var(--text-muted);
    letter-spacing: 0.05em;
  }
  .profile-desc {
    font-size: 11.5px;
    line-height: 1.55;
    color: var(--text-signal);
    opacity: 0.85;
    margin: 0;
  }
  .archetype-pair-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    border-top: 1px solid rgba(255,255,255,0.03);
    padding-top: 0.85rem;
  }
  .archetype-pill {
    background: rgba(255,255,255,0.01);
    border: 1px solid rgba(255,255,255,0.03);
    border-radius: 6px;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .archetype-pill .label {
    font-size: 8px;
    font-family: var(--font-mono);
    color: rgba(255,255,255,0.3);
  }
  .archetype-pill .value {
    font-size: 11.5px;
    font-family: var(--font-mono);
    font-weight: 600;
    color: var(--accent-gold);
  }

  /* Master list deck layout */
  .obs-main-deck {
    display: grid;
    grid-template-columns: 350px 1fr;
    gap: 2.5rem;
    max-width: 1200px;
    margin: 0 auto;
    padding-bottom: 4rem;
  }
  .obs-console-sidebar {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }
  .console-box {
    padding: 1.75rem;
    gap: 1.5rem;
    background: rgba(10, 8, 16, 0.35);
  }
  .console-title {
    font-family: var(--font-display);
    font-size: 15px;
    color: var(--accent-gold);
    letter-spacing: 0.05em;
    margin: 0;
  }
  .console-desc {
    font-size: 12px;
    line-height: 1.55;
    color: var(--text-muted);
    margin: 0;
  }
  .console-action-block {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .console-primary-btn {
    background: rgba(207,163,101,0.03);
    border: 1px solid rgba(207,163,101,0.15);
    color: var(--accent-gold);
    padding: 0.75rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 11.5px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justifyContent: center;
    gap: 0.5rem;
    transition: all 0.2s ease;
  }
  .console-primary-btn:hover {
    background: rgba(207,163,101,0.08);
    border-color: var(--accent-gold);
  }
  .console-code-output {
    display: flex;
    align-items: center;
    justifyContent: space-between;
    background: rgba(0,0,0,0.3);
    border: 1px solid rgba(255,255,255,0.05);
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    font-family: var(--font-mono);
  }
  .code-text {
    font-size: 12px;
    color: #ffffff;
    letter-spacing: 0.05em;
  }
  .code-copy-btn {
    background: transparent;
    border: none;
    color: var(--accent-gold);
    font-size: 9.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .console-connect-form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .console-input-label {
    font-size: 9px;
    font-family: var(--font-mono);
    color: rgba(255,255,255,0.35);
    letter-spacing: 0.05em;
  }
  .console-input-wrapper {
    display: flex;
    gap: 0.5rem;
  }
  .console-token-input {
    flex: 1;
    background: rgba(0,0,0,0.25);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 6px;
    color: #ffffff;
    padding: 0.65rem 0.75rem;
    font-size: 12px;
    font-family: var(--font-mono);
    outline: none;
  }
  .console-submit-btn {
    background: var(--accent-gold);
    color: #020204;
    border: none;
    border-radius: 6px;
    padding: 0 1rem;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .console-divider {
    height: 1px;
    background: rgba(255,255,255,0.03);
    width: 100%;
  }
  .obs-privacy-shield {
    display: flex;
    align-items: flex-start;
    font-size: 10px;
    color: rgba(255,255,255,0.3);
    line-height: 1.45;
  }

  /* Connected bridges lists */
  .obs-bridges-deck {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .obs-section-title {
    font-family: var(--font-display);
    font-size: 14px;
    color: var(--text-muted);
    letter-spacing: 0.05em;
    margin: 0;
  }
  .obs-cards-layout-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1.5rem;
  }
  .obs-deck-card {
    position: relative;
    border-radius: 12px;
    padding: 1px;
    cursor: pointer;
    overflow: hidden;
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .obs-deck-card:hover {
    transform: translateY(-4px);
  }
  .card-glow-back {
    position: absolute;
    inset: 0;
    filter: blur(15px);
    opacity: 0;
    transition: opacity 0.3s ease;
  }
  .obs-deck-card:hover .card-glow-back {
    opacity: 0.15;
  }
  .card-obs-glass {
    background: rgba(20, 18, 28, 0.45);
    border: 1px solid rgba(255,255,255,0.04);
    border-radius: 12px;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .card-obs-top {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }
  .avatar-shield {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justifyContent: center;
    font-size: 12px;
    font-weight: 700;
    font-family: var(--font-mono);
  }
  .avatar-meta {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .meta-name {
    font-size: 13.5px;
    font-weight: 600;
    color: #ffffff;
  }
  .meta-type {
    font-size: 10px;
    font-family: var(--font-mono);
    color: var(--text-muted);
  }
  .meta-readout {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  .readout-val {
    font-size: 18px;
    font-family: var(--font-mono);
    color: var(--accent-gold);
    font-weight: 700;
  }
  .readout-lbl {
    font-size: 8px;
    font-family: var(--font-mono);
    color: rgba(255,255,255,0.25);
  }
  .card-obs-footer {
    border-top: 1px solid rgba(255,255,255,0.03);
    padding-top: 0.75rem;
    display: flex;
    align-items: center;
    justifyContent: space-between;
    font-size: 10.5px;
    font-family: var(--font-mono);
    color: var(--accent-gold);
    opacity: 0.85;
  }

  /* Empty state */
  .obs-empty-deck {
    background: rgba(255,255,255,0.015);
    border: 1px dashed rgba(255,255,255,0.04);
    border-radius: 12px;
    padding: 5rem 2rem;
    display: flex;
    flex-direction: column;
    alignItems: center;
    justifyContent: center;
    text-align: center;
  }
  .obs-empty-orb {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(207,163,101,0.08) 0%, transparent 70%);
    border: 1px solid rgba(207,163,101,0.15);
    margin-bottom: 1.5rem;
  }
  .obs-empty-title {
    font-size: 12px;
    font-family: var(--font-mono);
    color: var(--accent-gold);
    margin-bottom: 0.5rem;
    letter-spacing: 0.05em;
  }
  .obs-empty-desc {
    font-size: 11px;
    color: var(--text-muted);
    max-width: 260px;
    line-height: 1.45;
  }

  /* Success tunnel modal overlay */
  .obs-success-modal {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(8, 8, 10, 0.96);
    display: flex;
    align-items: center;
    justifyContent: center;
  }
  .obs-success-card {
    text-align: center;
    max-width: 420px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    z-index: 10;
  }
  .br-success-zoom-icon {
    animation: successZoom 1.2s ease-in-out infinite alternate;
  }
  .obs-success-title {
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 600;
    color: #00f0ff;
    letter-spacing: 0.1em;
    margin: 0;
  }
  .obs-success-desc {
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.5;
    margin: 0;
  }

  /* Fade transitions */
  .fade-in-panel {
    animation: successZoom 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  .slide-in-view {
    animation: successZoom 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
`;
