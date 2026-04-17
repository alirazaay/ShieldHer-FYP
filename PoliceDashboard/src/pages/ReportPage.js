import React, { useState, useEffect } from 'react';
import {
  subscribeToAlertStats,
  subscribeToUsers,
  getAlertsInRange,
  formatDate,
} from '../services/firestoreService';
import LoadingSpinner from '../components/LoadingSpinner';
import { showToast } from '../components/Toast';

function ReportPage() {
  const [alertStats, setAlertStats] = useState(null);
  const [userCount, setUserCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const unsubAlerts = subscribeToAlertStats((stats) => {
      setAlertStats(stats);
      setLoading(false);
    });
    const unsubUsers = subscribeToUsers((users) => {
      setUserCount(users.length);
    });
    return () => {
      unsubAlerts();
      unsubUsers();
    };
  }, []);

  const stats = [
    {
      count: alertStats?.total || 0,
      label: 'Total Incidents',
      subtitle: 'All time',
      icon: '🚨',
      color: '#ff4444',
    },
    {
      count: alertStats?.resolved || 0,
      label: 'Cases Resolved',
      subtitle: 'Cases',
      icon: '✓',
      color: '#10b981',
    },
    {
      count: alertStats ? alertStats.active + alertStats.escalated + alertStats.responded : 0,
      label: 'Active Cases',
      subtitle: 'In progress',
      icon: '⏱️',
      color: '#ffa500',
    },
    {
      count: userCount,
      label: 'Active Users',
      subtitle: 'Registered users',
      icon: '👥',
      color: '#8b5cf6',
    },
  ];

  const reports = [
    {
      title: 'Monthly Summary',
      description: 'Comprehensive monthly report with all emergency statistics',
      icon: '📊',
      color: '#ff4444',
    },
    {
      title: 'Emergency Response',
      description: 'Detailed analysis of emergency responses and outcomes',
      icon: '🚨',
      color: '#10b981',
    },
    {
      title: 'Unit Performance',
      description: 'Track performance metrics for all police units',
      icon: '🚓',
      color: '#ffa500',
    },
    {
      title: 'User Activity',
      description: 'User registration and engagement statistics',
      icon: '👥',
      color: '#8b5cf6',
    },
  ];

  const handleGenerateReport = async (reportType) => {
    setGenerating(true);
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const alerts = await getAlertsInRange(start, end);

      // Generate CSV
      const csvHeaders = 'Alert ID,Status,Type,Latitude,Longitude,Created At\n';
      const csvRows = alerts
        .map((a) => {
          const created = a.createdAt ? formatDate(a.createdAt) : 'N/A';
          return `"${a.id}","${a.status}","${a.type || a.alertType || 'N/A'}","${a.latitude || ''}","${a.longitude || ''}","${created}"`;
        })
        .join('\n');

      const blob = new Blob([csvHeaders + csvRows], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shieldher-${reportType.toLowerCase().replace(/\s/g, '-')}-${startDate}-to-${endDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      showToast(`${reportType} report generated (${alerts.length} records)`, 'success');
    } catch (error) {
      showToast('Failed to generate report: ' + error.message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading reports..." />;
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">📊 Reports & Analytics</h1>
        <p className="page-subtitle">View statistics and generate reports</p>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginTop: '20px' }}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              background: '#f5f5f5',
              borderRadius: '8px',
              padding: '10px',
            }}
          >
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '14px' }}
            />
          </div>
          <span style={{ color: '#666' }}>to</span>
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              background: '#f5f5f5',
              borderRadius: '8px',
              padding: '10px',
            }}
          >
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '14px' }}
            />
          </div>
        </div>
      </div>

      <div className="stats-grid">
        {stats.map((stat, index) => (
          <div key={index} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
              <div
                style={{
                  width: '45px',
                  height: '45px',
                  borderRadius: '10px',
                  background: stat.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '22px',
                }}
              >
                {stat.icon}
              </div>
            </div>
            <div style={{ fontSize: '36px', fontWeight: 'bold', marginBottom: '5px' }}>
              {stat.count}
            </div>
            <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '3px' }}>
              {stat.label}
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>{stat.subtitle}</div>
          </div>
        ))}
      </div>

      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px' }}>
          Generate Reports
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '20px',
          }}
        >
          {reports.map((report, index) => (
            <div key={index} className="card">
              <div
                style={{
                  width: '70px',
                  height: '70px',
                  borderRadius: '12px',
                  background: `${report.color}20`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '35px',
                  marginBottom: '20px',
                }}
              >
                {report.icon}
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: 'bold', marginBottom: '10px' }}>
                {report.title}
              </h3>
              <p
                style={{ fontSize: '13px', color: '#666', marginBottom: '20px', lineHeight: '1.5' }}
              >
                {report.description}
              </p>
              <button
                className="button"
                onClick={() => handleGenerateReport(report.title)}
                disabled={generating}
                style={{
                  width: '100%',
                  background: report.color,
                  color: 'white',
                  opacity: generating ? 0.6 : 1,
                }}
              >
                {generating ? '⏳ Generating...' : '📥 Generate Report'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default ReportPage;
