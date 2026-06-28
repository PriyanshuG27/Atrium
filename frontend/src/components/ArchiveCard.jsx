import React, { useRef, useEffect } from 'react';

const SOURCE_COLORS = { url: '#9E88A1', voice: '#8FA382', pdf: '#CFA365', image: '#7C9EAA', text: '#8E8985', hub: '#8A7A6A' };

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatAge(dateStr) {
  if (!dateStr) return '';
  const diffH = Math.floor((Date.now() - new Date(dateStr)) / 3600000);
  if (diffH < 1) return 'just now';
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return formatDate(dateStr);
}

export default function ArchiveCard({ item, isActive, opacity, blur, onClick }) {
  const cardRef = useRef(null);

  useEffect(() => {
    if (!isActive) return;
    const card = cardRef.current;
    if (!card) return;
    const onMove = (e) => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
      const y = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
      card.style.transform = `perspective(1200px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg)`;
    };
    const onLeave = () => { card.style.transform = 'perspective(1200px) rotateY(0deg) rotateX(0deg)'; };
    card.addEventListener('mousemove', onMove);
    card.addEventListener('mouseleave', onLeave);
    return () => { card.removeEventListener('mousemove', onMove); card.removeEventListener('mouseleave', onLeave); };
  }, [isActive]);

  const sourceColor = SOURCE_COLORS[item.source_type] || '#8E8985';
  const summary = item.summary || item.raw_text || '';
  const excerpt = summary.length > 160 ? summary.slice(0, 160) + '\u2026' : summary;
  const tags = item.tags || [];

  return (
    <div ref={cardRef} onClick={onClick} style={{ width: 'min(480px, 90vw)', minHeight: 280, background: 'rgba(17,15,20,0.88)', border: `1px solid rgba(207,163,101,${isActive ? 0.18 : 0.06})`, borderRadius: 16, padding: '2rem 2rem 1.5rem', cursor: isActive ? 'pointer' : 'default', opacity, filter: blur > 0 ? `blur(${blur}px)` : 'none', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', transition: 'transform 0.25s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease', position: 'relative', overflow: 'hidden', userSelect: isActive ? 'text' : 'none', boxShadow: isActive ? '0 0 60px rgba(207,163,101,0.08), 0 24px 64px rgba(0,0,0,0.5)' : '0 12px 32px rgba(0,0,0,0.4)' }}>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontFamily: 'var(--font-display)', fontSize: 'clamp(40px,12vw,80px)', fontWeight: 700, color: 'rgba(207,163,101,0.05)', whiteSpace: 'nowrap', pointerEvents: 'none', letterSpacing: '-0.04em', lineHeight: 1 }}>{formatDate(item.created_at)}</div>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${sourceColor}44,transparent)`, borderRadius: '16px 16px 0 0' }} />
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(20px,3vw,36px)', fontWeight: 600, color: 'var(--text-signal)', lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: '0.875rem', position: 'relative', zIndex: 1 }}>{item.title || item.summary?.slice(0, 80) || 'Untitled Signal'}</h2>
      {excerpt && <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: '1.25rem', position: 'relative', zIndex: 1 }}>{excerpt}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', position: 'relative', zIndex: 1, borderTop: '1px solid rgba(244,239,235,0.06)', paddingTop: '0.875rem' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: sourceColor, letterSpacing: '0.08em', textTransform: 'uppercase', background: `${sourceColor}18`, padding: '2px 8px', borderRadius: 4 }}>{item.source_type || 'signal'}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>{formatAge(item.created_at)}</span>
        {tags.slice(0, 4).map(tag => <span key={tag} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(207,163,101,0.6)', letterSpacing: '0.04em' }}>#{tag}</span>)}
      </div>
    </div>
  );
}
