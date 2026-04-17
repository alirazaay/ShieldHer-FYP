import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GoogleMap, InfoWindow, Marker, useJsApiLoader } from '@react-google-maps/api';
import { MapContainer, Marker as LeafletMarker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  formatTimestamp,
  getUserById,
  subscribeToAlerts,
  subscribeToPoliceUnits,
} from '../services/firestoreService';
import LoadingSpinner from '../components/LoadingSpinner';

const mapContainerStyle = {
  width: '100%',
  height: '100%',
  borderRadius: '12px',
};

const defaultCenter = { lat: 33.6844, lng: 73.0479 };
const GOOGLE_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';
const hasValidGoogleKey = GOOGLE_API_KEY && GOOGLE_API_KEY !== 'YOUR_GOOGLE_MAPS_API_KEY';

const emergencyLeafletIcon = L.divIcon({
  className: 'shieldher-marker',
  html: '<div style="width:22px;height:22px;border-radius:50%;background:#ff0000;color:#fff;display:flex;align-items:center;justify-content:center;border:2px solid #fff;font-weight:700;font-size:12px;">!</div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const unitLeafletIcon = L.divIcon({
  className: 'shieldher-marker',
  html: '<div style="width:24px;height:24px;border-radius:50%;background:#4318ff;color:#fff;display:flex;align-items:center;justify-content:center;border:2px solid #fff;font-size:12px;">🚓</div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

function RecenterMap({ center }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center);
  }, [center, map]);

  return null;
}

