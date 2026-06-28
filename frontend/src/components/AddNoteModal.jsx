import React, { useState, useEffect, useRef } from 'react';
import { useToast } from './Toast';

/* ============================================================
   AddNoteModal — Modal for manually adding text notes.

   Features:
   - Cybernetic frosted-glass design
   - Autocomplete/suggestions for tags (fetched from /api/tags)
   - Dynamic tag chip input (Enter / Comma to add chips)
   - Save via POST /api/items
   ============================================================ */
export default function AddNoteModal({ onClose, onSuccess }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  const modalRef = useRef(null);

  // Fetch existing tags for autocomplete recommendations
  useEffect(() => {
    fetch('/api/tags')
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setAllTags(list.map(t => t.tag || t));
      })
      .catch(err => console.error(err));
  }, []);

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Handle adding a tag chip
  const addTagChip = (t) => {
    const cleaned = t.trim().toLowerCase().replace(/[^\w-]/g, '');
    if (cleaned && !tags.includes(cleaned)) {
      setTags([...tags, cleaned]);
    }
    setTagInput('');
  };

  const handleTagInputKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTagChip(tagInput);
    }
  };

  const removeTagChip = (idx) => {
    setTags(tags.filter((_, i) => i !== idx));
  };

  // Submit form
  const handleSave = async (e) => {
    e.preventDefault();
    if (!body.trim()) {
      addToast('Note content cannot be empty', 'warning');
      return;
    }

    // Add any remaining tag in the input field
    let finalTags = [...tags];
    if (tagInput.trim()) {
      const cleaned = tagInput.trim().toLowerCase().replace(/[^\w-]/g, '');
      if (cleaned && !finalTags.includes(cleaned)) {
        finalTags.push(cleaned);
      }
    }

    try {
      setSaving(true);
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || undefined,
          raw_text: body.trim(),
          source_type: 'text',
          tags: finalTags,
        }),
      });

      if (res.ok || res.status === 201) {
        const savedItem = await res.json();
        addToast('Signal added', 'success');
        onSuccess?.(savedItem);
        onClose();
      } else {
        addToast('Failed to add signal', 'error');
      }
    } catch (err) {
      console.error(err);
      addToast('Error saving note', 'error');
    } finally {
      setSaving(false);
    }
  };

  const tagRecommendations = tagInput.trim()
    ? allTags.filter(t => t.toLowerCase().includes(tagInput.toLowerCase()) && !tags.includes(t)).slice(0, 5)
    : [];

  return (
    <>
      {/* Backdrop */}
      <div 
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(8,7,10,0.75)',
          backdropFilter: 'blur(5px)',
          WebkitBackdropFilter: 'blur(5px)',
          zIndex: 1000,
        }}
      />

      {/* Modal Content */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(500px, 90vw)',
          background: 'rgba(17,15,20,0.98)',
          border: '1px solid rgba(207,163,101,0.2)',
          borderRadius: 12,
          padding: '1.75rem 2rem',
          zIndex: 1001,
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          boxShadow: '0 24px 60px rgba(0,0,0,0.8)',
          animation: 'modalReveal 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-signal)', margin: 0 }}>
            Add Manual Signal
          </h2>
          <button 
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(244,239,235,0.4)',
              cursor: 'pointer',
              fontSize: 16,
              fontFamily: 'var(--font-mono)'
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Title */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent-gold)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Title
            </label>
            <input
              placeholder="Signal Title (optional)"
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(244,239,235,0.06)',
                borderRadius: 6,
                padding: '0.625rem 0.75rem',
                fontFamily: 'var(--font-body)',
                color: 'var(--text-signal)',
                fontSize: 14,
                outline: 'none',
                caretColor: 'var(--accent-gold)'
              }}
            />
          </div>

          {/* Body content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent-gold)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Note Body (Markdown support)
            </label>
            <textarea
              placeholder="Type or paste your note details here..."
              value={body}
              onChange={e => setBody(e.target.value)}
              required
              rows={6}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(244,239,235,0.06)',
                borderRadius: 6,
                padding: '0.625rem 0.75rem',
                fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                color: 'var(--text-signal)',
                fontSize: 13,
                lineHeight: 1.6,
                resize: 'none',
                outline: 'none',
                caretColor: 'var(--accent-gold)'
              }}
            />
          </div>

          {/* Tags list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent-gold)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Tags
            </label>
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(244,239,235,0.06)',
              borderRadius: 6,
              padding: '0.4rem 0.5rem',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.35rem',
              alignItems: 'center'
            }}>
              {tags.map((tag, idx) => (
                <span key={idx} style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--accent-gold)',
                  background: 'rgba(207,163,101,0.08)',
                  border: '1px solid rgba(207,163,101,0.2)',
                  borderRadius: 4,
                  padding: '2px 6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}>
                  #{tag}
                  <button
                    type="button"
                    onClick={() => removeTagChip(idx)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--accent-gold)', cursor: 'pointer', padding: 0, fontSize: 8 }}
                  >
                    ✕
                  </button>
                </span>
              ))}
              <input
                placeholder={tags.length === 0 ? "Type tag and press Enter..." : ""}
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={handleTagInputKeyDown}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--text-signal)',
                  flex: 1,
                  minWidth: 100,
                  caretColor: 'var(--accent-gold)'
                }}
              />
            </div>

            {/* Recommendations autocomplete */}
            {tagRecommendations.length > 0 && (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.28rem',
                marginTop: '0.25rem',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: 4,
                padding: '4px 6px'
              }}>
                {tagRecommendations.map(rec => (
                  <button
                    key={rec}
                    type="button"
                    onClick={() => addTagChip(rec)}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      color: 'rgba(244,239,235,0.4)',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px 4px',
                      borderRadius: 3,
                      transition: 'all 0.12s ease'
                    }}
                    onMouseEnter={e => e.target.style.color = 'var(--accent-gold)'}
                    onMouseLeave={e => e.target.style.color = 'rgba(244,239,235,0.4)'}
                  >
                    +{rec}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Submit buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid rgba(244,239,235,0.1)',
                color: 'rgba(244,239,235,0.6)',
                borderRadius: 6,
                padding: '0.5rem 1rem',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                cursor: 'pointer'
              }}
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={saving || !body.trim()}
              style={{
                background: 'var(--accent-gold)',
                color: '#08070a',
                border: 'none',
                borderRadius: 6,
                padding: '0.5rem 1.25rem',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 600,
                cursor: (saving || !body.trim()) ? 'not-allowed' : 'pointer',
                opacity: (saving || !body.trim()) ? 0.5 : 1
              }}
            >
              {saving ? 'ADDING...' : 'ADD SIGNAL'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes modalReveal {
          from { opacity: 0; transform: translate(-50%, -46%) scale(0.97); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </>
  );
}
