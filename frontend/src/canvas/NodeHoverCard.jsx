import React, { useMemo } from 'react';

/* ============================================================
   NodeHoverCard — HTML overlay rendered by drei's <Html>
   inside a GraphNode3D component.

   Appears above the node in 3D space. Title first, then
   summary (clamped to 2 lines), then tags inline.
   No border, no background frame — just type + soft glow.
   ============================================================ */

const SLUG_LABELS = {
  url:   'LINK',
  voice: 'VOICE',
  pdf:   'PDF',
  image: 'IMAGE',
  text:  'TEXT',
  hub:   'CLUSTER',
};

export default function NodeHoverCard({ node, isHub, color }) {
  const slug = SLUG_LABELS[node.source_type] || (isHub ? 'CLUSTER' : 'NOTE');

  const tags = useMemo(() => {
    if (!node.tags || node.tags.length === 0) return '';
    return node.tags.slice(0, 4).map(t => `#${t}`).join('  ');
  }, [node.tags]);

  const excerpt = useMemo(() => {
    const s = node.summary || '';
    return s.length > 120 ? s.slice(0, 118) + '…' : s;
  }, [node.summary]);

  return (
    <div style={{
      width: 240,
      padding: '12px 14px',
      background: 'rgba(13, 11, 18, 0.92)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderRadius: 4,
      boxShadow: `0 0 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(240,237,232,0.06)`,
      fontFamily: 'Inter, sans-serif',
      animation: 'hoverCardIn 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) both',
    }}>
      {/* Source slug */}
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '0.55rem',
        letterSpacing: '0.1em',
        color,
        opacity: 0.7,
        marginBottom: 6,
        textTransform: 'uppercase',
      }}>
        {slug}
      </div>

      {/* Title */}
      <div style={{
        fontFamily: "'Outfit', sans-serif",
        fontSize: '0.875rem',
        fontWeight: 600,
        color: '#F0EDE8',
        lineHeight: 1.35,
        marginBottom: excerpt ? 8 : 0,
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
      }}>
        {node.title || 'Untitled'}
      </div>

      {/* Summary excerpt */}
      {excerpt && (
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: '0.75rem',
          color: '#8A8582',
          lineHeight: 1.6,
          marginBottom: tags ? 8 : 0,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {excerpt}
        </div>
      )}

      {/* Tags */}
      {tags && (
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.6rem',
          color: '#4A4845',
          letterSpacing: '0.04em',
        }}>
          {tags}
        </div>
      )}
    </div>
  );
}