function GoogleLiveMap({
  activeView,
  center,
  emergencyMarkers,
  unitMarkers,
  onSelectMarker,
  selectedMarker,
  onCloseMarker,
}) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'shieldher-google-map',
    googleMapsApiKey: GOOGLE_API_KEY,
  });

  if (loadError) {
    return null;
  }

  if (!isLoaded) {
    return <LoadingSpinner message="Loading map..." />;
  }

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={center}
      zoom={12}
      options={{
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
      }}
    >
      {activeView === 'Emergencies' &&
        emergencyMarkers.map((marker) => (
          <Marker
            key={marker.id}
            position={marker.position}
            icon={{
              url:
                'data:image/svg+xml;charset=UTF-8,' +
                encodeURIComponent(
                  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#ff0000" stroke="white" stroke-width="3"/><text x="16" y="21" text-anchor="middle" fill="white" font-size="16">!</text></svg>'
                ),
            }}
            onClick={() => onSelectMarker({ type: 'alert', data: marker })}
          />
        ))}

      {activeView === 'Units' &&
        unitMarkers.map((marker) => (
          <Marker
            key={marker.id}
            position={marker.position}
            icon={{
              url:
                'data:image/svg+xml;charset=UTF-8,' +
                encodeURIComponent(
                  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="#4318ff" stroke="white" stroke-width="3"/><text x="16" y="21" text-anchor="middle" fill="white" font-size="14">🚓</text></svg>'
                ),
            }}
            onClick={() => onSelectMarker({ type: 'unit', data: marker })}
          />
        ))}

      {selectedMarker && (
        <InfoWindow position={selectedMarker.data.position} onCloseClick={onCloseMarker}>
          <div style={{ padding: '5px', maxWidth: '220px' }}>
            {selectedMarker.type === 'alert' ? (
              <>
                <strong style={{ color: '#ff0000' }}>🚨 Emergency</strong>
                <div style={{ fontSize: '12px', marginTop: '5px' }}>
                  <div>👤 {selectedMarker.data.userData?.fullName || 'Unknown'}</div>
                  <div>📱 {selectedMarker.data.userData?.phone || 'N/A'}</div>
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
}

function OpenStreetMapLiveMap({ activeView, center, emergencyMarkers, unitMarkers }) {
  const leafletCenter = [center.lat, center.lng];

  return (
    <MapContainer center={leafletCenter} zoom={12} style={mapContainerStyle}>
      <RecenterMap center={leafletCenter} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {activeView === 'Emergencies' &&
        emergencyMarkers.map((marker) => (
          <LeafletMarker
            key={marker.id}
            position={[marker.position.lat, marker.position.lng]}
            icon={emergencyLeafletIcon}
          >
            <Popup>
              <div style={{ fontSize: '12px' }}>
                <strong>🚨 Emergency</strong>
                <div>👤 {marker.userData?.fullName || 'Unknown'}</div>
                <div>📱 {marker.userData?.phone || 'N/A'}</div>
                <div>🕐 {formatTimestamp(marker.createdAt)}</div>
                <div>Status: {marker.status}</div>
              </div>
            </Popup>
          </LeafletMarker>
        ))}

      {activeView === 'Units' &&
        unitMarkers.map((marker) => (
          <LeafletMarker
            key={marker.id}
            position={[marker.position.lat, marker.position.lng]}
            icon={unitLeafletIcon}
          >
            <Popup>
              <div style={{ fontSize: '12px' }}>
                <strong>🚓 {marker.name}</strong>
                <div>👮 {marker.officerName || 'N/A'}</div>
                <div>Status: {marker.status}</div>
              </div>
            </Popup>
          </LeafletMarker>
        ))}
    </MapContainer>
  );
}

function LiveMapPage() {
  const [activeView, setActiveView] = useState('Emergencies');
  const [alerts, setAlerts] = useState([]);
  const [units, setUnits] = useState([]);
  const [userCache, setUserCache] = useState({});
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetchedUserIdsRef = useRef(new Set());

  useEffect(() => {
    const unsubAlerts = subscribeToAlerts((allAlerts) => {
      const activeAlerts = allAlerts.filter(
        (a) => a.status === 'active' || a.status === 'escalated' || a.status === 'responded'
      );

      setAlerts(activeAlerts);
      setLoading(false);

      activeAlerts.forEach(async (alert) => {
        const uid = alert.userId || alert.ownerId;
        if (!uid || fetchedUserIdsRef.current.has(uid)) return;

        fetchedUserIdsRef.current.add(uid);

        const userData = await getUserById(uid);
        if (!userData) {
          fetchedUserIdsRef.current.delete(uid);
          return;
        }

        setUserCache((prev) => {
          if (prev[uid]) return prev;
          return { ...prev, [uid]: userData };
        });
      });
    });

    const unsubUnits = subscribeToPoliceUnits((allUnits) => {
      setUnits(allUnits);
    });

    return () => {
      unsubAlerts();
      unsubUnits();
    };
  }, []);

  const emergencyCount = useMemo(
    () => alerts.filter((a) => a.status === 'active' || a.status === 'escalated').length,
    [alerts]
  );

  const activeUnitCount = useMemo(
    () => units.filter((u) => u.status !== 'offline').length,
    [units]
  );

  const emergencyMarkers = useMemo(
    () =>
      alerts
        .filter((alert) => alert.latitude && alert.longitude)
        .map((alert) => {
          const uid = alert.userId || alert.ownerId;
          return {
            ...alert,
            userData: userCache[uid],
            position: {
              lat: Number(alert.latitude),
              lng: Number(alert.longitude),
            },
          };
        }),
    [alerts, userCache]
  );

  const unitMarkers = useMemo(
    () =>
      units
        .filter(
          (unit) => unit.status !== 'offline' && unit.location?.latitude && unit.location?.longitude
        )
        .map((unit) => ({
          ...unit,
          position: {
            lat: Number(unit.location.latitude),
            lng: Number(unit.location.longitude),
          },
        })),
    [units]
  );

  const mapCenter = useMemo(() => {
    if (emergencyMarkers.length > 0) return emergencyMarkers[0].position;
    if (unitMarkers.length > 0) return unitMarkers[0].position;
    return defaultCenter;
  }, [emergencyMarkers, unitMarkers]);

  const statusColors = {
    available: '#10b981',
    dispatched: '#ffa500',
    on_emergency: '#ff0000',
    on_scene: '#4318ff',
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
          <div
            style={{
              position: 'absolute',
              top: '20px',
              left: '20px',
              zIndex: 1000,
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

          {!hasValidGoogleKey && (
            <div
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                zIndex: 1000,
                background: '#fff7ed',
                color: '#9a3412',
                border: '1px solid #fed7aa',
                borderRadius: '999px',
                padding: '8px 12px',
                fontSize: '12px',
                fontWeight: '600',
              }}
            >
              Using OpenStreetMap (set REACT_APP_GOOGLE_MAPS_API_KEY for Google Maps)
            </div>
          )}

          {hasValidGoogleKey ? (
            <GoogleLiveMap
              activeView={activeView}
              center={mapCenter}
              emergencyMarkers={emergencyMarkers}
              unitMarkers={unitMarkers}
              selectedMarker={selectedMarker}
              onSelectMarker={setSelectedMarker}
              onCloseMarker={() => setSelectedMarker(null)}
            />
          ) : (
            <OpenStreetMapLiveMap
              activeView={activeView}
              center={mapCenter}
              emergencyMarkers={emergencyMarkers}
              unitMarkers={unitMarkers}
            />
          )}
        </div>

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
              .map((unit) => (
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
                  <div style={{ fontSize: '11px', color: '#666' }}>📍 {unit.station || 'N/A'}</div>
                </div>
              ))
          )}
        </div>
      </div>
    </>
  );
}

export default LiveMapPage;
