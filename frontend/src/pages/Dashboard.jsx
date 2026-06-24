import React from 'react';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user } = useAuth();
  
  // Floating node settings for animation
  const nodes = [
    { top: '20%', left: '30%', dx: '25px', dy: '15px', delay: '0s' },
    { top: '40%', left: '70%', dx: '-20px', dy: '35px', delay: '1s' },
    { top: '65%', left: '20%', dx: '30px', dy: '-25px', delay: '2s' },
    { top: '75%', left: '50%', dx: '-15px', dy: '-30px', delay: '1.5s' },
    { top: '15%', left: '80%', dx: '10px', dy: '20px', delay: '0.5s' },
  ];

  return (
    <div className="dashboard-container">
      <div className="dashboard-hero glass-panel">
        <h2 className="gradient-text">Welcome to Recall</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          Authenticated as Telegram chat_id: <strong>{user?.chat_id}</strong>
        </p>
        
        <div className="constellation-wrapper">
          {nodes.map((node, i) => (
            <div
              key={i}
              className="constellation-node"
              style={{
                top: node.top,
                left: node.left,
                '--dx': node.dx,
                '--dy': node.dy,
                animationDelay: node.delay,
              }}
            />
          ))}
          <p style={{ color: 'var(--text-secondary)', zIndex: 10, fontSize: '0.95rem' }}>
            Your knowledge constellation is ready. Forward links, voice notes, or PDFs in Telegram to build your mind map.
          </p>
        </div>
      </div>
    </div>
  );
}
