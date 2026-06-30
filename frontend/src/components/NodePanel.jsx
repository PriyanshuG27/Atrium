import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Link,
  Microphone,
  FilePdf,
  Image as ImageIcon,
  TextT,
  X,
  Bell,
  BookOpen,
  ShareNetwork,
  ArrowSquareOut,
  ClockCounterClockwise,
  Hash,
  CheckCircle,
  XCircle,
  CaretRight,
  Sparkle,
  Copy,
  Check,
  ArrowRight,
  BookmarkSimple,
  Lightning,
  Trash,
  Warning,
} from '@phosphor-icons/react';
import { NodePanelSkeleton } from './Skeleton';
import { useToast } from './Toast';
import FormattedText from './FormattedText';

/* ──────────────────────────────────────────────────────────────
   NodePanel — side drawer that opens when a node is selected.
   
   Key design decisions:
   • NO backdrop div (intercepts scroll wheel events)
   • Click-outside handled purely by useEffect mousedown listener
   • Single scroll container = the entire panel body
   • Header is position:fixed within the panel, not sticky
   • Quick action bar with copy/share/open-in-feed/reminder
   ────────────────────────────────────────────────────────────── */

const SOURCE_CONFIG = {
  url:   { color: '#7C6FD4', bg: 'rgba(124,111,212,0.12)', label: 'LINK',    icon: Link },
  voice: { color: '#3DAA8A', bg: 'rgba(61,170,138,0.12)',  label: 'VOICE',   icon: Microphone },
  pdf:   { color: '#C9893C', bg: 'rgba(201,137,60,0.12)',  label: 'PDF',     icon: FilePdf },
  image: { color: '#3D8AAA', bg: 'rgba(61,138,170,0.12)',  label: 'IMAGE',   icon: ImageIcon },
  text:  { color: '#8A8582', bg: 'rgba(138,133,130,0.12)', label: 'TEXT',    icon: TextT },
  hub:   { color: '#A89880', bg: 'rgba(168,152,128,0.12)', label: 'CLUSTER', icon: ShareNetwork },
};
function getCfg(type, isHub) {
  if (isHub) return SOURCE_CONFIG.hub;
  return SOURCE_CONFIG[type?.toLowerCase()] || SOURCE_CONFIG.text;
}

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const ms = Date.now() - new Date(dateStr);
  const h = Math.floor(ms / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function readingTime(text) {
  if (!text) return null;
  const wordCount = text.trim().split(/\s+/).length;
  const mins = Math.ceil(wordCount / 200);
  return `${mins} min read · ${wordCount} words`;
}

// ── Small reusable action button ──────────────────────────────
function QuickAction({ icon: Icon, label, onClick, href, target, rel, ariaLabel, active = false, accentColor = '#8A8582' }) {
  const [hov, setHov] = useState(false);
  const Tag = href ? 'a' : 'button';
  return (
    <Tag
      href={href}
      target={target}
      rel={rel}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={label}
      aria-label={ariaLabel || label}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '0.5rem 0.25rem',
        background: active || hov ? `${accentColor}18` : 'rgba(240,237,232,0.02)',
        border: `1px solid ${active ? `${accentColor}40` : hov ? `${accentColor}25` : 'rgba(240,237,232,0.06)'}`,
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'all 0.18s ease',
        color: active || hov ? accentColor : '#534F4C',
        textDecoration: 'none',
        boxSizing: 'border-box',
      }}
    >
      <Icon size={14} weight={active ? 'fill' : 'regular'} />
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '0.5rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
    </Tag>
  );
}

