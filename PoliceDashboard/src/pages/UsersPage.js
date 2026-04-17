import React, { useState, useEffect, useMemo } from 'react';
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
    const unsubscribe = subscribeToUsers((allUsers) => {
      setUsers(allUsers);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Determine active/inactive based on last location timestamp (within 7 days = active)
  const categorizeUser = (user) => {
    if (!user.location?.timestamp) return 'inactive';
    const lastActive = user.location.timestamp?.toDate
      ? user.location.timestamp.toDate()
      : new Date(user.location.timestamp);
    const daysSince = (Date.now() - lastActive.getTime()) / 86400000;
    return daysSince <= 7 ? 'active' : 'inactive';
  };

  const filteredUsers = useMemo(() => {
    let result = users;

    // Tab filter
    if (activeTab === 'active') {
      result = result.filter((u) => categorizeUser(u) === 'active');
    } else if (activeTab === 'inactive') {
      result = result.filter((u) => categorizeUser(u) === 'inactive');
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((u) => {
        const name = (u.fullName || u.name || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const phone = u.phone || '';
        return name.includes(q) || email.includes(q) || phone.includes(q);
      });
    }

    return result;
  }, [users, activeTab, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / pageSize);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Reset to page 1 on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery]);

  const activeCount = users.filter((u) => categorizeUser(u) === 'active').length;
  const inactiveCount = users.length - activeCount;

  const tabs = [
    { key: 'all', label: `All Users (${users.length})` },
    { key: 'active', label: `Active (${activeCount})` },
    { key: 'inactive', label: `InActive (${inactiveCount})` },
  ];

  // Export to CSV
  const handleExport = () => {
    const csvHeaders = 'Name,Email,Phone,Status,Registered\n';
    const csvRows = filteredUsers
      .map((u) => {
        const name = u.fullName || u.name || '';
        const email = u.email || '';
        const phone = u.phone || '';
        const status = categorizeUser(u);
        const registered = u.createdAt ? formatDate(u.createdAt) : 'N/A';
        return `"${name}","${email}","${phone}","${status}","${registered}"`;
      })
      .join('\n');
    const blob = new Blob([csvHeaders + csvRows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shieldher-users-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${filteredUsers.length} users to CSV`, 'success');
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return <LoadingSpinner message="Loading users..." />;
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">👥 Users Database</h1>
        <p className="page-subtitle">View and manage all registered ShieldHer users</p>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Search by name, email, phone..."
          className="input"
          style={{ flex: 1, marginBottom: 0 }}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button className="button button-primary" onClick={handleExport}>
          📥 Export Data
        </button>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '10px 20px',
              borderRadius: '20px',
              border: 'none',
              background: activeTab === tab.key ? '#4318ff' : '#fff',
              color: activeTab === tab.key ? '#fff' : '#666',
              cursor: 'pointer',
              fontWeight: '500',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            paddingBottom: '15px',
            borderBottom: '1px solid #eee',
            marginBottom: '20px',
          }}
        >
          <h3 style={{ fontWeight: 'bold' }}>Registered Users</h3>
          <span style={{ color: '#666' }}>Total: {filteredUsers.length} users</span>
        </div>

        {paginatedUsers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#666' }}>No users found</div>
        ) : (
          paginatedUsers.map((u, index) => {
            const name = u.fullName || u.name || 'Unknown';
            const status = categorizeUser(u);
            return (
              <div
                key={u.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '15px 0',
                  borderBottom: index < paginatedUsers.length - 1 ? '1px solid #f5f5f5' : 'none',
                  gap: '20px',
                }}
              >
                <div
                  style={{
                    width: '50px',
                    height: '50px',
                    borderRadius: '50%',
                    background: '#4318ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: 'bold',
                  }}
                >
                  {getInitials(name)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '600', marginBottom: '3px' }}>{name}</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    Registered: {u.createdAt ? formatDate(u.createdAt) : 'N/A'}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', marginBottom: '4px' }}>📱 {u.phone || 'N/A'}</div>
                  <div style={{ fontSize: '12px' }}>✉️ {u.email || 'N/A'}</div>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span
                    className="badge"
                    style={{
                      background: status === 'active' ? '#e5f9f4' : '#f5f5f5',
                      color: status === 'active' ? '#00b894' : '#666',
                    }}
                  >
                    {status === 'active' ? 'Active' : 'InActive'}
                  </span>
                </div>
              </div>
            );
          })
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '20px',
              marginTop: '20px',
              borderTop: '1px solid #eee',
            }}
          >
            <span style={{ fontSize: '13px', color: '#666' }}>
              Showing {(currentPage - 1) * pageSize + 1}-
              {Math.min(currentPage * pageSize, filteredUsers.length)} of {filteredUsers.length}{' '}
              users
            </span>
            <div style={{ display: 'flex', gap: '5px' }}>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: '6px',
                  background: '#f5f5f5',
                  cursor: currentPage === 1 ? 'default' : 'pointer',
                  opacity: currentPage === 1 ? 0.5 : 1,
                }}
              >
                ←
              </button>
              <button
                style={{
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: '6px',
                  background: '#4318ff',
                  color: 'white',
                }}
              >
                {currentPage}
              </button>
              {totalPages > 1 && currentPage < totalPages && (
                <button
                  style={{
                    padding: '8px 12px',
                    border: 'none',
                    borderRadius: '6px',
                    background: '#f5f5f5',
                  }}
                >
                  ...
                </button>
              )}
              {totalPages > 1 && (
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  style={{
                    padding: '8px 12px',
                    border: 'none',
                    borderRadius: '6px',
                    background: currentPage === totalPages ? '#4318ff' : '#f5f5f5',
                    color: currentPage === totalPages ? 'white' : 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {totalPages}
                </button>
              )}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: '6px',
                  background: '#f5f5f5',
                  cursor: currentPage === totalPages ? 'default' : 'pointer',
                  opacity: currentPage === totalPages ? 0.5 : 1,
                }}
              >
                →
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default UsersPage;
