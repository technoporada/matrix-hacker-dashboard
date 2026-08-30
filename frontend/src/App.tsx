import { useState, useEffect } from 'react';
import MapTab from './MapTab';
import useWebSocket from './useWebSocket';
import type { ThemeColors, ThemeKey, LogEntry, ScraperResult, WhoisResult, GeoIpResult, PortResult, SubdomainResult, SslResult, HistoryScan } from './types';

const API = import.meta.env.VITE_API_URL || '';
const API_KEY = import.meta.env.VITE_API_KEY || '';

const THEMES = {
  matrix: {
    name: 'MATRIX', bg: '#000a00', bg2: '#001a00', text: '#00ff41',
    border: '#00cc33', muted: '#008000', accent: '#00ff41', canvas: '#00ff41',
    dim: '#003300', glow: 'rgba(0,255,65,0.3)', label: 'GREEN'
  },
  amber: {
    name: 'AMBER', bg: '#0a0500', bg2: '#1a0a00', text: '#ffb000',
    border: '#cc8800', muted: '#805000', accent: '#ff8c00', canvas: '#ff8800',
    dim: '#331800', glow: 'rgba(255,176,0,0.3)', label: 'AMBER'
  },
  ice: {
    name: 'ICE', bg: '#00050a', bg2: '#000a1a', text: '#00eeff',
    border: '#0099cc', muted: '#006080', accent: '#0088ff', canvas: '#00ccff',
    dim: '#001833', glow: 'rgba(0,238,255,0.3)', label: 'CYAN'
  }
};

const MatrixBackground = () => null;

const I = {
  globe: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  layers: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>,
  shield: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  activity: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  clock: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  terminal: <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>,
  dl: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
};

const toErr = (e: unknown): string => e instanceof Error ? e.message : String(e);

