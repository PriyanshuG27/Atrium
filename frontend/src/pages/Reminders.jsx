import React, { useState, useEffect } from 'react';
import { Trash, Bell } from '@phosphor-icons/react';
import { useToast } from '../components/Toast';

export default function Reminders() {
  const { addToast } = useToast();
  const [reminders, setReminders] = useState([]);
  const [filter, setFilter] = useState('pending'); // 'pending' | 'sent' | 'all'
  const [loading, setLoading] = useState(true);

  const fetchReminders = async () => {
    try {
      const res = await fetch('/api/reminders');
      if (res.ok) {
        const data = await res.json();
        setReminders(data);
      } else {
        addToast('Failed to load reminders', 'error');
      }
    } catch (err) {
      console.error('Error fetching reminders:', err);
      addToast('Network error, failed to load reminders', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReminders();
  }, []);

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this reminder?')) return;
    try {
      const res = await fetch(`/api/reminders/${id}`, {
        method: 'DELETE',
      });
      if (res.status === 204 || res.ok) {
        addToast('Reminder deleted successfully', 'success');
        setReminders(prev => prev.filter(r => r.id !== id));
      } else {
        addToast('Failed to delete reminder', 'error');
      }
    } catch (err) {
      console.error('Error deleting reminder:', err);
      addToast('Network error, failed to delete reminder', 'error');
    }
  };

  // Filter logic
  const filteredReminders = reminders.filter(r => {
    if (filter === 'pending') return r.status === 'pending';
    if (filter === 'sent') return r.status === 'sent';
    return true; // 'all'
  });

  const activeCount = reminders.filter(r => r.status === 'pending').length;

  return (
    <div className="feed-view-container" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '28px', fontWeight: 600, margin: 0, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Bell size={28} style={{ color: 'var(--color-primary, #6c63ff)' }} />
          Reminders
        </h1>
        <div style={{ fontSize: '14px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--color-text-muted, #8e8e9f)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass, rgba(255,255,255,0.08))', padding: '0.5rem 1rem', borderRadius: '8px' }}>
          Active reminders: <span style={{ color: activeCount >= 20 ? '#ff0844' : 'var(--color-secondary, #00d4aa)', fontWeight: 600 }}>{activeCount}</span> / 20
        </div>
      </div>

      {/* Filter TabsSwitcher */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(7, 7, 15, 0.4)', padding: '4px', borderRadius: '9999px', border: '1px solid var(--border-glass)', width: 'fit-content' }}>
        <button
          onClick={() => setFilter('pending')}
          style={{
            background: filter === 'pending' ? 'var(--color-primary, #6c63ff)' : 'transparent',
            border: 'none',
            color: filter === 'pending' ? '#fff' : 'var(--color-text-muted, #8e8e9f)',
            padding: '0.5rem 1.25rem',
            borderRadius: '9999px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          Pending
        </button>
        <button
          onClick={() => setFilter('sent')}
          style={{
            background: filter === 'sent' ? 'var(--color-primary, #6c63ff)' : 'transparent',
            border: 'none',
            color: filter === 'sent' ? '#fff' : 'var(--color-text-muted, #8e8e9f)',
            padding: '0.5rem 1.25rem',
            borderRadius: '9999px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          Sent
        </button>
        <button
          onClick={() => setFilter('all')}
          style={{
            background: filter === 'all' ? 'var(--color-primary, #6c63ff)' : 'transparent',
            border: 'none',
            color: filter === 'all' ? '#fff' : 'var(--color-text-muted, #8e8e9f)',
            padding: '0.5rem 1.25rem',
            borderRadius: '9999px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          All
        </button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--color-text-muted, #8e8e9f)', fontSize: '14px', fontFamily: 'Inter, sans-serif' }}>Loading reminders...</div>
      ) : filteredReminders.length === 0 ? (
        <div className="glass-card" style={{ padding: '2.5rem', borderRadius: '12px', textAlign: 'center', color: 'var(--color-text-muted, #8e8e9f)', fontSize: '14px' }}>
          No reminders found in this category.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredReminders.map(reminder => {
            const dateStr = new Date(reminder.remind_at).toLocaleString();
            const isSent = reminder.status === 'sent';
            return (
              <div
                key={reminder.id}
                className="glass-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1rem 1.5rem',
                  borderRadius: '12px',
                  border: '1px solid var(--border-glass, rgba(255,255,255,0.08))',
                  background: 'var(--surface-glass, rgba(10, 10, 20, 0.65))',
                  boxSizing: 'border-box',
                  gap: '1rem'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', overflow: 'hidden', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', color: 'var(--color-secondary, #00d4aa)', fontWeight: 500 }}>
                      {dateStr}
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        textTransform: 'uppercase',
                        padding: '0.15rem 0.4rem',
                        borderRadius: '4px',
                        fontWeight: 600,
                        letterSpacing: '0.05em',
                        background: isSent ? 'rgba(0, 212, 170, 0.15)' : 'rgba(108, 99, 255, 0.15)',
                        color: isSent ? 'var(--color-secondary, #00d4aa)' : 'var(--color-primary, #6c63ff)',
                        border: isSent ? '1px solid rgba(0, 212, 170, 0.2)' : '1px solid rgba(108, 99, 255, 0.2)'
                      }}
                    >
                      {reminder.status}
                    </span>
                  </div>
                  <span style={{ fontSize: '14px', color: '#fff', wordBreak: 'break-word', lineHeight: '1.4' }}>
                    {reminder.message}
                  </span>
                </div>
                <button
                  disabled={isSent}
                  onClick={() => handleDelete(reminder.id)}
                  className={`btn ${isSent ? 'btn-secondary' : 'btn-danger'}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem',
                    padding: '0.5rem 1rem',
                    minHeight: '38px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: isSent ? 'not-allowed' : 'pointer',
                    background: isSent ? 'rgba(255,255,255,0.02)' : '#ff0844',
                    color: isSent ? 'rgba(255,255,255,0.2)' : '#fff',
                    border: 'none',
                    opacity: isSent ? 0.4 : 1,
                    transition: 'all 0.2s ease',
                  }}
                  title={isSent ? 'Sent reminders are read-only' : 'Delete reminder'}
                >
                  <Trash size={16} />
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
