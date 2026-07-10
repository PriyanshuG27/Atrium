import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, Microphone, FilePdf, Image, Note } from '@phosphor-icons/react';
import { useToast } from './Toast';

/* ============================================================
   SearchOverlay — Cmd+K / Ctrl+K frosted glass search.

   Features:
   - Frosted-glass panel, entrance animation
   - Live search via POST /api/search with fuzzy highlight
   - Empty state: 2-column layout (Recent Searches & Quick Actions)
   - Popular tags section fetched from /api/tags
   - Action command mode when query starts with "/"
   - Create note view inside command center
   - Keyboard: ↑↓ to navigate results/actions, Enter to execute
   ============================================================ */

const SOURCE_COLORS = {
  url:   '#9E88A1',
  voice: '#8FA382',
  pdf:   '#CFA365',
  image: '#7C9EAA',
  text:  '#8E8985',
  hub:   '#8A7A6A',
};

// Fuzzy match highlight function
function highlightText(text, query) {
  if (!query || !text) return text;
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return text;
  const before = text.slice(0, index);
  const match = text.slice(index, index + query.length);
  const after = text.slice(index + query.length);
  return (
    <>
      {before}
      <mark style={{ background: 'transparent', color: 'var(--accent-gold, #CFA365)', fontWeight: 'bold', padding: 0 }}>{match}</mark>
      {after}
    </>
  );
}

function ResultCard({ item, isSelected, query, onClick }) {
  const summary = item.summary || item.raw_text || '';
  const excerpt = summary.length > 120 ? summary.slice(0, 120) + '…' : summary;
  const color   = SOURCE_COLORS[item.source_type] || '#8E8985';

  return (
    <button
      onClick={() => onClick(item)}
      style={{
        width: '100%',
        background: isSelected ? 'rgba(207,163,101,0.07)' : 'transparent',
        border: 'none',
        borderBottom: '1px solid rgba(244,239,235,0.05)',
        borderLeft: isSelected ? '2px solid rgba(207,163,101,0.55)' : '2px solid transparent',
        padding: '0.875rem 1.25rem',
        paddingLeft: isSelected ? 'calc(1.25rem - 2px)' : '1.25rem',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'all 0.12s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
        {/* Source dot */}
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: color, flexShrink: 0,
        }} />
        {/* Title */}
        <span style={{
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          fontWeight: 500,
          color: 'var(--text-signal)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '90%',
        }}>
          {highlightText(item.title || 'Untitled Signal', query)}
        </span>
      </div>
      {excerpt && (
        <span style={{
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          color: 'var(--text-muted)',
          lineHeight: 1.5,
          paddingLeft: '1.1rem',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {highlightText(excerpt, query)}
        </span>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', paddingLeft: '1.1rem', flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: color,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          background: `${color}18`,
          padding: '1px 5px',
          borderRadius: 3,
        }}>
          {item.source_type || 'signal'}
        </span>
        {(item.tags || []).slice(0, 3).map(t => (
          <span key={t} style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'rgba(207,163,101,0.5)',
          }}>#{t}</span>
        ))}
      </div>
    </button>
  );
}

const SEARCH_FILTERS = [
  { id: 'all',   label: 'ALL',   color: '#8A8582', icon: null },
  { id: 'url',   label: 'LINKS',  color: '#7C6FD4', icon: <Link size={12} style={{ marginRight: 4 }} /> },
  { id: 'voice', label: 'VOICE',  color: '#3DAA8A', icon: <Microphone size={12} style={{ marginRight: 4 }} /> },
  { id: 'pdf',   label: 'PDF',    color: '#C9893C', icon: <FilePdf size={12} style={{ marginRight: 4 }} /> },
  { id: 'image', label: 'IMAGES', color: '#3D8AAA', icon: <Image size={12} style={{ marginRight: 4 }} /> },
  { id: 'text',  label: 'NOTES',  color: '#8A8582', icon: <Note size={12} style={{ marginRight: 4 }} /> },
];

