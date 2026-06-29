import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Globe, Wifi, Smartphone, Camera, Play, Download, Search, Info, Activity } from 'lucide-react';

const MatrixBackground = () => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const fontSize = 14;
    const columns = canvas.width / fontSize;
    const drops = Array(Math.floor(columns)).fill(1);
    const draw = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0F0';
      ctx.font = fontSize + 'px monospace';
      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    };
    const interval = setInterval(draw, 33);
    return () => clearInterval(interval);
  }, []);
  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none opacity-20" />;
};

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState('scraper');
  const [logs, setLogs] = useState([]);
  const [scraperUrl, setScraperUrl] = useState('');
  const [scraperRunning, setScraperRunning] = useState(false);
  const [scraperResults, setScraperResults] = useState([]);
  const [whoisDomain, setWhoisDomain] = useState('');
  const [whoisResult, setWhoisResult] = useState(null);
  const [geoipIp, setGeoipIp] = useState('');
  const [geoipResult, setGeoipResult] = useState(null);
  const [portScanTarget, setPortScanTarget] = useState('');
  const [portScanResults, setPortScanResults] = useState([]);
  const [mediaUrl, setMediaUrl] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState('');

  const addLog = (type, message) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [{ timestamp, type, message }, ...prev.slice(0, 99)]);
  };

  const realWebScraper = async () => {
    if (!scraperUrl) return addLog('ERROR', 'URL pusty');
    try {
      setScraperRunning(true);
      addLog('INFO', `[REAL] Scraping: ${scraperUrl}`);
      const response = await fetch(scraperUrl, { mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const results = [];
      results.push({ type: 'META', title: doc.title || 'No title', url: scraperUrl });
      doc.querySelectorAll('h1, h2, h3').forEach((el, i) => {
        if (i < 10) results.push({ type: 'HEADING', text: el.textContent.trim().substring(0, 100) });
      });
      doc.querySelectorAll('p').forEach((el, i) => {
        if (i < 10 && el.textContent.trim().length > 20) {
          results.push({ type: 'PARAGRAPH', text: el.textContent.trim().substring(0, 200) });
        }
      });
      setScraperResults(results);
      addLog('SUCCESS', `Extracted ${results.length} elements`);
    } catch (error) {
      addLog('ERROR', `Scraping failed: ${error.message}`);
    } finally {
      setScraperRunning(false);
    }
  };

  const realWhois = async () => {
    if (!whoisDomain) return addLog('ERROR', 'Domena pusta');
    try {
      addLog('INFO', `[REAL] WHOIS: ${whoisDomain}`);
      const response = await fetch(`https://www.whoisxmlapi.com/whoisserver/WhoisService?apiKey=at_FREE&domainName=${whoisDomain}&outputFormat=JSON`);
      if (!response.ok) throw new Error('WHOIS API error');
      const data = await response.json();
      if (data.WhoisRecord) {
        const record = data.WhoisRecord;
        setWhoisResult({
          domain: whoisDomain,
          registrar: record.registrarName || 'Unknown',
          created: record.createdDate || 'Unknown',
          expires: record.expiresDate || 'Unknown',
          nameservers: record.nameServers?.hostNames || []
        });
        addLog('SUCCESS', 'WHOIS retrieved');
      }
    } catch (error) {
      addLog('ERROR', `WHOIS failed: ${error.message}`);
    }
  };

  const realGeoIP = async () => {
    if (!geoipIp) return addLog('ERROR', 'IP pusty');
    try {
      addLog('INFO', `[REAL] GeoIP: ${geoipIp}`);
      const response = await fetch(`https://ipapi.co/${geoipIp}/json/`);
      if (!response.ok) throw new Error('GeoIP API error');
      const data = await response.json();
      setGeoipResult({
        ip: geoipIp,
        country: data.country_name || 'Unknown',
        city: data.city || 'Unknown',
        isp: data.org || 'Unknown',
        coordinates: `${data.latitude}, ${data.longitude}`
      });
      addLog('SUCCESS', `GeoIP: ${data.country_name}, ${data.city}`);
    } catch (error) {
      addLog('ERROR', `GeoIP failed: ${error.message}`);
    }
  };

  const realPortScan = async () => {
    if (!portScanTarget) return addLog('ERROR', 'Target pusty');
    addLog('INFO', `[REAL] Port scan: ${portScanTarget}`);
    const ports = [80, 443, 22, 21, 3306];
    const results = [];
    for (const port of ports) {
      try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 2000);
        await fetch(`http://${portScanTarget}:${port}`, { mode: 'no-cors', signal: controller.signal });
        results.push({ port, status: 'LIKELY OPEN', service: port === 80 ? 'HTTP' : port === 443 ? 'HTTPS' : 'Unknown' });
      } catch (error) {
        results.push({ port, status: 'CLOSED/FILTERED', service: 'N/A' });
      }
    }
    setPortScanResults(results);
    addLog('SUCCESS', `Port scan done: ${results.length} ports checked`);
  };

  const realMediaAnalysis = async () => {
    if (!mediaUrl) return addLog('ERROR', 'URL obrazu pusty');
    try {
      addLog('INFO', `[REAL] AI analyzing: ${mediaUrl}`);
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'url', url: mediaUrl } },
              { type: 'text', text: 'Analyze this image' }
            ]
          }]
        })
      });
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json();
      const analysis = data.content.map(c => c.text).join('\n');
      setAiAnalysis(`[AI ANALYSIS]\n\n${analysis}`);
      addLog('SUCCESS', 'AI analysis completed');
    } catch (error) {
      addLog('ERROR', `AI failed: ${error.message}`);
    }
  };

  const exportJSON = (data, filename) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    addLog('SUCCESS', `Exported ${filename}`);
  };

  const tabs = [
    { id: 'scraper', name: 'Web Scraper', icon: Globe },
    { id: 'osint', name: 'OSINT', icon: Search },
    { id: 'media', name: 'AI Media', icon: Camera },
    { id: 'logs', name: 'Logs', icon: Terminal }
  ];

  return (
    <div className="min-h-screen bg-black text-green-400 font-mono relative overflow-hidden">
      <MatrixBackground />
      <div className="relative z-10 p-4">
        <div className="border-2 border-green-500 bg-black bg-opacity-90 p-4 mb-4">
          <h1 className="text-3xl font-bold text-center mb-2 animate-pulse">◢◤ MATRIX HACKER DASHBOARD ◥◣</h1>
          <p className="text-center text-sm text-green-600">[REAL TOOLS - NO SIMULATION] HIK!</p>
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 border-2 transition-all whitespace-nowrap ${
                activeTab === tab.id ? 'border-green-400 bg-green-900 bg-opacity-30 text-green-300' : 'border-green-700 hover:border-green-500 text-green-600'
              }`}>
              <tab.icon size={16} />{tab.name}
            </button>
          ))}
        </div>

        <div className="border-2 border-green-500 bg-black bg-opacity-90 p-4 min-h-96">
          {activeTab === 'scraper' && (
            <div>
              <h2 className="text-xl mb-4 flex items-center gap-2"><Globe /> WEB SCRAPER</h2>
              <input type="text" value={scraperUrl} onChange={(e) => setScraperUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full bg-black border-2 border-green-700 p-2 text-green-400 mb-3 outline-none" />
              <div className="flex gap-2 mb-3">
                <button onClick={realWebScraper} disabled={scraperRunning}
                  className="flex items-center gap-2 px-4 py-2 border-2 border-green-500 hover:bg-green-900 hover:bg-opacity-30 disabled:opacity-50">
                  <Play size={16} />{scraperRunning ? 'SCRAPING...' : 'START'}
                </button>
                {scraperResults.length > 0 && (
                  <button onClick={() => exportJSON(scraperResults, 'scraper.json')}
                    className="flex items-center gap-2 px-4 py-2 border-2 border-green-500 hover:bg-green-900 hover:bg-opacity-30">
                    <Download size={16} />EXPORT JSON
                  </button>
                )}
              </div>
              {scraperResults.length > 0 && (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {scraperResults.map((r, i) => (
                    <div key={i} className="border border-green-700 p-3">
                      <div className="font-bold text-green-300">[{r.type}]</div>
                      {r.title && <div className="text-sm">{r.title}</div>}
                      {r.text && <div className="text-xs mt-1">{r.text}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'osint' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg mb-2 flex items-center gap-2"><Info /> WHOIS</h3>
                <div className="flex gap-2 mb-2">
                  <input type="text" value={whoisDomain} onChange={(e) => setWhoisDomain(e.target.value)}
                    placeholder="example.com"
                    className="flex-1 bg-black border-2 border-green-700 p-2 text-green-400 outline-none" />
                  <button onClick={realWhois} className="px-4 py-2 border-2 border-green-500 hover:bg-green-900 hover:bg-opacity-30">
                    LOOKUP
                  </button>
                </div>
                {whoisResult && (
                  <div className="border border-green-700 p-3 text-sm space-y-1">
                    <div>Domain: {whoisResult.domain}</div>
                    <div>Registrar: {whoisResult.registrar}</div>
                    <div>Created: {whoisResult.created}</div>
                    <div>Expires: {whoisResult.expires}</div>
                    <div>NS: {whoisResult.nameservers.join(', ')}</div>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-lg mb-2 flex items-center gap-2"><Globe /> GeoIP</h3>
                <div className="flex gap-2 mb-2">
                  <input type="text" value={geoipIp} onChange={(e) => setGeoipIp(e.target.value)}
                    placeholder="8.8.8.8"
                    className="flex-1 bg-black border-2 border-green-700 p-2 text-green-400 outline-none" />
                  <button onClick={realGeoIP} className="px-4 py-2 border-2 border-green-500 hover:bg-green-900 hover:bg-opacity-30">
                    LOOKUP
                  </button>
                </div>
                {geoipResult && (
                  <div className="border border-green-700 p-3 text-sm space-y-1">
                    <div>IP: {geoipResult.ip}</div>
                    <div>Country: {geoipResult.country}</div>
                    <div>City: {geoipResult.city}</div>
                    <div>ISP: {geoipResult.isp}</div>
                    <div>Coords: {geoipResult.coordinates}</div>
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-lg mb-2 flex items-center gap-2"><Activity /> Port Scanner</h3>
                <div className="flex gap-2 mb-2">
                  <input type="text" value={portScanTarget} onChange={(e) => setPortScanTarget(e.target.value)}
                    placeholder="example.com"
                    className="flex-1 bg-black border-2 border-green-700 p-2 text-green-400 outline-none" />
                  <button onClick={realPortScan} className="px-4 py-2 border-2 border-green-500 hover:bg-green-900 hover:bg-opacity-30">
                    SCAN
                  </button>
                </div>
                {portScanResults.length > 0 && (
                  <div className="space-y-1">
                    {portScanResults.map((p, i) => (
                      <div key={i} className="border border-green-700 p-2 text-sm flex justify-between">
                        <span>Port {p.port} - {p.service}</span>
                        <span className={p.status.includes('OPEN') ? 'text-green-300' : 'text-yellow-600'}>{p.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'media' && (
            <div>
              <h2 className="text-xl mb-4 flex items-center gap-2"><Camera /> AI MEDIA ANALYZER</h2>
              <input type="text" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="w-full bg-black border-2 border-green-700 p-2 text-green-400 mb-3 outline-none" />
              <button onClick={realMediaAnalysis} disabled={!mediaUrl}
                className="px-4 py-2 border-2 border-green-500 hover:bg-green-900 hover:bg-opacity-30 disabled:opacity-50 mb-3">
                ANALYZE WITH AI
              </button>
              {aiAnalysis && (
                <div className="border border-green-700 p-3 whitespace-pre-wrap text-sm">{aiAnalysis}</div>
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div>
              <h2 className="text-xl mb-4 flex items-center gap-2"><Terminal /> SYSTEM LOGS</h2>
              <div className="border border-green-700 p-3 h-96 overflow-y-auto bg-black">
                {logs.length === 0 ? (
                  <div className="text-green-600 text-center">No logs yet...</div>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className="text-xs font-mono text-green-400 mb-1 border-l-2 border-green-500 pl-2">
                      <span className="text-green-600">[{log.timestamp}]</span>{' '}
                      <span className="text-green-300">{log.type}:</span> {log.message}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 border-2 border-green-500 bg-black bg-opacity-90 p-3 text-center text-sm">
          <div className="text-green-600">⚡ MATRIX DASHBOARD v1.0 - "There is no spoon" ⚡</div>
          <div className="text-green-700 text-xs mt-1">Real APIs | Zero simulation | HIK!</div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;