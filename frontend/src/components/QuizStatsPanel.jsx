import React, { useState, useEffect, useRef } from 'react';
import { useToast } from './Toast';
import { X, Trophy, ChartBar, Hourglass, Percent, Compass } from '@phosphor-icons/react';

/**
 * @deprecated This component is currently unused in the application but kept for test coverage.
 */
export default function QuizStatsPanel({ isOpen, onClose }) {
  const { addToast } = useToast();
  const panelRef = useRef(null);
  const containerRef = useRef(null);
  const canvasRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    due_today: 0,
    answered_all_time: 0,
    avg_ease_factor: 2.5,
    mastered: 0,
    mastered_definition: "ease_factor >= 2.5 AND interval_days >= 7",
    last_7_days: []
  });

  // Fetch stats when panel opens
  useEffect(() => {
    if (!isOpen) return;

    async function fetchStats() {
      setLoading(true);
      try {
        const res = await fetch('/api/quizzes/stats');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        } else {
          addToast('Failed to load quiz stats', 'error');
        }
      } catch (err) {
        console.error('Failed to fetch quiz stats:', err);
        addToast('Failed to load quiz stats', 'error');
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [isOpen, addToast]);

  // Listen to custom event when quiz is answered so we can refresh stats dynamically
  useEffect(() => {
    const handleQuizAnswered = async () => {
      if (!isOpen) return;
      try {
        const res = await fetch('/api/quizzes/stats');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.error('Failed to update quiz stats:', err);
      }
    };

    window.addEventListener('quiz-answered', handleQuizAnswered);
    return () => {
      window.removeEventListener('quiz-answered', handleQuizAnswered);
    };
  }, [isOpen]);

  // Focus trap and Escape key listener (same as SettingsPanel)
  useEffect(() => {
    if (!isOpen || loading) return;

    const focusable = panelRef.current?.querySelectorAll('button, select, input, [tabindex="0"]');
    if (focusable && focusable.length > 0) {
      focusable[0].focus();
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab') {
        const elements = panelRef.current?.querySelectorAll('button, select, input, [tabindex="0"]');
        if (!elements || elements.length === 0) return;
        const first = elements[0];
        const last = elements[elements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        // Exclude clicks on stats card triggers
        if (e.target.closest('.quiz-stats-card') || e.target.closest('.quiz-badge-btn')) {
          return;
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
  }, [isOpen, onClose, loading]);

  // Render Canvas Chart
  useEffect(() => {
    if (!isOpen || loading || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const container = containerRef.current;

    // Measure container width
    const rect = container.getBoundingClientRect();
    const width = rect.width || 360;
    const height = 200; // Fixed canvas rendering height

    // Setup DPR scaling for crisp graphics
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.scale(dpr, dpr);

    // Clear Canvas
    ctx.clearRect(0, 0, width, height);

    const data = stats.last_7_days || [];
    const totalReviews = data.reduce((acc, curr) => acc + curr.count, 0);

    if (totalReviews === 0) {
      // Empty State render
      ctx.fillStyle = 'var(--color-text-muted, #8e8e9f)';
      ctx.font = '500 13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText("No quiz activity in the last 7 days", width / 2, height / 2 - 10);
      ctx.font = '400 11px Inter, sans-serif';
      ctx.fillText("Answer quizzes to track your progress!", width / 2, height / 2 + 10);
      return;
    }

    // Chart layouts
    const leftMargin = 30;
    const rightMargin = 15;
    const topMargin = 25;
    const bottomMargin = 25;

    const chartWidth = width - leftMargin - rightMargin;
    const chartHeight = height - topMargin - bottomMargin;

    const maxCount = Math.max(...data.map(d => d.count), 0);
    const peak = maxCount > 5 ? maxCount : 5;

    // Draw Y-Axis Gridlines & Labels
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'var(--color-text-muted, #8e8e9f)';
    ctx.font = '400 10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= 3; i++) {
      const val = Math.round((peak * i) / 3);
      const y = topMargin + chartHeight * (1 - i / 3);

      ctx.beginPath();
      ctx.moveTo(leftMargin, y);
      ctx.lineTo(width - rightMargin, y);
      ctx.stroke();

      ctx.fillText(val.toString(), leftMargin - 6, y);
    }

    // Draw X-Axis & Bars
    const N = data.length;
    const barSpacing = chartWidth / N;
    const barWidth = Math.min(28, barSpacing * 0.55);

    const rootStyle = getComputedStyle(document.documentElement);
    const primaryColor = rootStyle.getPropertyValue('--color-primary').trim() || '#6C63FF';

    data.forEach((item, idx) => {
      const x = leftMargin + idx * barSpacing + (barSpacing - barWidth) / 2;
      const count = item.count;
      const barHeight = (count / peak) * chartHeight;
      const y = topMargin + chartHeight - barHeight;

      // Draw Day label below
      ctx.fillStyle = 'var(--color-text-muted, #8e8e9f)';
      ctx.font = '500 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(item.day, x + barWidth / 2, topMargin + chartHeight + 6);

      if (count > 0) {
        // Draw vertical bar with gradient
        const barGrad = ctx.createLinearGradient(x, y, x, y + barHeight);
        barGrad.addColorStop(0, primaryColor + 'cc'); // 80% opacity
        barGrad.addColorStop(1, primaryColor + '1a'); // 10% opacity

        ctx.fillStyle = barGrad;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
        } else {
          ctx.rect(x, y, barWidth, barHeight);
        }
        ctx.fill();

        // Stroke
        ctx.strokeStyle = primaryColor + 'dd';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Glass reflections/sheen
        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
        } else {
          ctx.rect(x, y, barWidth, barHeight);
        }
        ctx.clip();

        const sheenGrad = ctx.createLinearGradient(x, y, x + barWidth, y);
        sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
        sheenGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.02)');
        sheenGrad.addColorStop(0.51, 'rgba(255, 255, 255, 0)');
        sheenGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = sheenGrad;
        ctx.fill();
        ctx.restore();

        // Count above the bar
        ctx.fillStyle = 'var(--color-text, #ffffff)';
        ctx.font = '600 10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(count.toString(), x + barWidth / 2, y - 3);
      }
    });

  }, [stats, isOpen, loading]);

  if (!isOpen) return null;

  return (
    <div 
      ref={panelRef}
      className="node-panel glass-card glass-glow-top"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quiz-stats-title"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        overflowY: 'auto'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.75rem' }}>
        <h2 id="quiz-stats-title" style={{ margin: 0, fontSize: '1.2rem', fontFamily: 'var(--font-heading)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ChartBar size={20} color="var(--color-primary)" />
          Quiz Performance
        </h2>
        <button 
          onClick={onClose} 
          className="close-btn"
          aria-label="Close statistics panel"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border-glass)',
            borderRadius: '50%',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '32px',
            width: '32px',
            color: 'var(--color-text)'
          }}
        >
          <X size={16} />
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Analyzing performance history...</p>
        </div>
      ) : (
        <>
          {/* Chart Container */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>Activity (Last 7 Days)</h3>
            <div 
              ref={containerRef}
              style={{ 
                background: 'rgba(255, 255, 255, 0.01)', 
                border: '1px solid var(--border-glass)', 
                borderRadius: '8px', 
                padding: '0.75rem',
                minHeight: '210px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <canvas ref={canvasRef} />
            </div>
          </div>

          {/* Core Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-glass)', padding: '0.75rem', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                <Hourglass size={14} color="var(--color-secondary)" />
                <span>Due Today</span>
              </div>
              <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text)' }}>{stats.due_today}</span>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-glass)', padding: '0.75rem', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                <Trophy size={14} color="#f9d423" />
                <span>Mastered</span>
              </div>
              <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text)' }}>{stats.mastered}</span>
            </div>
          </div>

          {/* Performance Summary Cards */}
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-glass)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>Performance Summary</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Total Answered Reviews</span>
                <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{stats.answered_all_time}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Average Ease Factor</span>
                <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{stats.avg_ease_factor.toFixed(2)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Total Quizzes Created</span>
                <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>{stats.total}</span>
              </div>

              <div style={{ borderTop: '1px solid var(--border-glass)', marginTop: '0.4rem', paddingTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>Definition of Mastery:</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-primary)', fontFamily: 'var(--font-mono)', background: 'rgba(255,255,255,0.01)', padding: '0.35rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.02)' }}>
                  {stats.mastered_definition}
                </div>
              </div>

            </div>
          </div>
        </>
      )}
    </div>
  );
}
