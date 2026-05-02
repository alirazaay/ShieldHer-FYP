import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { MapPin, AlertTriangle, Shield, Navigation } from 'lucide-react';
import { GoogleMap, InfoWindow, Marker, useJsApiLoader } from '@react-google-maps/api';
import { MapContainer, Marker as LeafletMarker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { formatTimestamp, getUserById, subscribeToAlerts, subscribeToPoliceUnits } from '../services/firestoreService';
import LoadingSpinner from '../components/LoadingSpinner';

const mapStyle = { width: '100%', height: '100%', borderRadius: '14px' };
const defaultCenter = { lat: 33.6844, lng: 73.0479 };
const GOOGLE_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';
const hasGoogle = GOOGLE_KEY && GOOGLE_KEY !== 'YOUR_GOOGLE_MAPS_API_KEY';

const emergIcon = L.divIcon({ className: '', html: '<div style="width:20px;height:20px;border-radius:50%;background:#dc2626;border:3px solid #fff;box-shadow:0 2px 8px rgba(220,38,38,0.4)"></div>', iconSize: [20, 20], iconAnchor: [10, 10] });
const unitIcon = L.divIcon({ className: '', html: '<div style="width:20px;height:20px;border-radius:50%;background:#4318FF;border:3px solid #fff;box-shadow:0 2px 8px rgba(67,24,255,0.4)"></div>', iconSize: [20, 20], iconAnchor: [10, 10] });

function Recenter({ center }) { const m = useMap(); useEffect(() => { m.setView(center); }, [center, m]); return null; }

function GoogleLive({ activeView, center, eMarkers, uMarkers, selected, onSelect, onClose }) {
  const { isLoaded, loadError } = useJsApiLoader({ id: 'shieldher-map', googleMapsApiKey: GOOGLE_KEY });
  if (loadError) return null;
  if (!isLoaded) return <LoadingSpinner message="Loading map..." />;
  return (
    <GoogleMap mapContainerStyle={mapStyle} center={center} zoom={12} options={{ disableDefaultUI: false, zoomControl: true, mapTypeControl: false, streetViewControl: false }}>
      {activeView === 'Emergencies' && eMarkers.map((m) => (
        <Marker key={m.id} position={m.position} icon={{ url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="11" fill="#dc2626" stroke="white" stroke-width="3"/></svg>') }} onClick={() => onSelect({ type: 'alert', data: m })} />
      ))}
      {activeView === 'Units' && uMarkers.map((m) => (
        <Marker key={m.id} position={m.position} icon={{ url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="11" fill="#4318FF" stroke="white" stroke-width="3"/></svg>') }} onClick={() => onSelect({ type: 'unit', data: m })} />
      ))}
      {selected && (
        <InfoWindow position={selected.data.position} onCloseClick={onClose}>
          <div style={{ padding: 4, maxWidth: 200, fontFamily: 'Inter, sans-serif' }}>
            {selected.type === 'alert' ? (
              <><strong style={{ color: '#dc2626' }}>Emergency</strong><div style={{ fontSize: 12, marginTop: 4 }}><div>{selected.data.userData?.fullName || 'Unknown'}</div><div>{formatTimestamp(selected.data.createdAt)}</div></div></>
            ) : (
              <><strong style={{ color: '#4318FF' }}>{selected.data.name}</strong><div style={{ fontSize: 12, marginTop: 4 }}><div>{selected.data.officerName || 'N/A'}</div><div>Status: {selected.data.status}</div></div></>
            )}
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}

function OSMLive({ activeView, center, eMarkers, uMarkers }) {
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={12} style={mapStyle}>
      <Recenter center={[center.lat, center.lng]} />
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {activeView === 'Emergencies' && eMarkers.map((m) => (
        <LeafletMarker key={m.id} position={[m.position.lat, m.position.lng]} icon={emergIcon}>
          <Popup><div style={{ fontSize: 12 }}><strong>Emergency</strong><div>{m.userData?.fullName || 'Unknown'}</div><div>{formatTimestamp(m.createdAt)}</div></div></Popup>
        </LeafletMarker>
      ))}
      {activeView === 'Units' && uMarkers.map((m) => (
        <LeafletMarker key={m.id} position={[m.position.lat, m.position.lng]} icon={unitIcon}>
          <Popup><div style={{ fontSize: 12 }}><strong>{m.name}</strong><div>{m.officerName || 'N/A'}</div></div></Popup>
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
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetched = useRef(new Set());

  useEffect(() => {
    const u1 = subscribeToAlerts((all) => {
      const active = all.filter((a) => ['active', 'escalated', 'responded'].includes(a.status));
      setAlerts(active); setLoading(false);
      active.forEach(async (a) => {
        const uid = a.userId || a.ownerId;
        if (!uid || fetched.current.has(uid)) return;
        fetched.current.add(uid);
        const ud = await getUserById(uid);
        if (ud) setUserCache((p) => p[uid] ? p : { ...p, [uid]: ud });
      });
    });
    const u2 = subscribeToPoliceUnits((all) => setUnits(all));
    return () => { u1(); u2(); };
  }, []);

  const eCount = useMemo(() => alerts.filter((a) => a.status === 'active' || a.status === 'escalated').length, [alerts]);
  const uCount = useMemo(() => units.filter((u) => u.status !== 'offline').length, [units]);
  const eMarkers = useMemo(() => alerts.filter((a) => a.latitude && a.longitude).map((a) => ({ ...a, userData: userCache[a.userId || a.ownerId], position: { lat: Number(a.latitude), lng: Number(a.longitude) } })), [alerts, userCache]);
  const uMarkers = useMemo(() => units.filter((u) => u.status !== 'offline' && u.location?.latitude).map((u) => ({ ...u, position: { lat: Number(u.location.latitude), lng: Number(u.location.longitude) } })), [units]);
  const center = useMemo(() => eMarkers[0]?.position || uMarkers[0]?.position || defaultCenter, [eMarkers, uMarkers]);

  if (loading) return <LoadingSpinner message="Loading map..." />;

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title"><Navigation size={28} /> Live Location Tracking</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`button ${activeView === 'Emergencies' ? 'button-danger' : 'button-ghost'}`} onClick={() => setActiveView('Emergencies')}>
            <AlertTriangle size={16} /> Emergencies
          </button>
          <button className={`button ${activeView === 'Units' ? 'button-primary' : 'button-ghost'}`} onClick={() => setActiveView('Units')}>
            <Shield size={16} /> Units
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, height: 'calc(100vh - 220px)' }}>
        <div style={{ flex: 2, position: 'relative' }}>
          {/* Floating stats */}
          <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <motion.div className="card card-elevated" style={{ minWidth: 120, marginBottom: 0 }} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
              <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 2 }}>{eCount}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Emergencies</div>
            </motion.div>
            <motion.div className="card card-elevated" style={{ minWidth: 120, marginBottom: 0 }} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
              <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 2 }}>{uCount}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Active Units</div>
            </motion.div>
          </div>

          {/* Legend */}
          <div style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 1000, background: 'white', borderRadius: 'var(--radius-md)', padding: '12px 16px', boxShadow: 'var(--shadow-md)', fontSize: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 11, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>Legend</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#dc2626' }} /> Emergency</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#4318FF' }} /> Unit</span>
            </div>
          </div>

          {hasGoogle ? (
            <GoogleLive activeView={activeView} center={center} eMarkers={eMarkers} uMarkers={uMarkers} selected={selected} onSelect={setSelected} onClose={() => setSelected(null)} />
          ) : (
            <OSMLive activeView={activeView} center={center} eMarkers={eMarkers} uMarkers={uMarkers} />
          )}
        </div>

        {/* Side Panel */}
        <div style={{ flex: 1, background: 'var(--color-card)', borderRadius: 'var(--radius-lg)', padding: 20, overflowY: 'auto', border: '1px solid var(--color-border)' }}>
          <h3 style={{ fontWeight: 700, marginBottom: 16, fontSize: 15 }}>
            {activeView === 'Emergencies' ? 'Active Emergencies' : 'Active Units'}
          </h3>
          {activeView === 'Emergencies' ? (
            alerts.length === 0 ? <div style={{ textAlign: 'center', padding: 20, color: 'var(--color-text-muted)' }}>No active emergencies</div> :
            alerts.map((a, i) => {
              const ud = userCache[a.userId || a.ownerId];
              return (
                <motion.div key={a.id} className="card" style={{ borderLeft: '3px solid #dc2626', marginBottom: 10 }}
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{ud?.fullName || 'Unknown'}</span>
                    <span className="badge badge-critical" style={{ fontSize: 9 }}>{a.status?.toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span><MapPin size={11} style={{ verticalAlign: 'middle' }} /> {a.latitude ? `${Number(a.latitude).toFixed(4)}, ${Number(a.longitude).toFixed(4)}` : 'N/A'}</span>
                    <span>{formatTimestamp(a.createdAt)}</span>
                  </div>
                </motion.div>
              );
            })
          ) : (
            units.filter((u) => u.status !== 'offline').length === 0 ?
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--color-text-muted)' }}>No active units</div> :
              units.filter((u) => u.status !== 'offline').map((u, i) => (
                <motion.div key={u.id} className="card" style={{ borderLeft: `3px solid ${u.status === 'available' ? '#16a34a' : u.status === 'dispatched' ? '#d97706' : '#4318FF'}`, marginBottom: 10 }}
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{u.name}</span>
                    <span className={`badge ${u.status === 'available' ? 'badge-success' : u.status === 'dispatched' ? 'badge-warning' : 'badge-info'}`} style={{ fontSize: 9 }}>{u.status?.toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{u.officerName || 'N/A'}</div>
                </motion.div>
              ))
          )}
        </div>
      </div>
    </>
  );
}

export default LiveMapPage;
