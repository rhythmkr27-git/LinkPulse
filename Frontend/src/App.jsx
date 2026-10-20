import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './Components/login.jsx';
import Register from './Components/register.jsx';
import Dashboard from './Components/Dashboard.jsx';
import './App.css';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/$/, '');

function ProtectedDashboard() {
  const [status, setStatus] = useState('checking');
  useEffect(() => {
    let active = true;
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then((res) => { if (!res.ok) throw new Error('not signed in'); return res.json(); })
      .then((data) => { if (active) { localStorage.setItem('linkpulse-user', JSON.stringify(data.user)); setStatus('ready'); } })
      .catch(() => { if (active) setStatus('signed-out'); });
    return () => { active = false; };
  }, []);
  if (status === 'checking') return <div className="loading-screen">Loading LinkPulse…</div>;
  if (status === 'signed-out') return <Navigate to="/login" replace />;
  return <Dashboard />;
}

export default function App() {
  return <Routes>
    <Route path="/" element={<Navigate to="/dashboard" replace />} />
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/dashboard" element={<ProtectedDashboard />} />
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>;
}
