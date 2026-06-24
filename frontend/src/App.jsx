import React from 'react';
import { useAuth } from './context/AuthContext';
import Header from './components/Header';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <h2 className="gradient-text">Recall</h2>
        <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)' }}>Verifying secure session...</p>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <>
      <Header />
      <Dashboard />
    </>
  );
}

export default App;
