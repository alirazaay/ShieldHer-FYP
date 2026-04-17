import React, { useState, useEffect } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import {
  subscribeToAlerts,
  subscribeToPoliceUnits,
  getUserById,
  formatTimestamp,
} from '../services/firestoreService';
import LoadingSpinner from '../components/LoadingSpinner';

const mapContainerStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '12px',
};

// Default center: Islamabad, Pakistan
const defaultCenter = { lat: 33.6844, lng: 73.0479 };

function LiveMapPage() {
  const [activeView, setActiveView] = useState('Emergencies');
  const [alerts, setAlerts] = useState([]);
  const [units, setUnits] = useState([]);
  const [userCache, setUserCache] = useState({});
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [loading, setLoading] = useState(true);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '',
  });

  // Subscribe to active alerts
  useEffect(() => {
    const unsubAlerts = subscribeToAlerts((allAlerts) => {
      const activeAlerts = allAlerts.filter(
        (a) => a.status === 'active' || a.status === 'escalated' || a.status === 'responded'
      );
      setAlerts(activeAlerts);
      setLoading(false);

      // Fetch user info for each alert
      activeAlerts.forEach(async (alert) => {
        const uid = alert.userId || alert.ownerId;
        if (uid && !userCache[uid]) {
          const userData = await getUserById(uid);
          if (userData) {
            setUserCache((prev) => ({ ...prev, [uid]: userData }));
          }
        }
      });
    });

    const unsubUnits = subscribeToPoliceUnits((allUnits) => {
      setUnits(allUnits);
    });

    return () => {
      unsubAlerts();
      unsubUnits();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emergencyCount = alerts.filter(
    (a) => a.status === 'active' || a.status === 'escalated'
  ).length;
  const activeUnitCount = units.filter((u) => u.status !== 'offline').length;

  // Map center: use first active alert's location or default
  const mapCenter =
    alerts.length > 0 && alerts[0].latitude && alerts[0].longitude
      ? { lat: Number(alerts[0].latitude), lng: Number(alerts[0].longitude) }
      : defaultCenter;

  const renderMap = () => {
    if (loadError) {
      return (
        <div
          style={{
            background: '#e0f2f1',
            borderRadius: '12px',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '64px', marginBottom: '15px' }}>🗺️</div>
          <div style={{ fontSize: '20px', fontWeight: '600', marginBottom: '10px' }}>Map Error</div>
          <div style={{ fontSize: '14px', color: '#666', maxWidth: '300px' }}>
            Failed to load Google Maps. Please check your API key in the .env file.
          </div>
        </div>
      );
    }

    if (!isLoaded) {
      return <LoadingSpinner message="Loading map..." />;
    }

    // If API key is placeholder, show helpful message
    if (
      !process.env.REACT_APP_GOOGLE_MAPS_API_KEY ||
      process.env.REACT_APP_GOOGLE_MAPS_API_KEY === 'YOUR_GOOGLE_MAPS_API_KEY'
    ) {
      return (
        <div
          style={{
            background: '#e0f2f1',
            borderRadius: '12px',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '20px',
          }}
        >
          <div style={{ fontSize: '64px', marginBottom: '15px' }}>🗺️</div>
          <div style={{ fontSize: '20px', fontWeight: '600', marginBottom: '10px' }}>Map View</div>
          <div style={{ fontSize: '14px', color: '#666', maxWidth: '350px', lineHeight: '1.6' }}>
            Add your Google Maps API key to <code>.env</code> file:
            <br />
            <code style={{ background: '#d4edda', padding: '2px 6px', borderRadius: '4px' }}>
              REACT_APP_GOOGLE_MAPS_API_KEY=your_key_here
            </code>
          </div>
          <div style={{ marginTop: '20px', fontSize: '13px', color: '#999' }}>
            {alerts.length} active alerts &bull; {units.length} units tracked
          </div>
        </div>
      );
    }

    return (
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={mapCenter}
        zoom={12}
        options={{
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
        }}
      >
        {/* Emergency markers */}
        {activeView === 'Emergencies' &&
          alerts.map((alert) => {
            if (!alert.latitude || !alert.longitude) return null;
            const uid = alert.userId || alert.ownerId;
            const userData = userCache[uid];
            return (
              <Marker
                key={alert.id}
                position={{ lat: Number(alert.latitude), lng: Number(alert.longitude) }}
                icon={{
                  url:
                    'data:image/svg+xml;charset=UTF-8,' +
                    encodeURIComponent(
                      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#ff0000" stroke="white" stroke-width="3"/><text x="16" y="21" text-anchor="middle" fill="white" font-size="16">!</text></svg>'
                    ),
                  scaledSize: { width: 32, height: 32 },
                }}
                onClick={() => setSelectedMarker({ type: 'alert', data: alert, userData })}
              />
            );
          })}

        {/* Unit markers */}
        {activeView === 'Units' &&
          units.map((unit) => {
            if (!unit.location?.latitude || !unit.location?.longitude) return null;
            return (
              <Marker
                key={unit.id}
                position={{
                  lat: Number(unit.location.latitude),
                  lng: Number(unit.location.longitude),
                }}
                icon={{
                  url:
                    'data:image/svg+xml;charset=UTF-8,' +
                    encodeURIComponent(
                      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#4318ff" stroke="white" stroke-width="3"/><text x="16" y="21" text-anchor="middle" fill="white" font-size="14">🚓</text></svg>'
                    ),
                  scaledSize: { width: 32, height: 32 },
                }}
                onClick={() => setSelectedMarker({ type: 'unit', data: unit })}
              />
            );
          })}

        {/* Info Window */}
        {selectedMarker && (
          <InfoWindow
            position={
              selectedMarker.type === 'alert'
                ? {
                    lat: Number(selectedMarker.data.latitude),
                    lng: Number(selectedMarker.data.longitude),
                  }
                : {
                    lat: Number(selectedMarker.data.location?.latitude),
                    lng: Number(selectedMarker.data.location?.longitude),
                  }
            }
            onCloseClick={() => setSelectedMarker(null)}
          >
            <div style={{ padding: '5px', maxWidth: '200px' }}>
              {selectedMarker.type === 'alert' ? (
                <>
                  <strong style={{ color: '#ff0000' }}>🚨 Emergency</strong>
                  <div style={{ fontSize: '12px', marginTop: '5px' }}>
                    <div>👤 {selectedMarker.userData?.fullName || 'Unknown'}</div>
                    <div>📱 {selectedMarker.userData?.phone || 'N/A'}</div>
                    <div>🕐 {formatTimestamp(selectedMarker.data.createdAt)}</div>
                    <div>Status: {selectedMarker.data.status}</div>
                  </div>
                </>
              ) : (
                <>
                  <strong style={{ color: '#4318ff' }}>🚓 {selectedMarker.data.name}</strong>
                  <div style={{ fontSize: '12px', marginTop: '5px' }}>
                    <div>👮 {selectedMarker.data.officerName || 'N/A'}</div>
                    <div>Status: {selectedMarker.data.status}</div>
                  </div>
                </>
              )}
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    );
  };

  if (loading) {
    return <LoadingSpinner message="Loading live map..." />;
  }

  return (
    <>
      <div
        className="page-header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <h1 className="page-title">🗺️ Live Location Tracking</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setActiveView('Emergencies')}
            className="button"
            style={{
              background: activeView === 'Emergencies' ? '#4318ff' : '#f5f5f5',
              color: activeView === 'Emergencies' ? '#fff' : '#666',
            }}
          >
            🚨 Emergencies
          </button>
          <button
            onClick={() => setActiveView('Units')}
            className="button"
            style={{
              background: activeView === 'Units' ? '#4318ff' : '#f5f5f5',
              color: activeView === 'Units' ? '#fff' : '#666',
            }}
          >
            🚓 Units
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px', height: 'calc(100vh - 200px)' }}>
        <div style={{ flex: 2, position: 'relative' }}>
          {/* Stats overlay */}
          <div
            style={{
              position: 'absolute',
              top: '20px',
              left: '20px',
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div className="card" style={{ minWidth: '130px' }}>
              <div style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '5px' }}>
                {emergencyCount}
              </div>
              <div style={{ fontSize: '12px', color: '#666' }}>Emergencies</div>
            </div>
            <div className="card" style={{ minWidth: '130px' }}>
              <div style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '5px' }}>
                {activeUnitCount}
              </div>
              <div style={{ fontSize: '12px', color: '#666' }}>Active Units</div>
            </div>
          </div>

          {renderMap()}
        </div>

        {/* Sidebar panel */}
        <div
          style={{
            flex: 1,
            background: 'white',
            borderRadius: '12px',
            padding: '20px',
            overflowY: 'auto',
          }}
        >
          <h3 style={{ fontWeight: 'bold', marginBottom: '20px' }}>
            {activeView === 'Emergencies' ? 'Active Emergencies' : 'Active Units'}
          </h3>

          {activeView === 'Emergencies' ? (
            alerts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                No active emergencies
              </div>
            ) : (
              alerts.map((alert) => {
                const uid = alert.userId || alert.ownerId;
                const userData = userCache[uid];
                return (
                  <div
                    key={alert.id}
                    className="card"
                    style={{
                      position: 'relative',
                      paddingLeft: '15px',
                      background: '#f9f9f9',
                      borderLeft: '4px solid #ff0000',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '10px',
                      }}
                    >
                      <span style={{ fontWeight: 'bold', fontSize: '14px' }}>
                        {userData?.fullName || 'Unknown'}
                      </span>
                      <span className="badge" style={{ background: '#ff0000', fontSize: '10px' }}>
                        {alert.status?.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
                      📍{' '}
                      {alert.latitude && alert.longitude
                        ? `${Number(alert.latitude).toFixed(4)}, ${Number(alert.longitude).toFixed(4)}`
                        : 'N/A'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
                      🕐 {formatTimestamp(alert.createdAt)}
                    </div>
                    {userData?.phone && (
                      <div style={{ fontSize: '11px', color: '#666' }}>📱 {userData.phone}</div>
                    )}
                  </div>
                );
              })
            )
          ) : units.filter((u) => u.status !== 'offline').length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
              No active units
            </div>
          ) : (
            units
              .filter((u) => u.status !== 'offline')
              .map((unit) => {
                const statusColors = {
                  available: '#10b981',
                  dispatched: '#ffa500',
                  on_emergency: '#ff0000',
                  on_scene: '#4318ff',
                };
                return (
                  <div
                    key={unit.id}
                    className="card"
                    style={{
                      position: 'relative',
                      paddingLeft: '15px',
                      background: '#f9f9f9',
                      borderLeft: `4px solid ${statusColors[unit.status] || '#666'}`,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '10px',
                      }}
                    >
                      <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{unit.name}</span>
                      <span
                        className="badge"
                        style={{
                          background: statusColors[unit.status] || '#666',
                          fontSize: '10px',
                        }}
                      >
                        {unit.status?.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
                      👮 {unit.officerName || 'N/A'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#666' }}>
                      📍 {unit.station || 'N/A'}
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </div>
    </>
  );
}

export default LiveMapPage;
