import React from 'react';
import { Flame } from '@phosphor-icons/react';

export default function StreakBadge({ streakCount, onClick }) {
  // Check if running in Telegram Web App (TWA)
  const isTwa = !!window.Telegram?.WebApp?.initData;
  // Check if on a mobile platform (User Agent or Telegram WebApp platform property)
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                   window.Telegram?.WebApp?.platform === 'ios' || 
                   window.Telegram?.WebApp?.platform === 'android';
  
  const useFlameIcon = isTwa && isMobile;

  return (
    <button 
      className="quiz-badge-btn streak-badge-btn" 
      onClick={onClick}
      aria-label={`Saves streak: ${streakCount} days`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
        border: '1px solid var(--border-glass)',
        background: 'rgba(255, 255, 255, 0.04)',
        borderRadius: '6px',
        padding: '0.25rem 0.65rem',
        height: '32px',
        color: 'var(--color-text)',
        fontFamily: 'var(--font-sans)',
        fontSize: '0.8125rem',
        fontWeight: '500',
        cursor: 'pointer',
        transition: 'all 0.2s var(--transition-cinema, ease)',
      }}
    >
      {useFlameIcon ? (
        <Flame size={16} weight="fill" color="#ff7a00" data-testid="flame-icon" />
      ) : (
        <span role="img" aria-label="streak-emoji">🔥</span>
      )}
      <span style={{ fontWeight: 600 }}>{streakCount}</span>
    </button>
  );
}
