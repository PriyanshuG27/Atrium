import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Link as LinkIcon,
  Microphone,
  FilePdf,
  Image as ImageIcon,
  Note,
  DotsThree,
  Trash,
  Eye,
  ShareNetwork,
  SquaresFour,
} from '@phosphor-icons/react';
import EmptyState from '../components/EmptyState';
import { useToast } from '../components/Toast';
import { FeedCardSkeleton } from '../components/Skeleton';
import FormattedText from '../components/FormattedText';

/* =============================================================================
   RECALL — Feed v2 — "The Archive"
   Design: editorial masonry, ink-drop badges, no neon, warm stone palette.
   =============================================================================*/

// ── Relative time ──────────────────────────────────────────────────────────────
function formatRelativeTime(dateString) {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1)  return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'yesterday';
  return `${diffDays}d ago`;
}

// ── Source config — warm, non-neon colours ─────────────────────────────────────
const SOURCE_CONFIG = {
  url:   { icon: <LinkIcon   size={12} weight="bold" />, label: 'URL',   color: '#7C6FD4', bg: 'rgba(124,111,212,0.12)', border: 'rgba(124,111,212,0.22)' },
  voice: { icon: <Microphone size={12} weight="bold" />, label: 'VOICE', color: '#3DAA8A', bg: 'rgba(61,170,138,0.12)',  border: 'rgba(61,170,138,0.22)'  },
  pdf:   { icon: <FilePdf    size={12} weight="bold" />, label: 'PDF',   color: '#C9893C', bg: 'rgba(201,137,60,0.12)',  border: 'rgba(201,137,60,0.22)'  },
  image: { icon: <ImageIcon  size={12} weight="bold" />, label: 'IMAGE', color: '#3D8AAA', bg: 'rgba(61,138,170,0.12)',  border: 'rgba(61,138,170,0.22)'  },
  text:  { icon: <Note       size={12} weight="bold" />, label: 'TEXT',  color: '#8A8582', bg: 'rgba(138,133,130,0.12)', border: 'rgba(138,133,130,0.22)' },
  hub:   { icon: <ShareNetwork size={12} weight="bold" />, label: 'HUB', color: '#8A7A6A', bg: 'rgba(138,122,106,0.12)', border: 'rgba(138,122,106,0.22)' },
};
function getSourceConfig(type) {
  return SOURCE_CONFIG[type] || SOURCE_CONFIG.text;
}

const FILTER_TYPES = [
  { type: 'all',   label: 'All'    },
  { type: 'url',   label: 'Links'  },
  { type: 'voice', label: 'Voice'  },
  { type: 'pdf',   label: 'PDFs'   },
  { type: 'image', label: 'Images' },
  { type: 'text',  label: 'Text'   },
];
const DEFAULT_ACTIVE_NODES = [];

const SLUG = {
  url:   'LINK',
  voice: 'VOICE',
  pdf:   'PDF',
  image: 'IMAGE',
  text:  'TEXT',
  hub:   'CLUSTER',
};