const Dashboard = () => {
  const [theme, setTheme] = useState<ThemeKey>('matrix');
  const [bgEffect, setBgEffect] = useState<string>('rain');
  const t = (): ThemeColors => THEMES[theme as ThemeKey];
  const [activeTab, setActiveTab] = useState<string>('scraper');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [scraperUrl, setScraperUrl] = useState('');
  const [scraperRunning, setScraperRunning] = useState(false);
  const [scraperResults, setScraperResults] = useState<ScraperResult[]>([]);
  const [whoisDomain, setWhoisDomain] = useState('');
  const [whoisResult, setWhoisResult] = useState<WhoisResult | null>(null);
  const [geoipIp, setGeoipIp] = useState('');
  const [geoipResult, setGeoipResult] = useState<GeoIpResult | null>(null);
  const [portScanTarget, setPortScanTarget] = useState('');
  const [portScanPorts, setPortScanPorts] = useState('22,80,443,3306,21');
  const [portScanResults, setPortScanResults] = useState<PortResult[]>([]);
  const [subdomainDomain, setSubdomainDomain] = useState('');
  const [subdomainResults, setSubdomainResults] = useState<SubdomainResult[]>([]);
  const [sslDomain, setSslDomain] = useState('');
  const [sslResults, setSslResults] = useState<SslResult | null>(null);
  const [fullReconTarget, setFullReconTarget] = useState('');
  const [fullReconResults, setFullReconResults] = useState<Record<string, unknown> | null>(null);
  const [fullReconRunning, setFullReconRunning] = useState(false);
  const [historyList, setHistoryList] = useState<HistoryScan[]>([]);
  const [historyDetail, setHistoryDetail] = useState<HistoryScan | null>(null);
  const [historyFilter, setHistoryFilter] = useState('');
  const { messages: liveMessages, connected } = useWebSocket();

  const liveFeed = (scanType: string): { scan: string; message: string }[] =>
    (liveMessages as { scan: string; message: string }[]).filter(m => m.scan === scanType);

  const addLog = (type: string, message: string): void => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [{ timestamp, type, message }, ...prev.slice(0, 99)]);
  };

  const apiPost = async (endpoint: string, body: unknown): Promise<any> => {
    const r = await fetch(`${API}${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(API_KEY ? { 'X-API-Key': API_KEY } : {}) }, body: JSON.stringify(body)
    });
    return r.json();
  };

  const apiGet = async (endpoint: string): Promise<any> => {
    const r = await fetch(`${API}${endpoint}`, {
      headers: { ...(API_KEY ? { 'X-API-Key': API_KEY } : {}) }
    });
    return r.json();
  };

  const exportJSON = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const realWebScraper = async () => {
    if (!scraperUrl) return addLog('ERROR', 'URL pusty');
    try {
      setScraperRunning(true);
      addLog('INFO', `Scraping: ${scraperUrl}`);
      const res = await apiPost('/api/scrape', { url: scraperUrl });
      if (!res.success) throw new Error(res.error || 'Scrape failed');
      const d = res.data;
      const results = [];
      results.push({ type: 'META', title: d.title, url: scraperUrl });
      (d.headings || []).forEach((h: any) => results.push({ type: 'HEADING', text: `${h.tag}: ${h.text}` }));
      (d.paragraphs || []).forEach((p: string) => results.push({ type: 'PARAGRAPH', text: p }));
      (d.links || []).forEach((l: any) => results.push({ type: 'LINK', text: `[${l.text}] ${l.href}` }));
      (d.emails || []).forEach((e: string) => results.push({ type: 'EMAIL', text: e }));
      setScraperResults(results);
      addLog('SUCCESS', `Extracted ${results.length} elements`);
    } catch (error) {
      addLog('ERROR', `Scraping failed: ${toErr(error)}`);
    } finally {
      setScraperRunning(false);
    }
  };

  const realWhois = async () => {
    if (!whoisDomain) return addLog('ERROR', 'Domena pusta');
    try {
      addLog('INFO', `WHOIS: ${whoisDomain}`);
      const res = await apiPost('/api/whois', { domain: whoisDomain });
      if (!res.success) throw new Error(res.error || 'WHOIS failed');
      const p = res.data.parsed || {};
      setWhoisResult({
        domain: whoisDomain,
        registrar: p.registrar || p.sponsoring_registrar || p['registrar_iana_id'] || 'Unknown',
        created: p.creation_date || p.created || 'Unknown',
        expires: p.expiration_date || p.expires || 'Unknown',
        nameservers: p.name_server ? p.name_server.split(/\s+/).filter(Boolean) : []
      });
      addLog('SUCCESS', 'WHOIS retrieved');
    } catch (error) {
      addLog('ERROR', `WHOIS failed: ${toErr(error)}`);
    }
  };

  const realGeoIP = async () => {
    if (!geoipIp) return addLog('ERROR', 'IP pusty');
    try {
      addLog('INFO', `GeoIP: ${geoipIp}`);
      const res = await apiPost('/api/geoip', { ip: geoipIp });
      if (!res.success) throw new Error(res.error || 'GeoIP failed');
      setGeoipResult(res.data);
      addLog('SUCCESS', 'GeoIP done');
    } catch (error) {
      addLog('ERROR', `GeoIP failed: ${toErr(error)}`);
    }
  };

  const realPortScan = async () => {
    if (!portScanTarget) return addLog('ERROR', 'Target pusty');
    try {
      addLog('INFO', `Port scan: ${portScanTarget} ports ${portScanPorts}`);
      const res = await apiPost('/api/portscan', { target: portScanTarget, ports: portScanPorts });
      if (!res.success) throw new Error(res.error || 'Port scan failed');
      setPortScanResults(res.data?.results || []);
      addLog('SUCCESS', `Port scan done: ${res.data?.open_count || 0} open ports`);
    } catch (error) {
      addLog('ERROR', `Port scan failed: ${toErr(error)}`);
    }
  };

  const realSubdomain = async () => {
    if (!subdomainDomain) return addLog('ERROR', 'Domena pusta');
    try {
      addLog('INFO', `Subdomain enum: ${subdomainDomain}`);
      const res = await apiPost('/api/subdomains', { domain: subdomainDomain });
      if (!res.success) throw new Error(res.error || 'Subdomain scan failed');
      setSubdomainResults(res.data?.subdomains || []);
      addLog('SUCCESS', `Found ${res.data?.found_count || 0} subdomains`);
    } catch (error) {
      addLog('ERROR', `Subdomain scan failed: ${toErr(error)}`);
    }
  };

  const realSSL = async () => {
    if (!sslDomain) return addLog('ERROR', 'Domena pusta');
    try {
      addLog('INFO', `SSL check: ${sslDomain}`);
      const res = await apiPost('/api/ssl', { domain: sslDomain });
      if (!res.success) throw new Error(res.error || 'SSL check failed');
      setSslResults(res.data);
      addLog('SUCCESS', 'SSL cert info retrieved');
    } catch (error) {
      addLog('ERROR', `SSL check failed: ${toErr(error)}`);
    }
  };

  const realFullRecon = async () => {
    if (!fullReconTarget) return addLog('ERROR', 'Target pusty');
    try {
      setFullReconRunning(true);
      addLog('INFO', `Full recon: ${fullReconTarget}`);
      const res = await apiPost('/api/full-recon', { target: fullReconTarget });
      if (!res.success) throw new Error(res.error || 'Full recon failed');
      setFullReconResults(res.data);
      addLog('SUCCESS', 'Full recon complete');
    } catch (error) {
      addLog('ERROR', `Full recon failed: ${toErr(error)}`);
    } finally {
      setFullReconRunning(false);
    }
  };

  const loadHistory = async () => {
    try {
      const res = await apiGet('/api/history');
      if (res.success) setHistoryList(res.data.scans || []);
    } catch (e) {
      addLog('ERROR', `History load failed: ${toErr(e)}`);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab]);

  const viewHistory = async (id: string) => {
    try {
      const res = await apiGet(`/api/history/${id}`);
      if (res.success) setHistoryDetail(res.data);
    } catch (e) {
      addLog('ERROR', `History detail failed: ${toErr(e)}`);
    }
  };

  const deleteHistory = async (id: string) => {
    try {
      const r = await fetch(`${API}/api/history/${id}`, { method: 'DELETE', headers: { ...(API_KEY ? { 'X-API-Key': API_KEY } : {}) } });
      const j = await r.json();
      if (j.success) {
        addLog('SUCCESS', 'Scan deleted');
        loadHistory();
        if (historyDetail?.id === id) setHistoryDetail(null);
      }
    } catch (e) {
      addLog('ERROR', `Delete failed: ${toErr(e)}`);
    }
  };

  const downloadReport = async (id: string) => {
    try {
      const r = await fetch(`${API}/api/history/${id}/report`, {
        headers: { ...(API_KEY ? { 'X-API-Key': API_KEY } : {}) }
      });
      const html = await r.text();
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `report-${id}.html`; a.click();
      addLog('SUCCESS', 'Report downloaded');
    } catch (e) {
      addLog('ERROR', `Report download failed: ${toErr(e)}`);
    }
  };

  const tabs = [
    { id: 'scraper', name: 'SCRAPER', icon: I.globe },
    { id: 'osint', name: 'OSINT', icon: I.globe },
    { id: 'subdomain', name: 'SUBDOMAINS', icon: I.layers },
    { id: 'ssl', name: 'SSL', icon: I.shield },
    { id: 'recon', name: 'RECON', icon: I.activity },
    { id: 'history', name: 'HISTORY', icon: I.clock },
    { id: 'map', name: 'MAP', icon: I.globe },
    { id: 'logs', name: 'LOGS', icon: I.terminal }
  ];

  const T = t();

  return (
    <div style={{background: T.bg, color: T.text, fontFamily: "'Courier New',monospace", minHeight: '100vh', position: 'relative', overflow: 'hidden'}}>
      <MatrixBackground />
      <div style={{position: 'relative', zIndex: 10, padding: '16px'}}>
        <div style={{border: `2px solid ${T.border}`, background: T.bg2, padding: '16px', marginBottom: '16px', textAlign: 'center', opacity: 0.95}}>
          <h1 style={{fontSize: '24px', fontWeight: 'bold', marginBottom: '8px', animation: 'pulse 2s infinite'}}>
            ◢◤ {T.name} HACKER DASHBOARD ◥◣
          </h1>
          <p style={{color: T.muted, fontSize: '12px'}}>
            [REAL TOOLS - NO SIMULATION] HIK!
          </p>
          <div style={{display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '8px', alignItems: 'center'}}>
            {Object.entries(THEMES).map(([key, val]) => (
              <button key={key} onClick={() => setTheme(key as ThemeKey)}
                style={{
                  border: `1px solid ${theme === key ? val.accent : val.muted}`,
                  background: theme === key ? val.dim : 'transparent',
                  color: val.text, padding: '4px 12px', cursor: 'pointer',
                  fontSize: '11px', fontFamily: 'monospace'
                }}>
                [{val.label}]
              </button>
            ))}
            <span style={{width: '1px', height: '16px', background: T.muted, margin: '0 8px'}} />
            {['rain','scanlines','grid','plain'].map(ef => (
              <button key={ef} onClick={() => setBgEffect(ef)}
                style={{
                  border: `1px solid ${bgEffect === ef ? T.accent : T.muted}`,
                  background: bgEffect === ef ? T.dim : 'transparent',
                  color: T.text, padding: '2px 8px', cursor: 'pointer',
                  fontSize: '10px', fontFamily: 'monospace'
                }}>
                {ef === 'rain' ? '☔' : ef === 'scanlines' ? '≡' : ef === 'grid' ? '▦' : '○'} {ef}
              </button>
            ))}
            <span style={{width: '1px', height: '16px', background: T.muted, margin: '0 8px'}} />
            <span style={{display: 'flex', alignItems: 'center', gap: '4px', color: T.muted, fontSize: '10px'}}>
              <span style={{width: '6px', height: '6px', borderRadius: '50%', background: connected ? '#00ff41' : '#ff4444', display: 'inline-block'}} />
              {connected ? 'WS' : 'WS OFF'}
            </span>
          </div>
        </div>

        <div style={{display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '8px'}}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
                border: `2px solid ${activeTab === tab.id ? T.border : T.muted}`,
                background: activeTab === tab.id ? T.dim : 'transparent',
                color: activeTab === tab.id ? T.text : T.muted,
                cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '14px'
              }}>
              {tab.icon}{tab.name}
            </button>
          ))}
        </div>

        <div style={{border: `2px solid ${T.border}`, background: T.bg2, padding: '16px', minHeight: '384px', opacity: 0.95}}>
          {activeTab === 'scraper' && (
            <div>
              <h2 style={{fontSize: '20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                {I.globe} WEB SCRAPER
              </h2>
              <input type="text" value={scraperUrl} onChange={(e) => setScraperUrl(e.target.value)}
                placeholder="https://example.com"
                style={{width: '100%', background: T.bg, border: `2px solid ${T.muted}`, padding: '8px', color: T.text, marginBottom: '12px', outline: 'none', fontFamily: 'monospace'}} />
              <div style={{display: 'flex', gap: '8px', marginBottom: '12px'}}>
                <button onClick={realWebScraper} disabled={scraperRunning}
                  style={{display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', border: `2px solid ${T.border}`, background: 'transparent', color: T.text, cursor: scraperRunning ? 'not-allowed' : 'pointer', opacity: scraperRunning ? 0.5 : 1, fontFamily: 'monospace'}}>
                  {scraperRunning ? 'SCRAPING...' : 'START'}
                </button>
                {scraperResults.length > 0 && (
                  <button onClick={() => exportJSON(scraperResults, 'scraper.json')}
                    style={{display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', border: `2px solid ${T.border}`, background: 'transparent', color: T.text, cursor: 'pointer', fontFamily: 'monospace'}}>
                    {I.dl} EXPORT JSON
                  </button>
                )}
              </div>
              {scraperResults.length > 0 && (
                <div style={{maxHeight: '384px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px'}}>
                  {scraperResults.map((r, i) => (
                    <div key={i} style={{border: `1px solid ${T.muted}`, padding: '12px'}}>
                      <div style={{fontWeight: 'bold', color: T.accent}}>[{r.type}]</div>
                      {r.title && <div style={{fontSize: '14px'}}>{r.title}</div>}
                      {r.text && <div style={{fontSize: '12px', marginTop: '4px'}}>{r.text}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'osint' && (
            <div style={{display: 'flex', flexDirection: 'column', gap: '24px'}}>
              <div>
                <h3 style={{fontSize: '18px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                  WHOIS
                </h3>
                <div style={{display: 'flex', gap: '8px', marginBottom: '8px'}}>
                  <input type="text" value={whoisDomain} onChange={(e) => setWhoisDomain(e.target.value)}
                    placeholder="example.com"
                    style={{flex: 1, background: T.bg, border: `2px solid ${T.muted}`, padding: '8px', color: T.text, outline: 'none', fontFamily: 'monospace'}} />
                  <button onClick={realWhois}
                    style={{padding: '8px 16px', border: `2px solid ${T.border}`, background: 'transparent', color: T.text, cursor: 'pointer', fontFamily: 'monospace'}}>
                    LOOKUP
                  </button>
                </div>
                {whoisResult && (
                  <div style={{border: `1px solid ${T.muted}`, padding: '12px', fontSize: '14px', display: 'flex', flexDirection: 'column', gap: '4px'}}>
                    <div>Domain: {whoisResult.domain}</div>
                    <div>Registrar: {whoisResult.registrar}</div>
                    <div>Created: {whoisResult.created}</div>
                    <div>Expires: {whoisResult.expires}</div>
                    <div>NS: {whoisResult.nameservers.join(', ')}</div>
                  </div>
                )}
              </div>
              <div>
                <h3 style={{fontSize: '18px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                  {I.globe} GeoIP
                </h3>
                <div style={{display: 'flex', gap: '8px', marginBottom: '8px'}}>
                  <input type="text" value={geoipIp} onChange={(e) => setGeoipIp(e.target.value)}
                    placeholder="8.8.8.8"
                    style={{flex: 1, background: T.bg, border: `2px solid ${T.muted}`, padding: '8px', color: T.text, outline: 'none', fontFamily: 'monospace'}} />
                  <button onClick={realGeoIP}
                    style={{padding: '8px 16px', border: `2px solid ${T.border}`, background: 'transparent', color: T.text, cursor: 'pointer', fontFamily: 'monospace'}}>
                    LOOKUP
                  </button>
                </div>
                {geoipResult && (
                  <div style={{border: `1px solid ${T.muted}`, padding: '12px', fontSize: '14px', display: 'flex', flexDirection: 'column', gap: '4px'}}>
                    <div>IP: {geoipResult.ip}</div>
                    <div>Country: {geoipResult.country}</div>
                    <div>Region: {geoipResult.region}</div>
                    <div>City: {geoipResult.city}</div>
                    <div>Timezone: {geoipResult.timezone}</div>
                    <div>Coords: {geoipResult.coordinates}</div>
                  </div>
                )}
              </div>
              <div>
                <h3 style={{fontSize: '18px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                  {I.activity} Port Scanner
                </h3>
                <div style={{display: 'flex', gap: '8px', marginBottom: '8px'}}>
                  <input type="text" value={portScanTarget} onChange={(e) => setPortScanTarget(e.target.value)}
                    placeholder="example.com"
                    style={{flex: 1, background: T.bg, border: `2px solid ${T.muted}`, padding: '8px', color: T.text, outline: 'none', fontFamily: 'monospace'}} />
                </div>
                <div style={{display: 'flex', gap: '8px', marginBottom: '8px'}}>
                  <input type="text" value={portScanPorts} onChange={(e) => setPortScanPorts(e.target.value)}
                    placeholder="22,80,443,3306,21"
                    style={{width: '200px', background: T.bg, border: `2px solid ${T.muted}`, padding: '8px', color: T.text, outline: 'none', fontFamily: 'monospace', fontSize: '13px'}} />
                  <button onClick={realPortScan}
                    style={{padding: '8px 16px', border: `2px solid ${T.border}`, background: 'transparent', color: T.text, cursor: 'pointer', fontFamily: 'monospace'}}>
                    SCAN
                  </button>
                </div>
                {portScanResults.length > 0 && (
                  <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
                    {portScanResults.map((p, i) => (
                      <div key={i} style={{border: `1px solid ${T.muted}`, padding: '8px', fontSize: '14px', display: 'flex', justifyContent: 'space-between'}}>
                        <span>Port {p.port} - {p.service}</span>
                        <span style={{color: p.status.includes('OPEN') ? T.text : T.muted}}>{p.status}</span>
                      </div>
                    ))}
                  </div>
                )}
                {liveFeed('portscan').length > 0 && (
                  <div style={{marginTop: '12px', border: `1px solid ${T.muted}`, padding: '8px', maxHeight: '128px', overflowY: 'auto', background: T.bg}}>
                    <div style={{fontSize: '11px', color: T.accent, marginBottom: '4px'}}>◉ LIVE PROGRESS</div>
                    {liveFeed('portscan').map((msg, i) => (
                      <div key={i} style={{fontSize: '11px', color: T.text, fontFamily: 'monospace'}}>{msg.message}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'subdomain' && (
            <div>
              <h2 style={{fontSize: '20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                {I.layers} SUBDOMAIN ENUMERATION
              </h2>
              <div style={{display: 'flex', gap: '8px', marginBottom: '12px'}}>
                <input type="text" value={subdomainDomain} onChange={(e) => setSubdomainDomain(e.target.value)}
                  placeholder="example.com"
                  style={{flex: 1, background: T.bg, border: `2px solid ${T.muted}`, padding: '8px', color: T.text, outline: 'none', fontFamily: 'monospace'}} />
                <button onClick={realSubdomain}
                  style={{padding: '8px 16px', border: `2px solid ${T.border}`, background: 'transparent', color: T.text, cursor: 'pointer', fontFamily: 'monospace'}}>
                  ENUMERATE
                </button>
              </div>
              {subdomainResults.length > 0 && (
                <div style={{maxHeight: '384px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px'}}>
                  {subdomainResults.map((s, i) => (
                    <div key={i} style={{border: `1px solid ${T.muted}`, padding: '8px', fontSize: '14px', display: 'flex', justifyContent: 'space-between'}}>
                      <span>{s.subdomain}</span>
                      <span style={{color: T.text}}>{s.exists ? 'EXISTS' : 'NOT FOUND'}</span>
                    </div>
                  ))}
                </div>
              )}
              {subdomainResults.length === 0 && (
                <div style={{color: T.muted, textAlign: 'center', padding: '32px'}}>No subdomains found or not scanned yet.</div>
              )}
              {liveFeed('subdomains').length > 0 && (
                <div style={{marginTop: '12px', border: `1px solid ${T.muted}`, padding: '8px', maxHeight: '160px', overflowY: 'auto', background: T.bg}}>
                  <div style={{fontSize: '11px', color: T.accent, marginBottom: '4px'}}>◉ LIVE PROGRESS</div>
                  {liveFeed('subdomains').map((msg, i) => (
                    <div key={i} style={{fontSize: '11px', color: msg.message.startsWith('FOUND') ? T.text : T.muted, fontFamily: 'monospace'}}>{msg.message}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'ssl' && (
            <div>
              <h2 style={{fontSize: '20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                {I.shield} SSL CERTIFICATE INFO
              </h2>
              <div style={{display: 'flex', gap: '8px', marginBottom: '12px'}}>
                <input type="text" value={sslDomain} onChange={(e) => setSslDomain(e.target.value)}
                  placeholder="example.com"
                  style={{flex: 1, background: T.bg, border: `2px solid ${T.muted}`, padding: '8px', color: T.text, outline: 'none', fontFamily: 'monospace'}} />
                <button onClick={realSSL}
                  style={{padding: '8px 16px', border: `2px solid ${T.border}`, background: 'transparent', color: T.text, cursor: 'pointer', fontFamily: 'monospace'}}>
                  CHECK SSL
                </button>
              </div>
              {sslResults && (
                <div style={{border: `1px solid ${T.muted}`, padding: '12px', fontSize: '14px', display: 'flex', flexDirection: 'column', gap: '8px'}}>
                  <div><span style={{color: T.accent}}>Domain:</span> {sslResults.domain}</div>
                  <div><span style={{color: T.accent}}>Issuer:</span> {sslResults.issuer}</div>
                  <div><span style={{color: T.accent}}>Subject:</span> {sslResults.subject}</div>
                  <div><span style={{color: T.accent}}>Valid From:</span> {sslResults.valid_from}</div>
                  <div><span style={{color: T.accent}}>Valid To:</span> {sslResults.valid_to}</div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'recon' && (
            <div>
              <h2 style={{fontSize: '20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                {I.activity} FULL RECONNAISSANCE
              </h2>
              <div style={{display: 'flex', gap: '8px', marginBottom: '12px'}}>
                <input type="text" value={fullReconTarget} onChange={(e) => setFullReconTarget(e.target.value)}
                  placeholder="example.com or 8.8.8.8"
                  style={{flex: 1, background: T.bg, border: `2px solid ${T.muted}`, padding: '8px', color: T.text, outline: 'none', fontFamily: 'monospace'}} />
                <button onClick={realFullRecon} disabled={fullReconRunning}
                  style={{padding: '8px 16px', border: `2px solid ${T.border}`, background: 'transparent', color: T.text, cursor: fullReconRunning ? 'not-allowed' : 'pointer', opacity: fullReconRunning ? 0.5 : 1, fontFamily: 'monospace'}}>
                  {fullReconRunning ? 'SCANNING...' : 'FULL RECON'}
                </button>
              </div>
              {liveFeed('full-recon').length > 0 && (
                <div style={{marginBottom: '12px', border: `1px solid ${T.muted}`, padding: '8px', maxHeight: '160px', overflowY: 'auto', background: T.bg}}>
                  <div style={{fontSize: '11px', color: T.accent, marginBottom: '4px'}}>◉ LIVE PROGRESS</div>
                  {liveFeed('full-recon').map((msg, i) => (
                    <div key={i} style={{fontSize: '11px', color: T.text, fontFamily: 'monospace'}}>{msg.message}</div>
                  ))}
                </div>
              )}
              {fullReconResults && (
                <div style={{maxHeight: '384px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px'}}>
                  <div style={{border: `1px solid ${T.muted}`, padding: '12px', fontSize: '14px'}}>
                    <div style={{color: T.accent, fontWeight: 'bold', marginBottom: '4px'}}>Target: {String((fullReconResults as any).target)}</div>
                    <div style={{color: T.muted}}>Timestamp: {String((fullReconResults as any).timestamp)}</div>
                  </div>
                  {(fullReconResults as any).whois && (
                    <div style={{border: `1px solid ${T.muted}`, padding: '12px', fontSize: '14px'}}>
                      <div style={{color: T.accent, fontWeight: 'bold', marginBottom: '4px'}}>WHOIS</div>
                      <pre style={{fontSize: '12px', whiteSpace: 'pre-wrap'}}>{typeof (fullReconResults as any).whois === 'object' ? JSON.stringify((fullReconResults as any).whois, null, 2) : String((fullReconResults as any).whois)}</pre>
                    </div>
                  )}
                  {(fullReconResults as any).dns && (
                    <div style={{border: `1px solid ${T.muted}`, padding: '12px', fontSize: '14px'}}>
                      <div style={{color: T.accent, fontWeight: 'bold', marginBottom: '4px'}}>DNS</div>
                      <div>IPs: {((fullReconResults as any).dns.ips || []).join(', ')}</div>
                    </div>
                  )}
                  {(fullReconResults as any).geoip && (
                    <div style={{border: `1px solid ${T.muted}`, padding: '12px', fontSize: '14px'}}>
                      <div style={{color: T.accent, fontWeight: 'bold', marginBottom: '4px'}}>GeoIP</div>
                      <pre style={{fontSize: '12px'}}>{JSON.stringify((fullReconResults as any).geoip, null, 2)}</pre>
                    </div>
                  )}
                  {(fullReconResults as any).subdomains && (
                    <div style={{border: `1px solid ${T.muted}`, padding: '12px', fontSize: '14px'}}>
                      <div style={{color: T.accent, fontWeight: 'bold', marginBottom: '4px'}}>Subdomains</div>
                      <div>Found: {((fullReconResults as any).subdomains.found || []).join(', ') || 'none'}</div>
                    </div>
                  )}
                  {(fullReconResults as any).ssl && (
                    <div style={{border: `1px solid ${T.muted}`, padding: '12px', fontSize: '14px'}}>
                      <div style={{color: T.accent, fontWeight: 'bold', marginBottom: '4px'}}>SSL</div>
                      <pre style={{fontSize: '12px', whiteSpace: 'pre-wrap'}}>{(fullReconResults as any).ssl.data || (fullReconResults as any).ssl.error || 'N/A'}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              <h2 style={{fontSize: '20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between'}}>
                <span>{I.clock} SCAN HISTORY</span>
                <button onClick={loadHistory}
                  style={{padding: '4px 12px', border: `1px solid ${T.border}`, background: 'transparent', color: T.text, cursor: 'pointer', fontSize: '12px', fontFamily: 'monospace'}}>
                  REFRESH
                </button>
              </h2>
              {!historyDetail && (
                <div>
                  <input type="text" value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)}
                    placeholder="Filter by target or type..."
                    style={{width: '100%', background: T.bg, border: `2px solid ${T.muted}`, padding: '8px', color: T.text, marginBottom: '12px', outline: 'none', fontFamily: 'monospace'}} />
                  <div style={{maxHeight: '384px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px'}}>
                    {historyList.filter(s => !historyFilter || s.target.toLowerCase().includes(historyFilter.toLowerCase()) || s.type.includes(historyFilter)).map(s => (
                      <div key={s.id} style={{border: `1px solid ${T.muted}`, padding: '8px', fontSize: '13px', cursor: 'pointer'}}
                        onClick={() => viewHistory(s.id)}>
                        <div style={{display: 'flex', justifyContent: 'space-between'}}>
                          <span style={{color: T.accent}}>[{s.type.toUpperCase()}] {s.target}</span>
                          <span style={{color: T.muted, fontSize: '11px'}}>{new Date(s.created_at).toLocaleString('pl-PL')}</span>
                        </div>
                        <div style={{color: T.muted, fontSize: '11px', marginTop: '4px'}}>{s.summary?.substring(0, 80)}</div>
                      </div>
                    ))}
                    {historyList.length === 0 && <div style={{color: T.muted, textAlign: 'center', padding: '32px'}}>No scans yet. Run some tools first!</div>}
                  </div>
                </div>
              )}
              {historyDetail && (
                <div>
                  <button onClick={() => setHistoryDetail(null)}
                    style={{marginBottom: '12px', padding: '4px 12px', border: `1px solid ${T.border}`, background: 'transparent', color: T.text, cursor: 'pointer', fontSize: '12px', fontFamily: 'monospace'}}>
                    ← BACK
                  </button>
                  <div style={{border: `1px solid ${T.muted}`, padding: '12px', fontSize: '13px', marginBottom: '12px'}}>
                    <div><span style={{color: T.accent}}>Target:</span> {historyDetail.target}</div>
                    <div><span style={{color: T.accent}}>Type:</span> {historyDetail.type}</div>
                    <div><span style={{color: T.accent}}>Date:</span> {new Date(historyDetail.created_at).toLocaleString('pl-PL')}</div>
                    {historyDetail.notes && <div><span style={{color: T.accent}}>Notes:</span> {historyDetail.notes}</div>}
                  </div>
                  <div style={{display: 'flex', gap: '8px', marginBottom: '12px'}}>
                    <button onClick={() => downloadReport(historyDetail.id)}
                      style={{padding: '8px 16px', border: `2px solid ${T.border}`, background: 'transparent', color: T.text, cursor: 'pointer', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '6px'}}>
                      {I.dl} REPORT HTML
                    </button>
                    <button onClick={() => exportJSON(historyDetail.results, `scan-${historyDetail.id}.json`)}
                      style={{padding: '8px 16px', border: `2px solid ${T.border}`, background: 'transparent', color: T.text, cursor: 'pointer', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '6px'}}>
                      {I.dl} JSON
                    </button>
                    <button onClick={() => deleteHistory(historyDetail.id)}
                      style={{padding: '8px 16px', border: `2px solid ${T.muted}`, background: 'transparent', color: T.muted, cursor: 'pointer', fontFamily: 'monospace'}}>
                      DELETE
                    </button>
                  </div>
                  <div style={{maxHeight: '256px', overflowY: 'auto', border: `1px solid ${T.muted}`, padding: '8px'}}>
                    <pre style={{fontSize: '11px', whiteSpace: 'pre-wrap'}}>{JSON.stringify(historyDetail.results, null, 2)}</pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'map' && (
            <MapTab theme={t()} />
          )}

          {activeTab === 'logs' && (
            <div>
              <h2 style={{fontSize: '20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                {I.terminal} SYSTEM LOGS
              </h2>
              <div style={{border: `1px solid ${T.muted}`, padding: '12px', height: '384px', overflowY: 'auto', background: T.bg}}>
                {logs.length === 0 ? (
                  <div style={{color: T.muted, textAlign: 'center'}}>No logs yet...</div>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} style={{fontSize: '12px', fontFamily: 'monospace', color: T.text, marginBottom: '4px', borderLeft: `2px solid ${T.border}`, paddingLeft: '8px'}}>
                      <span style={{color: T.muted}}>[{log.timestamp}]</span>{' '}
                      <span style={{color: T.accent}}>{log.type}:</span> {log.message}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{marginTop: '16px', border: `2px solid ${T.border}`, background: T.bg2, padding: '12px', textAlign: 'center', fontSize: '14px', opacity: 0.95}}>
          <div style={{color: T.text}}>⚡ {T.name} DASHBOARD v2.0 - "There is no spoon" ⚡</div>
          <div style={{color: T.muted, fontSize: '12px', marginTop: '4px'}}>Real APIs | Zero simulation | {T.label} THEME | HIK!</div>
        </div>
      </div>
      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.7; } }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: ${T.bg}; }
        ::-webkit-scrollbar-thumb { background: ${T.muted}; }
        ::-webkit-scrollbar-thumb:hover { background: ${T.border}; }
        input:focus { box-shadow: 0 0 8px ${T.glow}; }
        button:hover { box-shadow: 0 0 6px ${T.glow}; }
      `}</style>
    </div>
  );
};

export default Dashboard;
