import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const API = import.meta.env.VITE_API_URL || '';

const TYPE_COLORS = {
  geoip: '#00ff41',
  'full-recon': '#00ccff',
  portscan: '#ffb000',
  whois: '#ff00ff',
  subdomains: '#ffff00',
  ssl: '#ff6600',
  scrape: '#ff4444',
};

const getColor = (type) => TYPE_COLORS[type] || '#888888';

const MapTab = ({ theme }) => {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const T = theme;

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const r = await fetch(`${API}/api/geoip/map`);
        const j = await r.json();
        if (j.success) {
          setPoints(j.data.points);
        } else {
          setError(j.error || 'Failed to load map data');
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (loading || !mapRef.current || !points.length) return;

    if (mapInstance.current) {
      mapInstance.current.remove();
    }

    const map = L.map(mapRef.current, {
      center: [20, 0],
      zoom: 2,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    const bounds = [];
    points.forEach((p) => {
      const color = getColor(p.type);
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 8,
        fillColor: color,
        color: '#ffffff',
        weight: 1,
        opacity: 0.8,
        fillOpacity: 0.6,
      }).addTo(map);

      marker.bindPopup(`
        <div style="font-family: 'Courier New', monospace; color: #0f0; background: #000; padding: 8px;">
          <b style="color: ${color};">[${p.type.toUpperCase()}]</b><br/>
          <b>Target:</b> ${p.target}<br/>
          <b>IP:</b> ${p.ip}<br/>
          <b>Location:</b> ${p.city}, ${p.country}<br/>
          <b>Coords:</b> ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}<br/>
          <small>${new Date(p.created_at).toLocaleString('pl-PL')}</small>
        </div>
      `, { minWidth: 200 });

      bounds.push([p.lat, p.lng]);
    });

    if (bounds.length) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }

    mapInstance.current = map;

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [points, loading]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '48px', color: T.muted }}>
        LOADING MAP DATA...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '48px', color: '#ff4444' }}>
        ERROR: {error}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h2 style={{ fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          GEOIP WORLD MAP
        </h2>
        <div style={{ fontSize: '12px', color: T.muted }}>
          {points.length} points
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: T.muted }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, display: 'inline-block' }} />
            {type}
          </div>
        ))}
      </div>

      <div style={{ border: `2px solid ${T.border}`, background: '#000' }}>
        <div ref={mapRef} style={{ width: '100%', height: '480px' }} />
      </div>

      {points.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px', color: T.muted, fontSize: '14px' }}>
          No GeoIP data found. Run a GeoIP lookup or Full Recon scan first!
        </div>
      )}
    </div>
  );
};

export default MapTab;
