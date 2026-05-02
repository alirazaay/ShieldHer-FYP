import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Users, Search, Download, ChevronLeft, ChevronRight, Mail, Phone } from 'lucide-react';
import { subscribeToUsers, formatDate } from '../services/firestoreService';
import LoadingSpinner from '../components/LoadingSpinner';
import { showToast } from '../components/Toast';

function UsersPage() {
  const [users, setUsers] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    const unsub = subscribeToUsers((all) => { setUsers(all); setLoading(false); });
    return () => unsub();
  }, []);

  const categorize = (u) => {
    if (!u.location?.timestamp) return 'inactive';
    const last = u.location.timestamp?.toDate ? u.location.timestamp.toDate() : new Date(u.location.timestamp);
    return (Date.now() - last.getTime()) / 86400000 <= 7 ? 'active' : 'inactive';
  };

  const filtered = useMemo(() => {
    let r = users;
    if (activeTab === 'active') r = r.filter((u) => categorize(u) === 'active');
    else if (activeTab === 'inactive') r = r.filter((u) => categorize(u) === 'inactive');
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      r = r.filter((u) => (u.fullName || u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.phone || '').includes(q));
    }
    return r;
  }, [users, activeTab, searchQuery]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => setCurrentPage(1), [activeTab, searchQuery]);

  const activeCount = users.filter((u) => categorize(u) === 'active').length;
  const tabs = [
    { key: 'all', label: `All Users (${users.length})` },
    { key: 'active', label: `Active (${activeCount})` },
    { key: 'inactive', label: `Inactive (${users.length - activeCount})` },
  ];

  const handleExport = () => {
    const csv = 'Name,Email,Phone,Status,Registered\n' + filtered.map((u) =>
      `"${u.fullName || u.name || ''}","${u.email || ''}","${u.phone || ''}","${categorize(u)}","${u.createdAt ? formatDate(u.createdAt) : 'N/A'}"`
    ).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `shieldher-users-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
    showToast(`Exported ${filtered.length} users`, 'success');
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (loading) return <LoadingSpinner message="Loading users..." />;

  return (
    <>
      <div className="page-header">
        <h1 className="page-title"><Users size={28} /> Users Database</h1>
        <p className="page-subtitle">View and manage all registered ShieldHer users</p>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input className="input" style={{ paddingLeft: 42, marginBottom: 0 }} placeholder="Search name, email, phone..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <button className="button button-primary" onClick={handleExport}><Download size={16} /> Export</button>
      </div>

      <div className="filter-bar">
        {tabs.map((t) => (
          <button key={t.key} className={`filter-pill ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>{t.label}</button>
        ))}
      </div>

      <div className="table-container">
        <div className="table-header-row" style={{ gridTemplateColumns: '2fr 2fr 1.2fr 0.8fr 1fr' }}>
          <span>User</span><span>Contact</span><span>Role</span><span>Status</span><span>Registered</span>
        </div>
        {paginated.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>No users found</div>
        ) : paginated.map((u, i) => {
          const name = u.fullName || u.name || 'Unknown';
          const status = categorize(u);
          return (
            <motion.div key={u.id} className="table-row" style={{ gridTemplateColumns: '2fr 2fr 1.2fr 0.8fr 1fr' }}
              initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                  {getInitials(name)}
                </div>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{name}</span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={12} /> {u.email || 'N/A'}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={12} /> {u.phone || 'N/A'}</span>
              </span>
              <span style={{ fontSize: 13 }}>{u.role || 'User'}</span>
              <span>{status === 'active' ? <span className="badge badge-success">Active</span> : <span className="badge badge-neutral">Inactive</span>}</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>{u.createdAt ? formatDate(u.createdAt) : 'N/A'}</span>
            </motion.div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, fontSize: 13, color: 'var(--color-text-muted)' }}>
          <span>Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="button button-ghost" style={{ padding: '6px 10px' }} disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}><ChevronLeft size={16} /></button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
              <button key={p} className={`button ${currentPage === p ? 'button-primary' : 'button-ghost'}`} style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setCurrentPage(p)}>{p}</button>
            ))}
            <button className="button button-ghost" style={{ padding: '6px 10px' }} disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}><ChevronRight size={16} /></button>
          </div>
        </div>
      )}
    </>
  );
}

export default UsersPage;