export default function SearchOverlay({ onClose, onItemSelect, dueCount = 0 }) {
  const [query,        setQuery]        = useState('');
  const [results,      setResults]      = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [selectedIdx,  setSelectedIdx]  = useState(0);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [topTags,      setTopTags]      = useState([]);
  const { addToast } = useToast();

  // Command panel views: 'search' | 'create-note'
  const [activeView,   setActiveView]   = useState('search');
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteText,  setNewNoteText]  = useState('');
  const [savingNote,   setSavingNote]   = useState(false);

  const [recentSearches, setRecentSearches] = useState(() => {
    const saved = localStorage.getItem('atrium-recent-searches');
    return saved ? JSON.parse(saved) : [];
  });

  const inputRef  = useRef(null);
  const panelRef  = useRef(null);
  const debounce  = useRef(null);

  // Actions list for Action Mode
  const actions = [
    { cmd: '/drill', name: 'Start Review Drill', desc: 'Navigate to Drill room to review due cards' },
    { cmd: '/export', name: 'Export Signals Backup', desc: 'Download a JSON file backup of all signals' },
    { cmd: '/tag', name: 'Add Tag Filter', desc: 'Prefix search overlay with # to filter by tag' },
    { cmd: '/delete', name: 'Delete Last Signal', desc: 'Delete the most recently selected signal' },
  ];

  const filteredActions = query.startsWith('/') 
    ? actions.filter(a => a.cmd.startsWith(query.toLowerCase()))
    : [];

  /* ── Fetch Top Tags on mount ── */
  useEffect(() => {
    fetch('/api/tags')
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setTopTags(list.slice(0, 5));
      })
      .catch(err => console.error('Failed to fetch top tags:', err));
  }, []);

  /* ── Entrance animation ── */
  useEffect(() => {
    inputRef.current?.focus();
    if (panelRef.current) {
      panelRef.current.style.opacity = '0';
      panelRef.current.style.transform = 'scale(0.96) translateY(-8px)';
      requestAnimationFrame(() => {
        if (panelRef.current) {
          panelRef.current.style.transition = 'opacity 0.2s ease, transform 0.2s cubic-bezier(0.16,1,0.3,1)';
          panelRef.current.style.opacity = '1';
          panelRef.current.style.transform = 'scale(1) translateY(0)';
        }
      });
    }
  }, [activeView]);

  /* ── Save recent searches ── */
  const saveSearch = useCallback((q) => {
    if (!q || !q.trim() || q.startsWith('/')) return;
    setRecentSearches(prev => {
      const filtered = prev.filter(x => x.toLowerCase() !== q.trim().toLowerCase());
      const next = [q.trim(), ...filtered].slice(0, 5);
      localStorage.setItem('atrium-recent-searches', JSON.stringify(next));
      return next;
    });
  }, []);

  const clearSearch = useCallback((e, q) => {
    e.stopPropagation();
    setRecentSearches(prev => {
      const next = prev.filter(x => x !== q);
      localStorage.setItem('atrium-recent-searches', JSON.stringify(next));
      return next;
    });
  }, []);

  const clearAllSearches = useCallback(() => {
    setRecentSearches([]);
    localStorage.removeItem('atrium-recent-searches');
  }, []);

  /* ── Debounced search ── */
  useEffect(() => {
    if (!query.trim() || query.startsWith('/')) {
      setResults([]);
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: query.trim(), rag: false }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const raw = data?.sources ?? data?.results ?? data ?? [];
        setResults(Array.isArray(raw) ? raw : []);
        setSelectedIdx(0);
      } catch (err) {
        console.error('Search failed:', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query]);

  // Client-side filter results by source type
  const filteredResults = sourceFilter === 'all'
    ? results
    : results.filter(r => r.source_type === sourceFilter);

  const totalItems = query.startsWith('/') ? filteredActions.length : filteredResults.length;

  /* ── Keyboard navigation ── */
  useEffect(() => {
    if (activeView !== 'search') return;
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(i => Math.min(i + 1, totalItems - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(i => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (query.startsWith('/')) {
          const act = filteredActions[selectedIdx];
          if (act) executeAction(act.cmd);
        } else if (filteredResults[selectedIdx]) {
          saveSearch(query);
          onItemSelect?.(filteredResults[selectedIdx]);
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filteredResults, filteredActions, selectedIdx, onClose, onItemSelect, query, totalItems, activeView, saveSearch]);

  const handleItemClick = useCallback((item) => {
    saveSearch(query);
    onItemSelect?.(item);
    onClose();
  }, [onItemSelect, onClose, query, saveSearch]);

  /* ── Save Note POST Ingest ── */
  const handleSaveNote = async () => {
    if (!newNoteText.trim()) return;
    try {
      setSavingNote(true);
      const res = await fetch('/api/extension/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: newNoteText.trim(),
          title: newNoteTitle.trim() || undefined,
        }),
      });
      if (res.ok) {
        setNewNoteText('');
        setNewNoteTitle('');
        setActiveView('search');
        window.dispatchEvent(new CustomEvent('items-updated'));
        addToast?.('Note saved successfully', 'success');
      } else {
        addToast?.('Failed to save note', 'error');
      }
    } catch (err) {
      console.error(err);
      addToast?.('Error saving note', 'error');
    } finally {
      setSavingNote(false);
    }
  };

  /* ── Export signals backup ── */
  const handleExportBackup = async () => {
    try {
      const res = await fetch('/api/items?limit=500');
      const data = await res.json();
      const items = data.items || data || [];
      const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `atrium-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast?.('Exported backup file successfully', 'success');
    } catch (err) {
      console.error(err);
      addToast?.('Failed to export signals', 'error');
    }
  };

  /* ── Execute Command Actions ── */
  const executeAction = (cmd) => {
    if (cmd === '/drill') {
      onItemSelect?.({ type: 'drill' });
      onClose();
    } else if (cmd === '/export') {
      handleExportBackup();
      onClose();
    } else if (cmd === '/tag') {
      setQuery('#');
      inputRef.current?.focus();
    } else if (cmd === '/delete') {
      // Get the last item from local storage recent selections or just toast
      addToast?.('Select a signal in the list to delete it.', 'warning');
      onClose();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(8,7,10,0.7)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 300,
        }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Search"
        aria-modal="true"
        style={{
          position: 'fixed',
          top: '12vh',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(640px, 90vw)',
          maxHeight: '70vh',
          background: 'rgba(17,15,20,0.97)',
          border: '1px solid rgba(207,163,101,0.15)',
          borderRadius: 12,
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          zIndex: 301,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(207,163,101,0.08)',
        }}
      >
        {activeView === 'search' ? (
          <>
            {/* Search input row */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '1rem 1.25rem',
              borderBottom: '1px solid rgba(244,239,235,0.06)',
              flexShrink: 0,
            }}>
              {/* Search icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(207,163,101,0.6)" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>

              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search signals or type '/' for actions..."
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontFamily: 'var(--font-body)',
                  fontSize: 15,
                  color: 'var(--text-signal)',
                  caretColor: 'var(--accent-gold)',
                }}
              />

              {loading && (
                <div style={{
                  width: 14, height: 14, borderRadius: '50%',
                  border: '1.5px solid rgba(207,163,101,0.2)',
                  borderTopColor: 'var(--accent-gold)',
                  animation: 'spin 0.8s linear infinite',
                }} />
              )}

              <button
                onClick={onClose}
                className="search-close-btn"
                aria-label="Close search overlay"
                style={{
                  background: 'transparent',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'rgba(244,239,235,0.4)',
                  letterSpacing: '0.08em',
                  border: '1px solid rgba(244,239,235,0.15)',
                  borderRadius: 4,
                  padding: '2px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                <span className="search-esc-kbd">ESC</span>
                <span className="search-close-x" style={{ display: 'none' }}>✕</span>
              </button>
            </div>

            {/* Filter chips (hidden in Action Mode) */}
            {!query.startsWith('/') && query.trim() && (
              <div style={{
                display: 'flex',
                gap: '0.375rem',
                padding: '0.625rem 1.25rem',
                borderBottom: '1px solid rgba(244,239,235,0.05)',
                flexShrink: 0,
                overflowX: 'auto',
              }}>
                {SEARCH_FILTERS.map(f => {
                  const active = sourceFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setSourceFilter(f.id)}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        letterSpacing: '0.08em',
                        padding: '0.25rem 0.6rem',
                        borderRadius: 5,
                        border: `1px solid ${active ? f.color : 'rgba(244,239,235,0.08)'}`,
                        background: active ? `${f.color}20` : 'transparent',
                        color: active ? f.color : 'rgba(244,239,235,0.3)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.12s ease',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {f.icon}
                      <span>{f.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Results / Home View */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {/* Home state: empty query */}
              {!query.trim() && (
                <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="search-grid">
                    {/* Left Column: Recent Searches */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(244,239,235,0.25)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                        Recent Searches
                      </span>
                      {recentSearches.length === 0 ? (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(244,239,235,0.15)' }}>
                          No recent searches.
                        </span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          {recentSearches.map((s, idx) => (
                            <div 
                              key={idx}
                              onClick={() => {
                                setQuery(s);
                                inputRef.current?.focus();
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px solid rgba(244,239,235,0.04)',
                                borderRadius: 6,
                                padding: '0.45rem 0.625rem',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                            >
                              <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-signal)' }}>
                                {s}
                              </span>
                              <button
                                onClick={(e) => clearSearch(e, s)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'rgba(244,239,235,0.3)',
                                  cursor: 'pointer',
                                  fontSize: 11,
                                  fontFamily: 'var(--font-mono)',
                                  padding: '2px 6px'
                                }}
                                onMouseEnter={e => e.target.style.color = '#e07070'}
                                onMouseLeave={e => e.target.style.color = 'rgba(244,239,235,0.3)'}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={clearAllSearches}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'rgba(207,163,101,0.5)',
                              cursor: 'pointer',
                              fontFamily: 'var(--font-mono)',
                              fontSize: 9,
                              letterSpacing: '0.04em',
                              textAlign: 'left',
                              padding: '4px 0',
                              textTransform: 'uppercase',
                              marginTop: 4
                            }}
                            onMouseEnter={e => e.target.style.color = 'var(--accent-gold)'}
                            onMouseLeave={e => e.target.style.color = 'rgba(207,163,101,0.5)'}
                          >
                            Clear All
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Right Column: Quick Actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(244,239,235,0.25)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                        Quick Actions
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {[
                          { id: 'drill', label: 'Go to Drill', detail: dueCount > 0 ? `${dueCount} due` : null, action: () => { onItemSelect?.({ type: 'drill' }); onClose(); } },
                          { id: 'archive', label: 'Browse Archive', action: () => { onItemSelect?.({ type: 'archive' }); onClose(); } },
                          { id: 'map', label: 'Open Map', action: () => { onItemSelect?.({ type: 'map' }); onClose(); } },
                          { id: 'note', label: 'Add a note', action: () => { setActiveView('create-note'); } },
                        ].map((act, idx) => (
                          <button
                            key={idx}
                            onClick={act.action}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: 'rgba(255,255,255,0.02)',
                              border: '1px solid rgba(244,239,235,0.04)',
                              borderRadius: 6,
                              padding: '0.45rem 0.625rem',
                              cursor: 'pointer',
                              textAlign: 'left',
                              width: '100%',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                          >
                            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-signal)', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ color: 'var(--accent-gold)', opacity: 0.6, fontSize: 10 }}>▶</span>
                              {act.label}
                            </span>
                            {act.detail && (
                              <span style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 9,
                                color: '#08070a',
                                background: 'var(--accent-gold)',
                                padding: '1px 5px',
                                borderRadius: 3,
                                fontWeight: 600
                              }}>
                                {act.detail}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Popular Tags list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid rgba(244,239,235,0.05)', paddingTop: '1rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'rgba(244,239,235,0.25)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                      Popular Tags
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {topTags.length === 0 ? (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(244,239,235,0.15)' }}>
                          No tags found.
                        </span>
                      ) : (
                        topTags.map((t, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setQuery(`#${t.tag}`);
                              inputRef.current?.focus();
                            }}
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 10,
                              color: 'var(--accent-gold)',
                              background: 'rgba(207,163,101,0.08)',
                              border: '1px solid rgba(207,163,101,0.2)',
                              borderRadius: 4,
                              padding: '3px 8px',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={e => e.target.style.background = 'rgba(207,163,101,0.18)'}
                            onMouseLeave={e => e.target.style.background = 'rgba(207,163,101,0.08)'}
                          >
                            #{t.tag} ({t.count})
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Action commands view */}
              {query.startsWith('/') && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {filteredActions.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                      No actions match "{query}"
                    </div>
                  ) : (
                    filteredActions.map((act, i) => {
                      const isSelected = i === selectedIdx;
                      return (
                        <button
                          key={act.cmd}
                          onClick={() => executeAction(act.cmd)}
                          style={{
                            width: '100%',
                            background: isSelected ? 'rgba(207,163,101,0.07)' : 'transparent',
                            border: 'none',
                            borderBottom: '1px solid rgba(244,239,235,0.05)',
                            borderLeft: isSelected ? '2.5px solid rgba(207,163,101,0.55)' : '2.5px solid transparent',
                            padding: '0.75rem 1.25rem',
                            paddingLeft: isSelected ? 'calc(1.25rem - 2.5px)' : '1.25rem',
                            textAlign: 'left',
                            cursor: 'pointer',
                            transition: 'all 0.12s ease',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.15rem',
                          }}
                        >
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent-gold)', fontWeight: 600 }}>
                            {act.cmd} <span style={{ color: 'var(--text-signal)', fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 13, marginLeft: 8 }}>— {act.name}</span>
                          </span>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-muted)' }}>
                            {act.desc}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}

              {/* Search results view */}
              {query.trim() && !query.startsWith('/') && (
                <>
                  {(!Array.isArray(results) || results.length === 0) && !loading && (
                    <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
                      No signals found for "{query}"
                    </div>
                  )}

                  {Array.isArray(filteredResults) && filteredResults.map((item, i) => (
                    <ResultCard
                      key={item.id || i}
                      item={item}
                      isSelected={i === selectedIdx}
                      query={query}
                      onClick={handleItemClick}
                    />
                  ))}
                </>
              )}
            </div>

            {/* Footer hints */}
            {totalItems > 0 && (
              <div style={{
                padding: '0.625rem 1.25rem',
                borderTop: '1px solid rgba(244,239,235,0.05)',
                display: 'flex',
                gap: '1.25rem',
                flexShrink: 0,
              }}>
                {[['↑↓', 'Navigate'], ['↵', 'Execute'], ['Esc', 'Close']].map(([key, label]) => (
                  <span key={key} style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: 'rgba(244,239,235,0.25)',
                    letterSpacing: '0.06em',
                  }}>
                    <span style={{ color: 'rgba(207,163,101,0.5)', marginRight: 4 }}>{key}</span>
                    {label}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          /* Create Note Form View */
          <div style={{ padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: '#F0EDE8', margin: 0, fontWeight: 600 }}>Create Note</h3>
              <button 
                onClick={() => setActiveView('search')}
                style={{ 
                  background: 'transparent', 
                  color: 'var(--accent-gold)', 
                  cursor: 'pointer', 
                  fontFamily: 'var(--font-mono)', 
                  fontSize: 10,
                  textTransform: 'uppercase',
                  padding: '2px 8px',
                  border: '1px solid rgba(207,163,101,0.2)',
                  borderRadius: 4
                }}
              >
                [BACK]
              </button>
            </div>
            <input
              placeholder="Note Title (Optional)"
              value={newNoteTitle}
              onChange={e => setNewNoteTitle(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(244,239,235,0.08)',
                borderRadius: 6,
                padding: '0.625rem 0.75rem',
                fontFamily: 'var(--font-body)',
                color: 'var(--text-signal)',
                fontSize: 14,
                outline: 'none',
                caretColor: 'var(--accent-gold)',
              }}
            />
            <textarea
              placeholder="Type your note content here..."
              value={newNoteText}
              onChange={e => setNewNoteText(e.target.value)}
              rows={6}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(244,239,235,0.08)',
                borderRadius: 6,
                padding: '0.625rem 0.75rem',
                fontFamily: 'var(--font-body)',
                color: 'var(--text-signal)',
                fontSize: 13,
                lineHeight: 1.6,
                resize: 'none',
                outline: 'none',
                caretColor: 'var(--accent-gold)',
              }}
            />
            <button
              onClick={handleSaveNote}
              disabled={savingNote || !newNoteText.trim()}
              style={{
                background: 'var(--accent-gold)',
                color: '#08070a',
                border: 'none',
                borderRadius: 6,
                padding: '0.625rem 1.25rem',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                fontWeight: 600,
                cursor: (savingNote || !newNoteText.trim()) ? 'not-allowed' : 'pointer',
                opacity: (savingNote || !newNoteText.trim()) ? 0.5 : 1,
                alignSelf: 'flex-end',
                transition: 'opacity 0.15s ease'
              }}
            >
              {savingNote ? 'SAVING...' : 'SAVE NOTE'}
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