function TracePanel({ candidate, currentNode, activeNodes }) {
  const otherId = candidate.item_id_a === currentNode.id ? candidate.item_id_b : candidate.item_id_a;
  const otherNode = activeNodes.find(n => n.id === otherId);
  const otherTitle = otherNode ? otherNode.title : 'Another signal';
  
  const similarityPct = Math.round(candidate.similarity_score * 100);
  
  let daysApart = 0;
  if (otherNode && currentNode.created_at && otherNode.created_at) {
    const dateA = new Date(currentNode.created_at);
    const dateB = new Date(otherNode.created_at);
    daysApart = Math.abs(Math.floor((dateA.getTime() - dateB.getTime()) / (1000 * 60 * 60 * 24)));
  }
  
  const isNearMiss = candidate.status === 'near_miss';
  const [timeLeft, setTimeLeft] = useState('');
  
  useEffect(() => {
    if (isNearMiss || !candidate.expires_at) return;
    
    const updateTimer = () => {
      const diff = new Date(candidate.expires_at).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('Expired');
        return;
      }
      const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
      const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
      setTimeLeft(`${h}h ${m}m ${s}s`);
    };
    
    updateTimer();
    const tid = setInterval(updateTimer, 1000);
    return () => clearInterval(tid);
  }, [candidate.expires_at, isNearMiss]);
  
  return (
    <div style={{
      marginBottom: '1.25rem',
      padding: '1rem',
      borderRadius: 8,
      background: 'rgba(207,163,101,0.03)',
      border: '1px dashed rgba(207,163,101,0.18)',
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* Title & Status badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-gold)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          🔍 Connection Trace
        </span>
        {isNearMiss ? (
          <span style={{ fontSize: '0.62rem', fontFamily: 'monospace', background: 'rgba(138,133,130,0.15)', color: '#8A8582', padding: '0.2rem 0.5rem', borderRadius: 4, border: '1px dashed rgba(138,133,130,0.3)' }}>
            NEAR-MISS (COOLDOWN)
          </span>
        ) : (
          <span style={{ fontSize: '0.68rem', fontFamily: 'monospace', background: 'rgba(207,163,101,0.12)', color: 'var(--accent-gold)', padding: '0.2rem 0.5rem', borderRadius: 4, fontWeight: 'bold' }}>
            ⏳ {timeLeft || '--h --m --s'}
          </span>
        )}
      </div>
      
      {/* Details */}
      <div style={{ fontSize: '0.82rem', color: '#B3ACA8', lineHeight: 1.5, marginBottom: '0.5rem' }}>
        Connected with <span style={{ color: '#F0EDE8', fontWeight: 500 }}>"{otherTitle}"</span>
      </div>
      
      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: '#8A8582', marginBottom: '0.75rem' }}>
        <div>🔥 <span style={{ color: 'var(--accent-gold)' }}>{similarityPct}%</span> similarity</div>
        <div>📅 <span style={{ color: '#F0EDE8' }}>{daysApart}d</span> save gap</div>
      </div>
      
      {/* Tension Insight */}
      <div style={{
        fontSize: '0.78rem',
        color: '#8A8582',
        fontStyle: 'italic',
        lineHeight: 1.4,
        paddingTop: '0.5rem',
        borderTop: '1px solid rgba(240,237,232,0.06)'
      }}>
        "{candidate.insight_text || 'Active connection pending drift window closure.'}"
      </div>
    </div>
  );
}

