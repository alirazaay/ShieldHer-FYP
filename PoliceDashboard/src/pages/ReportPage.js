import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Download, Calendar, TrendingUp, CheckCircle, AlertTriangle, Users as UsersIcon } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { subscribeToAlertStats, subscribeToUsers, getAlertsInRange, formatDate } from '../services/firestoreService';
import LoadingSpinner from '../components/LoadingSpinner';
import { showToast } from '../components/Toast';

const COLORS = ['#4318FF', '#dc2626', '#d97706', '#16a34a'];

const cardV = {
  hidden: { opacity: 0, y: 20, scale: 0.96 },
  visible: (i) => ({ opacity: 1, y: 0, scale: 1, transition: { delay: i * 0.08, duration: 0.4 } }),
};

// Mock chart data (will be replaced by real data when available)
const areaData = [
  { name: 'Mon', value: 12 }, { name: 'Tue', value: 18 }, { name: 'Wed', value: 8 },
  { name: 'Thu', value: 22 }, { name: 'Fri', value: 15 }, { name: 'Sat', value: 9 }, { name: 'Sun', value: 14 },
];
const barData = [
  { name: 'Critical', value: 5, fill: '#dc2626' }, { name: 'High', value: 12, fill: '#d97706' },
  { name: 'Medium', value: 18, fill: '#4318FF' }, { name: 'Low', value: 8, fill: '#16a34a' },
];

function ReportPage() {
  const [alertStats, setAlertStats] = useState(null);
  const [userCount, setUserCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split('T')[0]; });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const u1 = subscribeToAlertStats((s) => { setAlertStats(s); setLoading(false); });
    const u2 = subscribeToUsers((u) => setUserCount(u.length));
    return () => { u1(); u2(); };
  }, []);

  const stats = [
    { icon: AlertTriangle, count: alertStats?.total || 0, label: 'Total Incidents', color: '#dc2626', bg: '#fef2f2' },
    { icon: CheckCircle, count: alertStats?.resolved || 0, label: 'Cases Resolved', color: '#16a34a', bg: '#f0fdf4' },
    { icon: TrendingUp, count: alertStats ? alertStats.active + alertStats.escalated + alertStats.responded : 0, label: 'Active Cases', color: '#d97706', bg: '#fffbeb' },
    { icon: UsersIcon, count: userCount, label: 'Active Users', color: '#4318FF', bg: '#ece8ff' },
  ];

  const pieData = [
    { name: 'Resolved', value: alertStats?.resolved || 1 },
    { name: 'Active', value: (alertStats?.active || 0) + (alertStats?.escalated || 0) },
    { name: 'Responded', value: alertStats?.responded || 0 },
  ];

  const handleGenerate = async (type) => {
    setGenerating(true);
    try {
      const s = new Date(startDate); const e = new Date(endDate); e.setHours(23, 59, 59, 999);
      const alerts = await getAlertsInRange(s, e);
      const csv = 'Alert ID,Status,Type,Lat,Lng,Created\n' + alerts.map((a) =>
        `"${a.id}","${a.status}","${a.type || a.alertType || 'N/A'}","${a.latitude || ''}","${a.longitude || ''}","${a.createdAt ? formatDate(a.createdAt) : 'N/A'}"`
      ).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `shieldher-${type.toLowerCase().replace(/\s/g, '-')}-${startDate}-to-${endDate}.csv`;
      a.click(); URL.revokeObjectURL(url);
      showToast(`${type} report (${alerts.length} records)`, 'success');
    } catch (err) { showToast('Failed: ' + err.message, 'error'); }
    finally { setGenerating(false); }
  };

  if (loading) return <LoadingSpinner message="Loading reports..." />;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title"><BarChart3 size={28} /> Reports & Analytics</h1>
        <p className="page-subtitle">View statistics and generate reports</p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: '8px 14px', border: '1px solid var(--color-border)' }}>
            <Calendar size={16} style={{ color: 'var(--color-text-muted)' }} />
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              style={{ border: 'none', background: 'transparent', fontSize: 13, fontFamily: 'var(--font-sans)', color: 'var(--color-text)' }} />
          </div>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>to</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: '8px 14px', border: '1px solid var(--color-border)' }}>
            <Calendar size={16} style={{ color: 'var(--color-text-muted)' }} />
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              style={{ border: 'none', background: 'transparent', fontSize: 13, fontFamily: 'var(--font-sans)', color: 'var(--color-text)' }} />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div key={i} className="stat-card" custom={i} variants={cardV} initial="hidden" animate="visible">
              <div className="stat-card-icon" style={{ background: s.bg, color: s.color }}><Icon size={24} /></div>
              <div className="stat-count">{s.count}</div>
              <div className="stat-title">{s.label}</div>
            </motion.div>
          );
        })}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 28 }}>
        <motion.div className="card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Response Trends</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={areaData}><CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
              <Tooltip /><Area type="monotone" dataKey="value" stroke="#4318FF" fill="#ece8ff" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
        <motion.div className="card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Alerts by Priority</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData}><CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
              <Tooltip /><Bar dataKey="value" radius={[6, 6, 0, 0]}>{barData.map((e, i) => <Cell key={i} fill={e.fill} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
        <motion.div className="card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Resolution Rate</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
              {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie><Tooltip /></PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8 }}>
            {pieData.map((d, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-secondary)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i] }} />{d.name}
              </span>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Generate Reports */}
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Generate Reports</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {['Monthly Summary', 'Emergency Response', 'Unit Performance', 'User Activity'].map((title, i) => (
          <motion.div key={title} className="card" custom={i} variants={cardV} initial="hidden" animate="visible">
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{title}</h3>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16 }}>Generate and download detailed report</p>
            <button className="button button-primary" style={{ width: '100%' }} onClick={() => handleGenerate(title)} disabled={generating}>
              <Download size={14} /> {generating ? 'Generating...' : 'Download CSV'}
            </button>
          </motion.div>
        ))}
      </div>
    </>
  );
}

export default ReportPage;