const BroadsheetRow = React.forwardRef(({
  item,
  onNodeClick,
  onViewInGraph,
  handleDeleteItem,
  activeMenuId,
  handleToggleMenu,
  menuRef,
}, ref) => {
  const [revealed, setRevealed] = React.useState(false);
  const [hovered,  setHovered]  = React.useState(false);
  const localRef = useRef(null);

  useEffect(() => {
    const el = localRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setRevealed(true); obs.unobserve(el); }
    }, { threshold: 0.04 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const cfg  = getSourceConfig(item.source_type);
  const slug = SLUG[item.source_type] || 'NOTE';
  const time = formatRelativeTime(item.created_at);
  const excerpt = (item.summary || '').slice(0, 160);
  const tags = (item.tags || []).slice(0, 5).map(t => `#${t}`).join('  ');

  return (
    <div
      className={`feed-card source-${item.source_type || 'text'}`}
      data-source={item.source_type || 'text'}
      ref={el => {
        localRef.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onNodeClick(item)}
      style={{
        padding: '1.25rem 0',
        borderTop: '1px solid rgba(240,237,232,0.05)',
        opacity: revealed ? 1 : 0,
        transform: revealed ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 0.35s ease, transform 0.35s ease',
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      {/* Slug + timestamp row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.45rem',
      }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.58rem',
          letterSpacing: '0.1em',
          color: cfg.color,
          opacity: 0.65,
          textTransform: 'uppercase',
        }}>
          {slug}
        </span>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.6rem',
          color: '#4A4845',
          letterSpacing: '0.04em',
        }}>
          {time}
        </span>
      </div>

      {/* Title */}
      <div style={{
        fontFamily: "'Outfit', sans-serif",
        fontSize: '1.0rem',
        fontWeight: 500,
        color: '#F0EDE8',
        lineHeight: 1.35,
        letterSpacing: hovered ? '0.008em' : '-0.01em',
        transition: 'letter-spacing 0.25s ease, opacity 0.25s ease',
        opacity: hovered ? 0.88 : 1,
        marginBottom: excerpt ? '0.45rem' : 0,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {item.title || 'Untitled'}
      </div>

      {/* Excerpt */}
      {excerpt && (
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: '0.8125rem',
          color: '#8A8582',
          lineHeight: 1.65,
          marginBottom: tags ? '0.55rem' : 0,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
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

      {/* Context menu trigger (right-click or ⋯ button on hover) */}
      <div
        ref={activeMenuId === item.id ? menuRef : null}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: '1.25rem',
          right: 0,
          opacity: (hovered || activeMenuId === item.id) ? 1 : 0,
          pointerEvents: (hovered || activeMenuId === item.id) ? 'auto' : 'none',
          transition: 'opacity 0.2s ease',
        }}
      >
        <button
          onClick={e => handleToggleMenu(e, item.id)}
          aria-label="Item Actions"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#534F4C',
            cursor: 'pointer',
            padding: '2px 4px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <DotsThree size={14} weight="bold" />
        </button>

        {activeMenuId === item.id && (
          <div style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            minWidth: 140,
            background: 'rgba(20,18,24,0.97)',
            border: '1px solid rgba(240,237,232,0.1)',
            borderRadius: 4,
            padding: '4px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            zIndex: 100,
          }}>
            <button
              style={menuItemStyle}
              onClick={e => { e.stopPropagation(); onViewInGraph(item); }}
            >
              <Eye size={11} /> View in Graph
            </button>
            <button
              style={{ ...menuItemStyle, color: 'rgba(239,68,68,0.8)' }}
              onClick={e => handleDeleteItem(e, item.id)}
            >
              <Trash size={11} /> Delete
            </button>
          </div>
        )}
      </div>

    </div>
  );
});

BroadsheetRow.displayName = 'BroadsheetRow';

const menuItemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem',
  width: '100%',
  padding: '6px 10px',
  background: 'transparent',
  border: 'none',
  color: '#8A8582',
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '0.65rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  borderRadius: 3,
  textAlign: 'left',
};

export default function Feed({
  onNodeClick,
  onViewInGraph,
  searchQuery = '',
  memberIdsFilter = null,
  activeNodes = DEFAULT_ACTIVE_NODES,
  onClearMemberFilter,
  filterHubLabel = '',
}) {
  const { addToast } = useToast();
  const [items, setItems]               = useState([]);
  const [page, setPage]                 = useState(1);
  const [totalPages, setTotalPages]     = useState(1);
  const [loading, setLoading]           = useState(false);
  const [hasMore, setHasMore]           = useState(true);
  const [isFirstLoad, setIsFirstLoad]   = useState(true);

  const [activeMainTab, setActiveMainTab] = useState('items');
  const [sourceType, setSourceType]       = useState('all');
  const [fromDate, setFromDate]           = useState('');
  const [toDate, setToDate]               = useState('');
  const [tagFilter, setTagFilter]         = useState('');
  const [tagsList, setTagsList]           = useState([]);
  const [activeMenuId, setActiveMenuId]   = useState(null);
  const menuRef = useRef(null);

  // Infinite scroll
  const observer = useRef(null);
  const lastCardRef = useCallback((node) => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) setPage(p => p + 1);
    });
    if (node) observer.current.observe(node);
  }, [loading, hasMore]);

  // Close menu on outside click
  useEffect(() => {
    const handler = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setActiveMenuId(null);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, []);

  // Fetch tags
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/tags');
        if (res.ok) setTagsList(await res.json());
      } catch (err) { console.error('Failed to fetch tags:', err); }
    })();
  }, []);

  // Keep a stable ref to activeNodes so fetchItems doesn't recreate on every graph update
  const activeNodesRef = useRef(activeNodes);
  useEffect(() => { activeNodesRef.current = activeNodes; }, [activeNodes]);

  // Fetch items
  const fetchItems = useCallback(async (pageNum, isReset = false) => {
    const nodes = activeNodesRef.current;

    if (activeMainTab === 'hubs') {
      setLoading(true);
      try {
        let matched = nodes.filter(n => n.source_type === 'hub' || n.id < 0);
        if (tagFilter)  matched = matched.filter(i => i.tags?.includes(tagFilter));
        if (fromDate)   matched = matched.filter(i => new Date(i.created_at) >= new Date(fromDate));
        if (toDate)     matched = matched.filter(i => new Date(i.created_at) <= new Date(toDate));
        setItems(matched);
        setTotalPages(1);
        setHasMore(false);
      } catch (err) { console.error('Failed to filter hubs:', err); }
      finally { setLoading(false); setIsFirstLoad(false); }
      return;
    }

    if (memberIdsFilter) {
      setLoading(true);
      try {
        let matched = nodes.filter(n => n.id > 0 && memberIdsFilter.includes(n.id));
        if (sourceType !== 'all') matched = matched.filter(i => i.source_type === sourceType);
        if (tagFilter)  matched = matched.filter(i => i.tags?.includes(tagFilter));
        if (fromDate)   matched = matched.filter(i => new Date(i.created_at) >= new Date(fromDate));
        if (toDate)     matched = matched.filter(i => new Date(i.created_at) <= new Date(toDate));
        setItems(matched);
        setTotalPages(1);
        setHasMore(false);
      } catch (err) { console.error('Failed to filter members:', err); }
      finally { setLoading(false); setIsFirstLoad(false); }
      return;
    }

    setLoading(true);
    try {
      if (searchQuery.trim()) {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchQuery, limit: 50, rag: false }),
        });
        if (res.ok) {
          const data = await res.json();
          let items = (data.sources || []).map(s => ({
            id: s.id, title: s.title, summary: s.summary,
            source_type: s.source_type || 'text', source_url: s.source_url,
            tags: s.tags || [], created_at: s.created_at,
          }));
          if (sourceType !== 'all') items = items.filter(i => i.source_type === sourceType);
          if (tagFilter)  items = items.filter(i => i.tags?.includes(tagFilter));
          if (fromDate)   items = items.filter(i => new Date(i.created_at) >= new Date(fromDate));
          if (toDate)     items = items.filter(i => new Date(i.created_at) <= new Date(toDate));
          setItems(items); setTotalPages(1); setHasMore(false);
        }
        return;
      }

      const q = new URLSearchParams({ page: pageNum.toString(), limit: '20' });
      if (sourceType !== 'all') q.append('source_type', sourceType);
      if (tagFilter) q.append('tag', tagFilter);
      if (fromDate)  q.append('from_date', fromDate);
      if (toDate)    q.append('to_date', toDate);

      const url = `/api/items?${q.toString()}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setItems(prev => isReset ? data.items : [...prev, ...data.items]);
        setTotalPages(data.pages);
        setHasMore(pageNum < data.pages);
      }
    } catch (err) { console.error('Failed to fetch items:', err); }
    finally { setLoading(false); setIsFirstLoad(false); }
    // activeNodes intentionally excluded — read via ref to keep fetchItems stable
  }, [activeMainTab, sourceType, tagFilter, fromDate, toDate, searchQuery, memberIdsFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setPage(1); fetchItems(1, true); },
    [activeMainTab, sourceType, tagFilter, fromDate, toDate, searchQuery, fetchItems]);

  useEffect(() => {
    const h = () => fetchItems(1, true);
    window.addEventListener('online-refetch', h);
    return () => window.removeEventListener('online-refetch', h);
  }, [fetchItems]);

  useEffect(() => { if (page > 1) fetchItems(page); }, [page, fetchItems]);


  const handleDeleteItem = async (e, itemId) => {
    e.stopPropagation();
    setActiveMenuId(null);
    if (itemId < 0) { addToast('Cannot delete a semantic hub.', 'warning'); return; }
    
    const originalItem = items.find(i => i.id === itemId);
    if (!originalItem) return;

    // Optimistically remove from state
    setItems(prev => prev.filter(i => i.id !== itemId));

    let undone = false;

    addToast('Signal deleted', 'success', {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: () => {
          undone = true;
          // Restore back to items list, preserving sort by created_at desc
          setItems(prev => {
            if (prev.some(i => i.id === itemId)) return prev;
            return [...prev, originalItem].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          });
        }
      }
    });

    // Actually perform delete after delay if not undone
    setTimeout(async () => {
      if (undone) return;
      try {
        const res = await fetch(`/api/items/${itemId}`, { method: 'DELETE' });
        if (res.ok) {
          window.dispatchEvent(new CustomEvent('items-updated'));
        } else {
          // Restore on failure
          setItems(prev => {
            if (prev.some(i => i.id === itemId)) return prev;
            return [...prev, originalItem].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          });
        }
      } catch (err) {
        console.error('Delete failed:', err);
        setItems(prev => {
          if (prev.some(i => i.id === itemId)) return prev;
          return [...prev, originalItem].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        });
      }
    }, 5000);
  };

  const handleToggleMenu = (e, itemId) => {
    e.stopPropagation();
    setActiveMenuId(activeMenuId === itemId ? null : itemId);
  };

  return (
    <div className="feed-view-container">

      {/* ── Hub filter banner ── */}
      {memberIdsFilter && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.55rem 2rem',
          borderBottom: '1px solid rgba(138,122,106,0.15)',
          background: 'rgba(138,122,106,0.05)',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.65rem',
          letterSpacing: '0.06em',
          color: '#8A7A6A',
          flexShrink: 0,
        }}>
          <span>Cluster — <strong style={{ color: '#C9A97A' }}>{filterHubLabel || 'hub'}</strong></span>
          <button
            onClick={onClearMemberFilter}
            style={{
              background: 'none', border: 'none',
              color: '#534F4C', fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.6rem', letterSpacing: '0.06em', textTransform: 'uppercase',
              textDecoration: 'underline', cursor: 'pointer',
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Filter bar ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        flexWrap: 'wrap',
        padding: '0.5rem 2rem',
        borderBottom: '1px solid rgba(240,237,232,0.05)',
        background: 'rgba(12,11,15,0.7)',
        backdropFilter: 'blur(12px)',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}>
        {/* Items / Hubs tab */}
        <div style={{ display: 'flex', gap: 2, background: 'rgba(240,237,232,0.04)', border: '1px solid rgba(240,237,232,0.07)', borderRadius: 3, padding: 2 }}>
          {['items','hubs'].map(tab => (
            <button
              key={tab}
              onClick={() => { setActiveMainTab(tab); setSourceType('all'); }}
              style={{
                padding: '0.2rem 0.6rem',
                border: 'none',
                borderRadius: 2,
                background: activeMainTab === tab ? 'rgba(240,237,232,0.08)' : 'transparent',
                color: activeMainTab === tab ? '#F0EDE8' : '#534F4C',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.6rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              {tab === 'items' ? 'Items' : 'Clusters'}
            </button>
          ))}
        </div>

        {/* Source type filters */}
        {activeMainTab === 'items' && FILTER_TYPES.filter(f => f.type !== 'all').map(({ type, label }) => (
          <button
            key={type}
            onClick={() => setSourceType(t => t === type ? 'all' : type)}
            style={{
              padding: '0.2rem 0.5rem',
              border: '1px solid rgba(240,237,232,0.07)',
              borderRadius: 2,
              background: sourceType === type ? 'rgba(240,237,232,0.07)' : 'transparent',
              color: sourceType === type ? '#F0EDE8' : '#534F4C',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '0.58rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        {/* Date range */}
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
          aria-label="From Date"
          style={{ background: 'rgba(240,237,232,0.04)', border: '1px solid rgba(240,237,232,0.07)', borderRadius: 2, color: '#8A8582', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6rem', padding: '0.2rem 0.4rem', outline: 'none', width: 110 }} />
        <span style={{ color: '#534F4C', fontSize: '0.6rem' }}>—</span>
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
          aria-label="To Date"
          style={{ background: 'rgba(240,237,232,0.04)', border: '1px solid rgba(240,237,232,0.07)', borderRadius: 2, color: '#8A8582', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6rem', padding: '0.2rem 0.4rem', outline: 'none', width: 110 }} />

        <input
          type="text"
          placeholder="#tag"
          value={tagFilter}
          onChange={e => setTagFilter(e.target.value)}
          style={{ background: 'rgba(240,237,232,0.04)', border: '1px solid rgba(240,237,232,0.07)', borderRadius: 2, color: '#8A8582', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6rem', padding: '0.2rem 0.4rem', outline: 'none', width: 90 }}
        />
      </div>

      {/* ── Broadsheet content ── */}
      <div style={{
        overflow: 'auto',
        flex: 1,
        padding: '0.5rem 2rem 5rem',
        maxWidth: 680,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(240,237,232,0.06) transparent',
      }}>
        {isFirstLoad ? (
          <FeedCardSkeleton />
        ) : items.length > 0 ? (
          items.map((item, idx) => {
            const isLast = idx === items.length - 1;
            return (
              <BroadsheetRow
                key={item.id}
                ref={isLast ? lastCardRef : null}
                item={item}
                onNodeClick={onNodeClick}
                onViewInGraph={onViewInGraph}
                handleDeleteItem={handleDeleteItem}
                activeMenuId={activeMenuId}
                handleToggleMenu={handleToggleMenu}
                menuRef={menuRef}
              />
            );
          })
        ) : (
          <EmptyState variant={searchQuery ? 'search' : 'feed'} query={searchQuery} />
        )}

        {loading && !isFirstLoad && (
          <div style={{
            padding: '1.5rem',
            textAlign: 'center',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '0.6rem',
            letterSpacing: '0.1em',
            color: '#534F4C',
            textTransform: 'uppercase',
          }}>
            Loading…
          </div>
        )}
      </div>
    </div>
  );
}