export default function NodePanel({
  node,
  selectedNode,
  loadingNodeDetail,
  onClose,
  hubs = [],
  activeNodes = [],
  activeCandidates = [],
  onViewAllMembers,
  onViewInGraph,
  onDelete,
}) {
  const displayNode = node || selectedNode;

  const [reducedMotion,     setReducedMotion]      = useState(false);
  const [showReminderInput, setShowReminderInput]  = useState(false);
  const [reminderMessage,   setReminderMessage]    = useState('');
  const [reminderTime,      setReminderTime]       = useState('');
  const [savingReminder,    setSavingReminder]     = useState(false);
  const [showQuiz,          setShowQuiz]           = useState(false);
  const [selectedOptionIdx, setSelectedOptionIdx]  = useState(null);
  const [quizAnswered,      setQuizAnswered]       = useState(false);
  const [copied,            setCopied]             = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm]  = useState(false);

  const panelRef = useRef(null);
  const { addToast } = useToast();

  // Reduced motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const fn = e => setReducedMotion(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  // Reset on node change
  useEffect(() => {
    if (displayNode) {
      setReminderMessage(`Review: ${displayNode.title || 'Saved Item'}`);
      setReminderTime('');
      setShowReminderInput(false);
      setShowQuiz(false);
      setSelectedOptionIdx(null);
      setQuizAnswered(false);
      setCopied(false);
      setShowDeleteConfirm(false);
      // Scroll panel body back to top
      if (panelRef.current) panelRef.current.scrollTop = 0;
    }
  }, [displayNode?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTagClick = (tag) => {
    // Navigate to /archive?search=#tag
    const paths = { archive: '/archive', map: '/map', drill: '/drill', settings: '/settings' };
    window.history.pushState({}, '', `${paths.archive}?search=%23${encodeURIComponent(tag)}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
    if (onClose) onClose();
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!displayNode) return;
    try {
      const res = await fetch(`/api/items/${displayNode.id}`, { method: 'DELETE' });
      if (res.ok) {
        addToast('Signal permanently deleted', 'success');
        if (onDelete) onDelete(displayNode.id);
        if (onClose) onClose();
      } else {
        addToast('Failed to delete signal', 'error');
      }
    } catch (err) {
      console.error('Delete failed:', err);
      addToast('Failed to delete signal', 'error');
    }
  };

  // Escape key + Tab focus trap
  useEffect(() => {
    if (!displayNode) return;
    const onKey = e => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Tab') {
        const els = panelRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!els?.length) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
        else            { if (document.activeElement === last)  { e.preventDefault(); first.focus(); } }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [displayNode, onClose]);

  // Click-outside to close (without a backdrop div that blocks scroll)
  useEffect(() => {
    if (!displayNode) return;
    const onDown = e => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        if (e.target.closest('.constellation-node') || e.target.closest('.context-menu')) return;
        onClose();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [displayNode, onClose]);

  // ── SCROLL ISOLATION ──────────────────────────────────────────────────────
  // Three.js / R3F attach native wheel listeners on the canvas/window at the
  // bubble phase. A capture-phase listener on the panel fires FIRST and stops
  // the event from reaching R3F, while still letting the browser perform the
  // default scroll action on the panel element itself (we never call
  // preventDefault, so the panel continues to scroll normally).
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const onWheel = e => {
      // stop ALL other listeners (both same-element and parents) from seeing it
      e.stopPropagation();
      e.stopImmediatePropagation();
      // do NOT call preventDefault() — that would kill the scroll itself
    };
    // { capture: true } = fires before any bubble-phase handler on ANY ancestor
    // { passive: false } = required to call stopImmediatePropagation reliably
    el.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => el.removeEventListener('wheel', onWheel, { capture: true });
  }, [displayNode]);

  // ── Actions ──────────────────────────────────────────────────
  const handleCopy = useCallback(() => {
    const text = displayNode?.summary || displayNode?.title || '';
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      addToast('Copied to clipboard', 'success');
      setTimeout(() => setCopied(false), 2000);
    });
  }, [displayNode, addToast]);

  const handleShare = useCallback(() => {
    if (displayNode?.source_url) {
      window.open(displayNode.source_url, '_blank', 'noopener,noreferrer');
    } else {
      addToast('No source URL on this signal', 'info');
    }
  }, [displayNode, addToast]);

  if (!displayNode) return null;


  const isHub      = displayNode.type === 'hub' || displayNode.id < 0;
  const cfg        = getCfg(displayNode.source_type, isHub);
  const SourceIcon = cfg.icon;
  const relTime    = relativeTime(displayNode.created_at);
  const readTime   = readingTime(displayNode.summary);
  const hasQuiz    = !!(displayNode.quiz || displayNode.has_quiz || displayNode.quiz_id);

  const activeCandidate = !isHub && activeCandidates && activeCandidates.find(
    cand => cand.item_id_a === displayNode.id || cand.item_id_b === displayNode.id
  );

  // Hub info
  let hubInfo = null;
  if (isHub) {
    const hubId = displayNode.id < 0 ? -displayNode.id : displayNode.id;
    const hub   = hubs.find(h => h.id === hubId);
    if (hub) {
      const memberIds = hub.member_ids || [];
      const members   = activeNodes.filter(n => n.id > 0 && memberIds.includes(n.id));
      const sorted    = [...members].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      hubInfo = { memberCount: memberIds.length, top5: sorted.slice(0, 5), memberIds };
    }
  }

  const handleSaveReminder = async e => {
    e.preventDefault();
    if (!reminderTime) { addToast('Please select a reminder date and time', 'warning'); return; }
    setSavingReminder(true);
    try {
      const res = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id:   displayNode.id > 0 ? displayNode.id : null,
          message:   reminderMessage,
          remind_at: new Date(reminderTime).toISOString(),
        }),
      });
      if (res.ok) {
        addToast(`Reminder set for ${new Date(reminderTime).toLocaleString()}`, 'success');
        setShowReminderInput(false);
      } else {
        const d = await res.json();
        addToast(d.message || 'Failed to create reminder', 'error');
      }
    } catch { addToast('Network error, failed to save reminder', 'error'); }
    finally   { setSavingReminder(false); }
  };

  const handleSelectOption = async idx => {
    setSelectedOptionIdx(idx);
    setQuizAnswered(true);
    const correct = idx === displayNode.quiz.correct_index;
    addToast(correct ? 'Correct answer!' : 'Incorrect — try again!', correct ? 'success' : 'error');
    try {
      const quizId = displayNode.quiz?.id || displayNode.quiz_id;
      if (quizId) {
        await fetch(`/api/quizzes/${quizId}/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quality: correct ? 5 : 2 }),
        });
        window.dispatchEvent(new CustomEvent('quiz-answered'));
      }
    } catch (err) { console.error('Failed to log quiz response:', err); }
  };

  return (
    /* ── Keyframe CSS animation on key change = no JS-state flicker ── */
    <>
    <style>{`
      @keyframes nodePanelSlideIn {
        from { transform: translateX(48px); opacity: 0; }
        to   { transform: translateX(0);   opacity: 1; }
      }
      @keyframes nodePanelSlideInReduced {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes slideUp {
        from { transform: translateY(100%); }
        to   { transform: translateY(0); }
      }
      .node-panel-inner {
        animation: nodePanelSlideIn 0.42s cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      @media (prefers-reduced-motion: reduce) {
        .node-panel-inner {
          animation: nodePanelSlideInReduced 0.18s ease both;
        }
      }
    `}</style>
    <div
      ref={panelRef}
      className="node-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Node Details"
      style={{
        borderLeft:           `1px solid ${cfg.color}20`,
        boxShadow:            `-32px 0 80px rgba(0,0,0,0.75), 0 0 0 1px ${cfg.color}14`,
        scrollbarColor: `${cfg.color}20 transparent`,
      }}
    >
      {/* ── Source-color accent line top ── */}
      <div style={{
        position:   'sticky',
        top:        0,
        left:       0,
        right:      0,
        height:     2,
        background: `linear-gradient(90deg, transparent 0%, ${cfg.color}cc 40%, ${cfg.color}cc 60%, transparent 100%)`,
        zIndex:     10,
        flexShrink: 0,
      }} />

      {/* ── Corner ambient glow ── */}
      <div style={{
        position:      'absolute',
        top:           -80, right: -80,
        width:         220, height: 220,
        borderRadius:  '50%',
        background:    `radial-gradient(circle, ${cfg.color}14 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {loadingNodeDetail ? (
        <div style={{ padding: '1.5rem' }}><NodePanelSkeleton /></div>
      ) : (
        <div style={{ padding: '1.25rem 1.25rem 2rem', display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

          {/* ── HEADER ── */}
          <div style={{ marginBottom: '1rem' }}>
            {/* Row 1: badge + close */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
              <div style={{
                display:    'flex',
                alignItems: 'center',
                gap:        '0.35rem',
                padding:    '3px 10px 3px 7px',
                borderRadius: 20,
                background: cfg.bg,
                border:     `1px solid ${cfg.color}28`,
              }}>
                <SourceIcon size={11} color={cfg.color} weight="fill" />
                <span style={{
                  fontFamily:    "'JetBrains Mono', monospace",
                  fontSize:      '0.575rem',
                  letterSpacing: '0.1em',
                  color:         cfg.color,
                  textTransform: 'uppercase',
                  fontWeight:    600,
                }}>
                  {cfg.label}
                </span>
              </div>

              <button
                onClick={onClose}
                aria-label="Close panel"
                style={{
                  background:   'rgba(240,237,232,0.04)',
                  border:       '1px solid rgba(240,237,232,0.07)',
                  borderRadius: 6,
                  color:        '#534F4C',
                  cursor:       'pointer',
                  width:        28, height: 28,
                  display:      'flex',
                  alignItems:   'center',
                  justifyContent: 'center',
                  flexShrink:   0,
                  transition:   'all 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(240,237,232,0.09)'; e.currentTarget.style.color = '#F0EDE8'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(240,237,232,0.04)'; e.currentTarget.style.color = '#534F4C'; }}
              >
                <X size={14} weight="bold" />
              </button>
            </div>

            {/* Title */}
            <h2 style={{
              fontFamily:    "'Outfit', sans-serif",
              fontSize:      '1.15rem',
              fontWeight:    700,
              margin:        '0 0 0.5rem 0',
              color:         '#F0EDE8',
              lineHeight:    1.25,
              letterSpacing: '-0.025em',
            }}>
              {displayNode.title || 'Untitled Signal'}
            </h2>

            {/* Metadata chips row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
              {relTime && (
                <span style={{
                  display:    'flex',
                  alignItems: 'center',
                  gap:        '0.25rem',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize:   '0.575rem',
                  color:      '#3A3835',
                  letterSpacing: '0.04em',
                }}>
                  <ClockCounterClockwise size={10} color="#3A3835" weight="fill" />
                  {relTime}
                </span>
              )}
              {readTime && !isHub && (
                <span style={{
                  fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                  fontSize:   '10px',
                  color:      'var(--text-muted, #8E8985)',
                  letterSpacing: '0.04em',
                }}>
                  · {readTime}
                </span>
              )}
              {!isHub && displayNode.tags && displayNode.tags.length > 0 && (
                <span style={{
                  display:    'flex',
                  alignItems: 'center',
                  gap:        '0.2rem',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize:   '0.575rem',
                  color:      '#3A3835',
                }}>
                  <Hash size={9} color="#3A3835" weight="bold" />
                  {displayNode.tags.slice(0, 2).join(' · ')}
                  {displayNode.tags.length > 2 && ` +${displayNode.tags.length - 2}`}
                </span>
              )}
            </div>
          </div>

          {/* ── DIVIDER ── */}
          <div style={{ height: 1, background: `rgba(240,237,232,0.05)`, marginBottom: '1rem' }} />

          {/* ── QUICK ACTIONS BAR ── */}
          {!isHub && (
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem' }}>
              <QuickAction
                icon={copied ? Check : Copy}
                label={copied ? 'Copied!' : 'Copy'}
                onClick={handleCopy}
                active={copied}
                accentColor={cfg.color}
              />
              {displayNode.source_url && (
                <QuickAction
                  icon={ArrowSquareOut}
                  label="Open"
                  href={displayNode.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  ariaLabel="View Source"
                  accentColor={cfg.color}
                />
              )}
              <QuickAction
                icon={Bell}
                label="Remind"
                onClick={() => setShowReminderInput(v => !v)}
                active={showReminderInput}
                accentColor={cfg.color}
              />
              {hasQuiz && (
                <QuickAction
                  icon={Lightning}
                  label="Quiz"
                  onClick={() => setShowQuiz(v => !v)}
                  active={showQuiz}
                  accentColor={cfg.color}
                />
              )}
              <QuickAction
                icon={Trash}
                label="Delete"
                onClick={handleDelete}
                accentColor="#ef4444"
              />
            </div>
          )}

          {/* ── HUB: cluster members ── */}
          {isHub && hubInfo && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <span style={{
                  fontFamily:    "'Outfit', sans-serif",
                  fontSize:      '2.25rem',
                  fontWeight:    800,
                  color:         cfg.color,
                  lineHeight:    1,
                  letterSpacing: '-0.04em',
                }}>
                  {hubInfo.memberCount}
                </span>
                <span style={{
                  fontFamily:    "'JetBrains Mono', monospace",
                  fontSize:      '0.6rem',
                  color:         '#534F4C',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}>
                  signals in cluster
                </span>
              </div>

              <div style={{
                fontFamily:    "'JetBrains Mono', monospace",
                fontSize:      '0.56rem',
                letterSpacing: '0.1em',
                color:         '#3A3835',
                textTransform: 'uppercase',
                marginBottom:  '0.5rem',
              }}>
                Recent
              </div>

              {hubInfo.top5.map((member, idx) => (
                <div key={member.id} style={{
                  padding:      '0.625rem 0',
                  borderBottom: idx < hubInfo.top5.length - 1 ? '1px solid rgba(240,237,232,0.04)' : 'none',
                  display:      'flex',
                  alignItems:   'center',
                  gap:          '0.5rem',
                }}>
                  <div style={{ width: 3, height: 3, borderRadius: '50%', background: cfg.color, opacity: 0.5, flexShrink: 0 }} />
                  <span style={{
                    fontFamily:    "'Outfit', sans-serif",
                    fontSize:      '0.8125rem',
                    color:         '#8A8582',
                    flex:          1,
                    whiteSpace:    'nowrap',
                    overflow:      'hidden',
                    textOverflow:  'ellipsis',
                  }}>
                    {member.title}
                  </span>
                  <CaretRight size={10} color="#2A2927" />
                </div>
              ))}

              <button
                onClick={() => onViewAllMembers?.(hubInfo.memberIds, displayNode.title)}
                style={{
                  marginTop:      '1rem',
                  width:          '100%',
                  padding:        '0.625rem 1rem',
                  borderRadius:   8,
                  border:         `1px solid ${cfg.color}28`,
                  background:     cfg.bg,
                  color:          cfg.color,
                  fontFamily:     "'JetBrains Mono', monospace",
                  fontSize:       '0.6rem',
                  letterSpacing:  '0.08em',
                  textTransform:  'uppercase',
                  cursor:         'pointer',
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  gap:            '0.4rem',
                  transition:     'all 0.18s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = `${cfg.color}20`; }}
                onMouseLeave={e => { e.currentTarget.style.background = cfg.bg; }}
              >
                View all in Feed
                <ArrowRight size={11} />
              </button>
            </div>
          )}

          {/* ── SUMMARY ── */}
          {!isHub && displayNode.summary && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{
                fontFamily: "'Inter', sans-serif",
                fontSize:   '0.9rem',
                color:      '#7A7572',
                lineHeight: 1.8,
              }}>
                <FormattedText text={displayNode.summary} />
              </div>
            </div>
          )}

          {/* ── CONNECTION TRACE PANEL ── */}
          {activeCandidate && (
            <TracePanel 
              candidate={activeCandidate}
              currentNode={displayNode}
              activeNodes={activeNodes}
            />
          )}

          {/* ── CONTEXT NOTE ── */}
          {!isHub && displayNode.context_note && displayNode.context_note.trim() && (
            <div style={{ 
              marginBottom: '1.25rem',
              padding: '0.85rem 1rem',
              borderRadius: 8,
              background: 'rgba(240,237,232,0.02)',
              borderLeft: `3px solid ${cfg.color}`,
              borderTop: '1px solid rgba(240,237,232,0.04)',
              borderRight: '1px solid rgba(240,237,232,0.04)',
              borderBottom: '1px solid rgba(240,237,232,0.04)',
            }}>
              <div style={{
                fontFamily:    "'JetBrains Mono', monospace",
                fontSize:      '0.56rem',
                letterSpacing: '0.1em',
                color:         '#8A8582',
                textTransform: 'uppercase',
                marginBottom:  '0.4rem',
                display:       'flex',
                alignItems:    'center',
                gap:           '0.3rem'
              }}>
                <Sparkle size={10} color={cfg.color} weight="fill" />
                My Context Note
              </div>
              <div style={{
                fontFamily: "'Inter', sans-serif",
                fontSize:   '0.85rem',
                color:      '#F0EDE8',
                lineHeight: 1.6,
                fontStyle:  'italic'
              }}>
                "{displayNode.context_note}"
              </div>
            </div>
          )}

          {/* ── TAGS (full clickable list) ── */}
          {!isHub && displayNode.tags && displayNode.tags.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{
                fontFamily:    "'JetBrains Mono', monospace",
                fontSize:      '0.56rem',
                letterSpacing: '0.1em',
                color:         '#3A3835',
                textTransform: 'uppercase',
                marginBottom:  '0.5rem',
              }}>
                Tags
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                {displayNode.tags.map((tag, i) => (
                  <button 
                    key={i} 
                    onClick={() => handleTagClick(tag)}
                    style={{
                      fontFamily:    "'JetBrains Mono', monospace",
                      fontSize:      '0.6rem',
                      color:         cfg.color,
                      background:    cfg.bg,
                      border:        `1px solid ${cfg.color}20`,
                      borderRadius:  4,
                      padding:       '3px 8px',
                      letterSpacing: '0.04em',
                      cursor:        'pointer',
                      transition:    'all 0.15s ease',
                    }}
                    onMouseEnter={e => e.target.style.background = `${cfg.color}18`}
                    onMouseLeave={e => e.target.style.background = cfg.bg}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── REMINDER FORM ── */}
          {showReminderInput && !isHub && (
            <form
              onSubmit={handleSaveReminder}
              style={{
                marginBottom:  '1.25rem',
                padding:       '1rem',
                borderRadius:  10,
                background:    'rgba(240,237,232,0.015)',
                border:        `1px solid ${cfg.color}20`,
                display:       'flex',
                flexDirection: 'column',
                gap:           '0.75rem',
              }}
            >
              <div style={{
                fontFamily:    "'JetBrains Mono', monospace",
                fontSize:      '0.56rem',
                letterSpacing: '0.1em',
                color:         cfg.color,
                textTransform: 'uppercase',
                marginBottom:  -2,
              }}>
                Set Reminder
              </div>

              <div>
                <label htmlFor="reminder-message" style={{ display: 'block', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.56rem', letterSpacing: '0.08em', color: '#534F4C', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                  Message
                </label>
                <input
                  id="reminder-message"
                  type="text"
                  value={reminderMessage}
                  onChange={e => setReminderMessage(e.target.value)}
                  style={{
                    width:        '100%',
                    padding:      '0.55rem 0.7rem',
                    borderRadius: 7,
                    border:       '1px solid rgba(240,237,232,0.08)',
                    background:   'rgba(0,0,0,0.3)',
                    color:        '#F0EDE8',
                    fontFamily:   "'Inter', sans-serif",
                    fontSize:     '0.85rem',
                    outline:      'none',
                    boxSizing:    'border-box',
                    transition:   'border-color 0.18s ease',
                  }}
                  onFocus={e  => { e.target.style.borderColor = `${cfg.color}50`; }}
                  onBlur={e   => { e.target.style.borderColor = 'rgba(240,237,232,0.08)'; }}
                  required
                />
              </div>

              <div>
                <label htmlFor="reminder-time" style={{ display: 'block', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.56rem', letterSpacing: '0.08em', color: '#534F4C', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
                  Remind At
                </label>
                <input
                  id="reminder-time"
                  type="datetime-local"
                  value={reminderTime}
                  onChange={e => setReminderTime(e.target.value)}
                  style={{
                    width:        '100%',
                    padding:      '0.55rem 0.7rem',
                    borderRadius: 7,
                    border:       '1px solid rgba(240,237,232,0.08)',
                    background:   'rgba(0,0,0,0.3)',
                    color:        '#F0EDE8',
                    fontFamily:   "'Inter', sans-serif",
                    fontSize:     '0.85rem',
                    outline:      'none',
                    boxSizing:    'border-box',
                    colorScheme:  'dark',
                  }}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={savingReminder}
                style={{
                  width:         '100%',
                  padding:       '0.6rem',
                  borderRadius:  8,
                  border:        'none',
                  background:    `linear-gradient(135deg, ${cfg.color}cc, ${cfg.color}88)`,
                  color:         '#0C0B0F',
                  fontFamily:    "'JetBrains Mono', monospace",
                  fontSize:      '0.6rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  fontWeight:    700,
                  cursor:        savingReminder ? 'default' : 'pointer',
                  opacity:       savingReminder ? 0.6 : 1,
                }}
              >
                {savingReminder ? 'Saving…' : 'Confirm Reminder'}
              </button>
            </form>
          )}

          {/* ── QUIZ ── */}
          {showQuiz && displayNode.quiz && !isHub && (
            <div style={{
              marginBottom:  '1.25rem',
              padding:       '1rem',
              borderRadius:  10,
              background:    'rgba(240,237,232,0.015)',
              border:        `1px solid ${cfg.color}20`,
            }}>
              <div style={{
                fontFamily:    "'JetBrains Mono', monospace",
                fontSize:      '0.56rem',
                letterSpacing: '0.1em',
                color:         cfg.color,
                textTransform: 'uppercase',
                marginBottom:  '0.75rem',
              }}>
                Test Yourself
              </div>
              <p style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize:   '0.875rem',
                color:      '#F0EDE8',
                lineHeight: 1.55,
                margin:     '0 0 0.875rem 0',
                fontWeight: 500,
              }}>
                {displayNode.quiz.question}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {displayNode.quiz.options.map((opt, idx) => {
                  let borderColor = 'rgba(240,237,232,0.07)';
                  let bg    = 'transparent';
                  let color = '#8A8582';
                  let Icon  = null;
                  if (quizAnswered) {
                    if (idx === displayNode.quiz.correct_index)  { borderColor = 'rgba(61,170,138,0.4)'; bg = 'rgba(42,74,58,0.35)'; color = '#3DAA8A'; Icon = CheckCircle; }
                    else if (idx === selectedOptionIdx)           { borderColor = 'rgba(180,60,60,0.4)';  bg = 'rgba(74,42,42,0.35)'; color = '#AA5A5A'; Icon = XCircle; }
                  }
                  return (
                    <button
                      key={idx}
                      onClick={() => !quizAnswered && handleSelectOption(idx)}
                      disabled={quizAnswered}
                      style={{
                        width:      '100%',
                        padding:    '0.55rem 0.7rem',
                        borderRadius: 7,
                        textAlign:  'left',
                        border:     `1px solid ${borderColor}`,
                        background: bg,
                        color,
                        fontFamily: "'Inter', sans-serif",
                        fontSize:   '0.825rem',
                        cursor:     quizAnswered ? 'default' : 'pointer',
                        transition: 'all 0.25s ease',
                        display:    'flex',
                        alignItems: 'center',
                        gap:        '0.45rem',
                        lineHeight: 1.4,
                      }}
                      onMouseEnter={e => { if (!quizAnswered) { e.currentTarget.style.borderColor = 'rgba(240,237,232,0.18)'; e.currentTarget.style.color = '#F0EDE8'; }}}
                      onMouseLeave={e => { if (!quizAnswered) { e.currentTarget.style.borderColor = 'rgba(240,237,232,0.07)'; e.currentTarget.style.color = '#8A8582'; }}}
                    >
                      {Icon && <Icon size={13} weight="fill" />}
                      {opt}
                    </button>
                  );
                })}
              </div>
              {quizAnswered && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(240,237,232,0.06)' }}>
                  <div style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize:   '0.8rem',
                    fontWeight: 600,
                    color:      selectedOptionIdx === displayNode.quiz.correct_index ? '#3DAA8A' : '#AA5A5A',
                    marginBottom: '0.35rem',
                  }}>
                    {selectedOptionIdx === displayNode.quiz.correct_index ? 'Correct' : 'Incorrect'}
                  </div>
                  <p style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize:   '0.8rem',
                    color:      '#534F4C',
                    margin:     0,
                    lineHeight: 1.65,
                  }}>
                    {displayNode.quiz.explanation}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── BOTTOM CLOSE (required by tests) ── */}
          <div style={{ marginTop: 'auto', paddingTop: '1rem' }}>
            <button
              onClick={onClose}
              style={{
                width:         '100%',
                padding:       '0.55rem',
                borderRadius:  8,
                border:        '1px solid rgba(240,237,232,0.06)',
                background:    'transparent',
                color:         '#2A2927',
                fontFamily:    "'JetBrains Mono', monospace",
                fontSize:      '0.575rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor:        'pointer',
                transition:    'all 0.18s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(240,237,232,0.12)'; e.currentTarget.style.color = '#534F4C'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(240,237,232,0.06)'; e.currentTarget.style.color = '#2A2927'; }}
            >
              Close
            </button>
          </div>
        </div>
      )}
      {showDeleteConfirm && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'rgba(28, 25, 23, 0.98)',
          backdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(240, 237, 232, 0.08)',
          padding: '1.25rem',
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.6)',
          zIndex: 300,
          animation: 'slideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1) both',
        }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.75rem',
            color: '#ef4444',
            marginBottom: '0.5rem',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <Warning size={14} weight="fill" /> Permanent Deletion
          </div>
          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '0.8125rem',
            color: '#9E9996',
            marginBottom: '1.25rem',
            lineHeight: '1.5',
          }}>
            Are you sure you want to permanently delete this signal? This action cannot be undone.
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={confirmDelete}
              style={{
                flex: 1,
                padding: '0.55rem',
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontFamily: "'Outfit', sans-serif",
                fontSize: '0.8125rem',
                fontWeight: 600,
                transition: 'all 0.18s ease',
              }}
              onMouseEnter={(e) => e.target.style.background = '#dc2626'}
              onMouseLeave={(e) => e.target.style.background = '#ef4444'}
            >
              Yes, Delete
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              style={{
                flex: 1,
                padding: '0.55rem',
                background: 'rgba(240,237,232,0.04)',
                color: '#D4CFC9',
                border: '1px solid rgba(240,237,232,0.08)',
                borderRadius: 8,
                cursor: 'pointer',
                fontFamily: "'Outfit', sans-serif",
                fontSize: '0.8125rem',
                transition: 'all 0.18s ease',
              }}
              onMouseEnter={(e) => { e.target.style.background = 'rgba(240,237,232,0.08)'; e.target.style.borderColor = 'rgba(240,237,232,0.15)'; }}
              onMouseLeave={(e) => { e.target.style.background = 'rgba(240,237,232,0.04)'; e.target.style.borderColor = 'rgba(240,237,232,0.08)'; }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
