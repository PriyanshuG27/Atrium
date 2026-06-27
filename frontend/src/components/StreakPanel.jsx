import React, { useEffect, useRef } from 'react';
import { X, Flame } from '@phosphor-icons/react';

// Helper to convert date to relative time string
function getRelativeTimeString(dateStr) {
  if (!dateStr) return 'never';
  
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'never';
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  return `${diffDays}d ago`;
}

export default function StreakPanel({ isOpen, onClose, streakCount, lastActivityDate, last7DaysActivity = [] }) {
  const panelRef = useRef(null);

  // Close panel on clicking outside or ESC
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        if (e.target.closest('.streak-badge-btn')) {
          return; // Don't close if clicking the badge trigger
        }
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Generate names of the last 7 days ending with Today
  const getDayNames = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      result.push({
        name: days[d.getDay()],
        isToday: i === 0
      });
    }
    return result;
  };

  const dayList = getDayNames();
  // Safe fallback if last7DaysActivity is incomplete or empty
  const activityList = Array.isArray(last7DaysActivity) && last7DaysActivity.length === 7 
    ? last7DaysActivity 
    : [false, false, false, false, false, false, false];

  return (
    <div 
      ref={panelRef}
      className="glass-card streak-panel-overlay"
      role="dialog"
      aria-label="Streak Details"
      style={{
        position: 'absolute',
        top: '48px',
        right: '0',
        width: '360px',
        padding: '1.25rem',
        borderRadius: '12px',
        zIndex: 200,
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.45)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        animation: 'fadeInUp 0.25s var(--transition-cinema, ease)'
      }}
    >
      {/* CSS pulse animation injection */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulseRing {
          0% {
            box-shadow: 0 0 0 0 rgba(0, 212, 170, 0.5);
          }
          70% {
            box-shadow: 0 0 0 6px rgba(0, 212, 170, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(0, 212, 170, 0);
          }
        }
        .pulse-ring-active {
          animation: pulseRing 1.8s infinite;
          border: 2px solid var(--color-secondary, #00D4AA) !important;
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Activity Streak</span>
        <button 
          onClick={onClose}
          aria-label="Close streak panel"
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--color-text-muted)',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Hero Stats */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.5rem', fontFamily: 'var(--font-heading)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Flame size={28} weight="fill" color="#ff7a00" />
          {streakCount} Day Streak!
        </h3>
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          Last saved: {getRelativeTimeString(lastActivityDate)}
        </p>
      </div>

      {/* Streak Calendar Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Last 7 Days</span>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '0.5rem',
          textAlign: 'center',
          alignItems: 'center'
        }}>
          {dayList.map((day, idx) => {
            const hasActivity = activityList[idx];
            return (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                {/* Day Name label */}
                <span style={{ 
                  fontSize: '0.6875rem', 
                  fontWeight: day.isToday ? '600' : '400',
                  color: day.isToday ? 'var(--color-text)' : 'var(--color-text-muted)' 
                }}>
                  {day.name}
                </span>

                {/* Day Circle indicator */}
                <div 
                  data-testid={`streak-day-${idx}`}
                  className={day.isToday ? 'pulse-ring-active' : ''}
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: hasActivity ? 'var(--color-accent, var(--color-secondary))' : 'transparent',
                    border: hasActivity 
                      ? 'none' 
                      : '1px solid var(--text-tertiary, var(--color-text-muted))',
                    transition: 'all 0.2s ease',
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
