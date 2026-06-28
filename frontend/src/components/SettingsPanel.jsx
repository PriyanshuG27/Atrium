import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import axios from '../api/client';
import { 
  User, Gear, Bell, Database, Flame, 
  SpeakerHigh, SpeakerSlash, CalendarPlus, 
  Plus, Trash, SignOut, Globe, Info, Clock, CheckCircle
} from '@phosphor-icons/react';
import ConnectDriveCard from './ConnectDriveCard';
import AudioEngine from '../utils/AudioEngine';

export default function SettingsPanel({ isOpen, onClose }) {
  const { logout, user } = useAuth();
  const { addToast } = useToast();
  const panelRef = useRef(null);

  // Tabs: 'profile' | 'preferences' | 'reminders' | 'data'
  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(false);
  
  // Preferences State
  const [timezoneOffset, setTimezoneOffset] = useState(0);
  const [digestEnabled, setDigestEnabled] = useState(true);
  const [audioMuted, setAudioMuted] = useState(AudioEngine.isMuted());

  // Profile / Stats State
  const [stats, setStats] = useState({
    streak_count: 0,
    total_saves: 0,
    quizzes_answered: 0,
    drive_connected: false
  });

  // Reminders State
  const [reminders, setReminders] = useState([]);
  const [remindersLoading, setRemindersLoading] = useState(false);
  const [newReminderMsg, setNewReminderMsg] = useState('');
  const [newReminderTime, setNewReminderTime] = useState('');

  // Actions State
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showDeleteZone, setShowDeleteZone] = useState(false);

  // Fetch settings & stats
  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/me');
      const data = res.data;
      
      const dbOffset = data.timezone_offset ?? 0;
      const localOffset = -new Date().getTimezoneOffset() / 60;
      const hasBeenExplicitlySet = localStorage.getItem('timezone_explicitly_set') === 'true';

      setDigestEnabled(data.digest_enabled ?? true);
      setStats({
        streak_count: data.streak_count ?? 0,
        total_saves: data.total_saves ?? 0,
        quizzes_answered: data.quizzes_answered ?? 0,
        drive_connected: data.drive_connected ?? false
      });

      if (dbOffset !== localOffset && !hasBeenExplicitlySet) {
        try {
          await axios.patch('/api/me', { timezone_offset: localOffset });
          setTimezoneOffset(localOffset);
          addToast(`Timezone auto-detected and set to UTC${localOffset >= 0 ? '+' : ''}${localOffset}`, 'info');
        } catch (patchErr) {
          console.error('Failed to auto-set detected timezone:', patchErr);
          setTimezoneOffset(dbOffset);
        }
      } else {
        setTimezoneOffset(dbOffset);
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
      addToast('Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Fetch active scheduled reminders
  const fetchReminders = async () => {
    setRemindersLoading(true);
    try {
      const res = await axios.get('/api/reminders');
      setReminders(res.data || []);
    } catch (err) {
      console.error('Failed to fetch reminders:', err);
    } finally {
      setRemindersLoading(false);
    }
  };

  // Fetch initial data on open
  useEffect(() => {
    if (!isOpen) return;
    fetchSettings();
    fetchReminders();
  }, [isOpen]);

  // Sync mute state via window event
  useEffect(() => {
    const handleMuteToggle = (e) => {
      setAudioMuted(e.detail);
    };
    window.addEventListener('recall-mute-toggle', handleMuteToggle);
    return () => window.removeEventListener('recall-mute-toggle', handleMuteToggle);
  }, []);

  // Keyboard navigation & Escape key listener
  useEffect(() => {
    if (!isOpen || loading) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        // Prevent closing when clicking dropdowns/menus outside
        if (e.target.closest('.profile-menu-container') || e.target.closest('.dropdown-menu')) {
          return;
        }
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, loading]);

  if (!isOpen) return null;

  // Preferences Actions
  const handleTimezoneChange = async (e) => {
    const val = parseFloat(e.target.value);
    setTimezoneOffset(val);
    try {
      await axios.patch('/api/me', { timezone_offset: val });
      addToast('Timezone updated successfully', 'success');
    } catch (err) {
      console.error('Failed to update timezone:', err);
      addToast('Failed to update timezone', 'error');
    }
  };

  const handleDigestToggle = async () => {
    const nextDigest = !digestEnabled;
    setDigestEnabled(nextDigest);
    try {
      await axios.patch('/api/me', { digest_enabled: nextDigest });
      addToast(`Daily digest ${nextDigest ? 'enabled' : 'disabled'}`, 'success');
    } catch (err) {
      console.error('Failed to update digest settings:', err);
      addToast('Failed to update digest preference', 'error');
    }
  };

  // Reminders Actions
  const handleCreateReminder = async (e) => {
    e.preventDefault();
    if (!newReminderMsg.trim() || !newReminderTime) {
      addToast('Please provide a message and a valid time', 'error');
      return;
    }

    const remindAtUTC = new Date(newReminderTime).toISOString();

    try {
      await axios.post('/api/reminders', {
        message: newReminderMsg,
        remind_at: remindAtUTC
      });
      addToast('Reminder scheduled successfully', 'success');
      setNewReminderMsg('');
      setNewReminderTime('');
      fetchReminders();
    } catch (err) {
      console.error('Failed to schedule reminder:', err);
      addToast(err.response?.data?.detail || 'Failed to schedule reminder', 'error');
    }
  };

  const handleDeleteReminder = async (id) => {
    try {
      await axios.delete(`/api/reminders/${id}`);
      addToast('Reminder removed', 'success');
      fetchReminders();
    } catch (err) {
      console.error('Failed to delete reminder:', err);
      addToast('Failed to delete reminder', 'error');
    }
  };

  // Export / Deletion Actions
  const handleExportData = async () => {
    setExporting(true);
    try {
      const response = await axios.get('/api/export', { responseType: 'blob' });
      const filename = `recall-export-${new Date().toISOString().split('T')[0]}.json`;
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      addToast('Data export downloaded', 'success');
    } catch (err) {
      console.error('Failed to export data:', err);
      addToast('Failed to export data', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    if (!confirm('WARNING: This will permanently delete your account and all associated data. Are you absolutely sure?')) return;

    setDeleting(true);
    try {
      await axios.delete('/api/me');
      addToast('Account deleted successfully', 'success');
      logout();
    } catch (err) {
      console.error('Failed to delete account:', err);
      addToast('Failed to delete account', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Calculations for profile
  const initials = user?.first_name ? user.first_name[0].toUpperCase() : user?.username?.[0]?.toUpperCase() ?? '?';
  const nameLabel = user?.first_name || user?.username || 'Signal Observer';
  const roleLabel = stats.total_saves >= 100 ? 'Observatory Sage' : stats.total_saves >= 25 ? 'Signal Keeper' : 'Signal Novice';

  // Available timezone options
  const rawOffsets = [];
  for (let h = -12; h <= 14; h++) {
    rawOffsets.push(h);
    if (h >= -11 && h <= 13) rawOffsets.push(h + 0.5);
  }
  rawOffsets.push(5.75); // Nepal
  const uniqueOffsets = [...new Set(rawOffsets)].sort((a, b) => a - b);
  const timezones = uniqueOffsets.map(i => {
    const absI = Math.abs(i);
    const hours = Math.floor(absI);
    const mins = Math.round((absI - hours) * 60);
    const sign = i > 0 ? '+' : (i < 0 ? '-' : '');
    const minsStr = mins === 0 ? '' : `:${mins.toString().padStart(2, '0')}`;
    return { value: i, label: i === 0 ? 'UTC' : `UTC${sign}${hours}${minsStr}` };
  });

  return (
    <div 
      ref={panelRef}
      className="node-panel glass-card settings-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title-id"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0',
        padding: '0',
        background: 'rgba(9, 8, 14, 0.94)',
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
        borderLeft: '1px solid rgba(207, 163, 101, 0.12)',
        boxShadow: '-10px 0 50px rgba(0,0,0,0.65)',
        width: '380px'
      }}
    >
      {/* ── HEADER ── */}
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(207, 163, 101, 0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 id="settings-title-id" style={{ fontSize: '1rem', color: '#F0EDE8', margin: 0, fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Gear size={16} color="var(--accent-gold)" /> Observatory Control Settings
        </h3>
        <button 
          onClick={onClose} 
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(207,163,101,0.45)', fontSize: '20px', padding: '0 0.25rem' }}
        >
          ×
        </button>
      </div>

      {/* ── TAB BAR ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(207, 163, 101, 0.04)', padding: '0 0.5rem' }}>
        {[
          { id: 'profile', label: 'Profile', icon: <User size={13} /> },
          { id: 'preferences', label: 'Preferences', icon: <Gear size={13} /> },
          { id: 'reminders', label: 'Rituals', icon: <Clock size={13} /> },
          { id: 'data', label: 'Data', icon: <Database size={13} /> }
        ].map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { AudioEngine.playClick(); setActiveTab(tab.id); }}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
                padding: '0.85rem 0',
                border: 'none',
                background: 'none',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                letterSpacing: '0.05em',
                color: active ? 'var(--accent-gold)' : 'rgba(207, 163, 101, 0.4)',
                borderBottom: `2px solid ${active ? 'var(--accent-gold)' : 'transparent'}`,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── TAB CONTENT AREA ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '0.75rem', opacity: 0.5 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', border: '1.5px solid rgba(207,163,101,0.1)', borderTopColor: 'var(--accent-gold)', animation: 'spin 1s linear infinite' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(207,163,101,0.5)', letterSpacing: '0.1em' }}>Loading preferences...</span>
          </div>
        ) : (
          <>
            {/* ════ PROFILE TAB ════ */}
            {activeTab === 'profile' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Profile Header Card */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(207, 163, 101, 0.08)', borderRadius: '12px', padding: '1.25rem' }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(207,163,101,0.2) 0%, rgba(207,163,101,0.02) 100%)',
                    border: '1px solid rgba(207,163,101,0.35)',
                    display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, color: 'var(--accent-gold)',
                    boxShadow: '0 0 15px rgba(207,163,101,0.15)'
                  }}>
                    {initials}
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: '14px', fontWeight: 600, color: '#F0EDE8' }}>
                      {nameLabel}
                    </h4>
                    <p style={{ margin: '2px 0 0', fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(207, 163, 101, 0.45)', letterSpacing: '0.05em' }}>
                      {roleLabel}
                    </p>
                  </div>
                </div>

                {/* Flame Streak Display */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(207,163,101,0.04) 0%, rgba(255,255,255,0) 100%)',
                  border: '1px solid rgba(207, 163, 101, 0.1)',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(138, 133, 130, 0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Consecutive Ritual
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, color: '#F0EDE8', letterSpacing: '-0.04em' }}>
                        🔥 {stats.streak_count} days
                      </span>
                    </div>
                  </div>
                  <Flame 
                    size={36} 
                    weight="fill" 
                    color={stats.streak_count > 0 ? '#E8983C' : 'rgba(207, 163, 101, 0.18)'} 
                    style={{ filter: stats.streak_count > 0 ? 'drop-shadow(0 0 8px rgba(232,152,60,0.45))' : 'none' }}
                  />
                </div>

                {/* Grid of stats */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(207,163,101,0.05)', borderRadius: '10px', padding: '1rem' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(138, 133, 130, 0.5)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>
                      Archived Signals
                    </div>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, color: '#F0EDE8' }}>
                      {stats.total_saves}
                    </span>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(207,163,101,0.05)', borderRadius: '10px', padding: '1rem' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(138, 133, 130, 0.5)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>
                      Drills Completed
                    </div>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, color: '#F0EDE8' }}>
                      {stats.quizzes_answered}
                    </span>
                  </div>
                </div>

                {/* Info Card */}
                <div style={{ display: 'flex', gap: '0.75rem', background: 'rgba(207,163,101,0.03)', border: '1px solid rgba(207,163,101,0.08)', borderRadius: '10px', padding: '0.85rem' }}>
                  <Info size={16} color="var(--accent-gold)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'rgba(240,237,232,0.65)', lineHeight: 1.5 }}>
                    Your streak updates when you send new signals or execute drills. Keep checking your Telegram feed to build memory patterns.
                  </p>
                </div>
              </div>
            )}

            {/* ════ PREFERENCES TAB ════ */}
            {activeTab === 'preferences' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Timezone Preference */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '0.5rem' }}>
                    <Globe size={11} style={{ color: 'rgba(207,163,101,0.65)' }} />
                    <label htmlFor="timezone-select" style={{ display: 'block', fontSize: '11px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'rgba(207,163,101,0.65)', letterSpacing: '0.06em', margin: 0 }}>
                      Local Timezone Offset
                    </label>
                  </div>
                  <select
                    id="timezone-select"
                    value={timezoneOffset}
                    onChange={handleTimezoneChange}
                    style={{
                      width: '100%',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(207, 163, 101, 0.12)',
                      color: '#F0EDE8',
                      padding: '0.6rem 0.75rem',
                      borderRadius: '6px',
                      outline: 'none',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    {timezones.map((tz) => (
                      <option key={tz.value} value={tz.value} style={{ background: '#09080E' }}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Daily Digest Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(207, 163, 101, 0.06)', borderRadius: '10px', padding: '1rem' }}>
                  <div style={{ paddingRight: '1rem' }}>
                    <h5 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color: '#F0EDE8' }}>
                      Daily Telegram Digest
                    </h5>
                    <p style={{ margin: '3px 0 0', fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'rgba(138, 133, 130, 0.55)', lineHeight: 1.4 }}>
                      Receive a morning summary of your saved signals via the bot.
                    </p>
                  </div>
                  <button
                    onClick={handleDigestToggle}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      width: '38px', height: '22px', borderRadius: '11px',
                      background: digestEnabled ? 'var(--accent-gold)' : 'rgba(255,255,255,0.1)',
                      position: 'relative', display: 'flex', alignItems: 'center',
                      padding: '2px', transition: 'background-color 0.2s'
                    }}
                  >
                    <div style={{
                      width: '18px', height: '18px', borderRadius: '50%', background: '#09080E',
                      transform: `translateX(${digestEnabled ? '16px' : '0'})`, transition: 'transform 0.2s'
                    }} />
                  </button>
                </div>

                {/* Audio Feedback Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(207, 163, 101, 0.06)', borderRadius: '10px', padding: '1rem' }}>
                  <div style={{ paddingRight: '1rem' }}>
                    <h5 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color: '#F0EDE8' }}>
                      Ambient Audio Cues
                    </h5>
                    <p style={{ margin: '3px 0 0', fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'rgba(138, 133, 130, 0.55)', lineHeight: 1.4 }}>
                      Play Synthesizer UI click feedbacks and cluster minor chords.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const next = !audioMuted;
                      setAudioMuted(next);
                      AudioEngine.setMuted(next);
                    }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '8px', borderRadius: '6px',
                      background: audioMuted ? 'rgba(255,255,255,0.02)' : 'rgba(207,163,101,0.08)',
                      border: `1px solid ${audioMuted ? 'rgba(255,255,255,0.08)' : 'rgba(207,163,101,0.25)'}`,
                      color: audioMuted ? 'rgba(207,163,101,0.3)' : 'var(--accent-gold)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    {audioMuted ? <SpeakerSlash size={16} /> : <SpeakerHigh size={16} />}
                  </button>
                </div>
              </div>
            )}

            {/* ════ RITUALS / REMINDERS TAB ════ */}
            {activeTab === 'reminders' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Schedule Reminder Form */}
                <form onSubmit={handleCreateReminder} style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(207,163,101,0.08)', borderRadius: '12px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <h4 style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--accent-gold)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <CalendarPlus size={12} /> Schedule Telegram Cue
                  </h4>
                  <div>
                    <input
                      type="text"
                      placeholder="Reminder message text..."
                      value={newReminderMsg}
                      onChange={(e) => setNewReminderMsg(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(207, 163, 101, 0.1)',
                        color: '#F0EDE8',
                        padding: '0.5rem 0.65rem',
                        borderRadius: '6px',
                        outline: 'none',
                        fontSize: '12px'
                      }}
                    />
                  </div>
                  <div>
                    <input
                      type="datetime-local"
                      value={newReminderTime}
                      onChange={(e) => setNewReminderTime(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(207, 163, 101, 0.1)',
                        color: '#F0EDE8',
                        padding: '0.5rem 0.65rem',
                        borderRadius: '6px',
                        outline: 'none',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    style={{
                      width: '100%',
                      background: 'rgba(207, 163, 101, 0.18)',
                      border: '1px solid var(--accent-gold)',
                      color: 'var(--accent-gold)',
                      padding: '0.5rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem',
                      transition: 'all 0.2s'
                    }}
                  >
                    <Plus size={12} /> Schedule Reminder
                  </button>
                </form>

                {/* Scheduled Cues List */}
                <div>
                  <h4 style={{ margin: '0 0 0.75rem 0', fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(138, 133, 130, 0.5)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Scheduled Ritual Cues
                  </h4>
                  {remindersLoading ? (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'rgba(207,163,101,0.4)', textAlign: 'center', padding: '1rem 0' }}>
                      RETRIEVING CUES…
                    </div>
                  ) : reminders.length === 0 ? (
                    <div style={{ background: 'rgba(255,255,255,0.005)', border: '1px dashed rgba(207,163,101,0.06)', borderRadius: '8px', padding: '1.5rem', textAlign: 'center' }}>
                      <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'rgba(138, 133, 130, 0.4)', letterSpacing: '0.05em' }}>
                        No pending reminder cues.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {reminders.map(rem => {
                        const dateLabel = new Date(rem.remind_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                        return (
                          <div key={rem.id} style={{ display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(207,163,101,0.05)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
                            <div style={{ paddingRight: '0.75rem' }}>
                              <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: '12px', color: '#F0EDE8', lineHeight: 1.4 }}>
                                {rem.message}
                              </p>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(207,163,101,0.45)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '4px' }}>
                                <Clock size={10} /> {dateLabel}
                              </span>
                            </div>
                            <button
                              onClick={() => handleDeleteReminder(rem.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(239, 68, 68, 0.45)', padding: '0.25rem' }}
                            >
                              <Trash size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ════ DATA & INTEGRATION TAB ════ */}
            {activeTab === 'data' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Google Drive Connection Card (Observatory Backup) */}
                <div>
                  <h4 style={{ margin: '0 0 0.75rem 0', fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(138, 133, 130, 0.5)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Obsidi-Cloud Backup
                  </h4>
                  <ConnectDriveCard />
                </div>

                {/* GDPR Portability Section */}
                <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(207, 163, 101, 0.06)', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <h5 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: '13px', fontWeight: 600, color: '#F0EDE8' }}>
                    GDPR Data Portability
                  </h5>
                  <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'rgba(138, 133, 130, 0.55)', lineHeight: 1.45 }}>
                    Download all your saved signals, profile stats, daily streaks, reminders, and drill histories in a portable JSON format.
                  </p>
                  <button
                    onClick={handleExportData}
                    disabled={exporting}
                    style={{
                      width: '100%',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(207, 163, 101, 0.18)',
                      color: '#F0EDE8',
                      padding: '0.6rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      letterSpacing: '0.05em',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      transition: 'all 0.2s'
                    }}
                  >
                    {exporting ? 'Exporting...' : 'Export My Data (JSON)'}
                  </button>
                </div>

                {/* Danger Zone Collapsible */}
                <div>
                  <button
                    onClick={() => { AudioEngine.playClick(); setShowDeleteZone(!showDeleteZone); }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 1rem',
                      background: 'rgba(239, 68, 68, 0.02)',
                      border: '1px solid rgba(239, 68, 68, 0.12)',
                      borderRadius: '8px',
                      color: '#ef4444',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <span>Critical System Actions</span>
                    <span>{showDeleteZone ? '▲' : '▼'}</span>
                  </button>
                  {showDeleteZone && (
                    <div style={{ marginTop: '0.75rem', padding: '1rem', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.02)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <p style={{ margin: 0, fontSize: '11px', color: 'rgba(138,133,130,0.6)', lineHeight: 1.45 }}>
                        Permanently purge your account, signal log archives, scheduled quizzes, and Telegram link database. This action is irreversible.
                      </p>
                      
                      <label htmlFor="delete-confirm-input-revamped" style={{ display: 'block', fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'rgba(138, 133, 130, 0.5)', textTransform: 'uppercase', marginBottom: '2px' }}>
                        Type "DELETE" to confirm
                      </label>
                      <input
                        id="delete-confirm-input-revamped"
                        type="text"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder="DELETE"
                        style={{
                          width: '100%',
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid rgba(239, 68, 68, 0.15)',
                          color: '#fff',
                          padding: '0.45rem 0.6rem',
                          borderRadius: '6px',
                          outline: 'none',
                          fontSize: '12px'
                        }}
                      />

                      <button
                        onClick={handleDeleteAccount}
                        disabled={deleteConfirmText !== 'DELETE' || deleting}
                        style={{
                          width: '100%',
                          padding: '0.6rem',
                          backgroundColor: deleteConfirmText === 'DELETE' ? '#ef4444' : 'rgba(239, 68, 68, 0.05)',
                          color: deleteConfirmText === 'DELETE' ? '#fff' : 'rgba(255, 255, 255, 0.2)',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: deleteConfirmText === 'DELETE' ? 'pointer' : 'not-allowed',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                          transition: 'background-color 0.2s'
                        }}
                      >
                        {deleting ? 'Purging Account...' : 'Purge Account'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── FOOTER ── */}
      <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid rgba(207, 163, 101, 0.08)', display: 'flex', gap: '0.75rem' }}>
        <button
          onClick={logout}
          style={{
            flex: 1,
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(207, 163, 101, 0.15)',
            color: '#F0EDE8',
            padding: '0.65rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            letterSpacing: '0.05em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            transition: 'all 0.2s'
          }}
        >
          <SignOut size={13} /> Sign Out
        </button>
      </div>
    </div>
  );
}
