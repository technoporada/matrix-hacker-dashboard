const express = require('express');
const cheerio = require('cheerio');
const whois = require('whois');
const dns = require('dns').promises;
const geoip = require('geoip-lite');
const { exec, execFile } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const execFilePromise = util.promisify(execFile);
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const tls = require('tls');
const { WebSocketServer } = require('ws');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'history.json');
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const API_KEY = process.env.API_KEY || '';

let scans = [];

function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      scans = JSON.parse(raw);
      if (!Array.isArray(scans)) scans = [];
    }
  } catch (e) {
    scans = [];
  }
  console.log(`[DB] Loaded ${scans.length} records from ${path.basename(DB_PATH)}`);
}

function saveDB() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(scans, null, 2));
  } catch (e) {
    console.error(`[DB] Save error: ${e.message}`);
  }
}

loadDB();

function saveScan(type, target, results) {
  const id = crypto.randomUUID();
  const summary = typeof results === 'object' && results !== null
    ? JSON.stringify(results).substring(0, 200)
    : String(results).substring(0, 200);
  const record = {
    id, type, target, summary,
    results: JSON.stringify(results),
    created_at: new Date().toISOString(),
    notes: ''
  };
  scans.unshift(record);
  saveDB();
  return id;
}

function deleteScan(id) {
  const idx = scans.findIndex(s => s.id === id);
  if (idx === -1) return false;
  scans.splice(idx, 1);
  saveDB();
  return true;
}

function updateScanNotes(id, notes) {
  const s = scans.find(s => s.id === id);
  if (!s) return false;
  s.notes = String(notes);
  saveDB();
  return true;
}

function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[^a-zA-Z0-9.\-_:,]/g, '');
}

function isValidIP(str) {
  const parts = str.split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => {
    const n = parseInt(p, 10);
    return n >= 0 && n <= 255 && String(n) === p;
  });
}

function isValidDomain(str) {
  return /^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(str);
}

function isValidUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isPrivateHostname(hostname) {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') return true;
  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return true;
  const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipMatch) {
    const first = parseInt(ipMatch[1]);
    const second = parseInt(ipMatch[2]);
    if (first === 10) return true;
    if (first === 172 && second >= 16 && second <= 31) return true;
    if (first === 192 && second === 168) return true;
    if (first === 127) return true;
    if (first === 169 && second === 254) return true;
  }
  const lower = hostname.toLowerCase();
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
  if (lower === '0.0.0.0' || lower === '::' || lower === '0:0:0:0:0:0:0:0') return true;
  if (lower.startsWith('fc00:') || lower.startsWith('fd00:')) return true;
  if (lower.startsWith('fe80:')) return true;
  if (lower.startsWith('ff00:') || lower.startsWith('ff02:')) return true;
  return false;
}

async function resolveAndCheck(targetUrl) {
  const parsed = new URL(targetUrl);
  if (isPrivateHostname(parsed.hostname)) throw new Error('Private/internal targets not allowed');
  if (!isValidIP(parsed.hostname)) {
    try {
      const resolved = await dns.resolve4(parsed.hostname);
      for (const ip of resolved) {
        if (isPrivateHostname(ip)) throw new Error('Target resolves to private IP (DNS rebinding blocked)');
      }
    } catch (e) {
      if (e.message.includes('private IP')) throw e;
    }
  }
}

const PROXY_CHECK_HOSTS = new Set(['metadata.google.internal', '169.254.169.254']);

async function checkRedirect(urlStr) {
  try {
    const u = new URL(urlStr);
    if (isPrivateHostname(u.hostname)) {
      throw new Error('SSRF blocked: redirect to private IP');
    }
    if (PROXY_CHECK_HOSTS.has(u.hostname)) {
      throw new Error('SSRF blocked: redirect to cloud metadata endpoint');
    }
  } catch (e) {
    if (e.message.startsWith('SSRF blocked')) throw e;
  }
}

async function fetchWithRedirectCheck(url, options = {}) {
  const maxRedirects = options.maxRedirects || 10;
  let currentUrl = url;
  for (let i = 0; i <= maxRedirects; i++) {
    await checkRedirect(currentUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 10000);
    try {
      const res = await fetch(currentUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Matrix-Dashboard/2.0)', ...(options.headers || {}) },
        signal: controller.signal,
        redirect: 'manual'
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (location) {
          try {
            currentUrl = new URL(location, currentUrl).href;
          } catch {
            throw new Error(`Invalid redirect location: ${location.substring(0, 100)}`);
          }
          continue;
        }
      }
      const text = await res.text();
      return { data: text, headers: Object.fromEntries(res.headers.entries()), status: res.status };
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`Redirect loop (max ${maxRedirects})`);
}

function getSSLCert(host) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(443, host, { servername: host, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      resolve(cert);
    });
    socket.on('error', reject);
    socket.setTimeout(10000, () => { socket.destroy(); reject(new Error('SSL connection timeout')); });
  });
}

async function fetchText(url, options = {}) {
  const result = await fetchWithRedirectCheck(url, options);
  return result;
}

async function fetchJSON(url, options = {}) {
  const result = await fetchWithRedirectCheck(url, options);
  try {
    return { ...result, data: JSON.parse(result.data) };
  } catch {
    throw new Error(`Invalid JSON response from ${url}: ${result.data.substring(0, 100)}`);
  }
}

const TECH_SIGNATURES = [
  { name: 'WordPress', regex: /wp-content|wp-includes|wordpress/i, category: 'CMS' },
  { name: 'Joomla', regex: /joomla/i, category: 'CMS' },
  { name: 'Drupal', regex: /drupal/i, category: 'CMS' },
  { name: 'nginx', regex: /nginx/i, category: 'WebServer' },
  { name: 'Apache', regex: /apache/i, category: 'WebServer' },
  { name: 'Cloudflare', regex: /cloudflare/i, category: 'CDN' },
  { name: 'React', regex: /react|_next|reactroot/i, category: 'JS-Framework' },
  { name: 'Vue.js', regex: /vue\.js/i, category: 'JS-Framework' },
  { name: 'Angular', regex: /angular/i, category: 'JS-Framework' },
  { name: 'jQuery', regex: /jquery/i, category: 'JS-Library' },
  { name: 'Bootstrap', regex: /bootstrap/i, category: 'CSS-Framework' },
  { name: 'Tailwind', regex: /tailwind/i, category: 'CSS-Framework' },
  { name: 'Laravel', regex: /laravel/i, category: 'PHP-Framework' },
  { name: 'Symfony', regex: /symfony/i, category: 'PHP-Framework' },
  { name: 'Shopify', regex: /shopify|myshopify/i, category: 'Ecommerce' },
  { name: 'WooCommerce', regex: /woocommerce/i, category: 'Ecommerce' },
  { name: 'Magento', regex: /magento/i, category: 'Ecommerce' },
  { name: 'Django', regex: /django/i, category: 'Python-Framework' },
  { name: 'Flask', regex: /flask/i, category: 'Python-Framework' },
  { name: 'Node.js/Express', regex: /express|connect\.sess/i, category: 'Runtime' },
  { name: 'Tomcat', regex: /tomcat/i, category: 'AppServer' },
  { name: 'IIS', regex: /iis|asp\.net/i, category: 'WebServer' },
  { name: 'Caddy', regex: /caddy/i, category: 'WebServer' },
  { name: 'OpenResty', regex: /openresty/i, category: 'WebServer' },
  { name: 'Varnish', regex: /varnish/i, category: 'Cache' },
  { name: 'PHP', regex: /php/i, category: 'Language' },
  { name: 'Ruby on Rails', regex: /rails|ruby/i, category: 'Framework' },
  { name: 'Algolia', regex: /algolia/i, category: 'Search' },
  { name: 'Elasticsearch', regex: /elasticsearch/i, category: 'Search' },
  { name: 'Google Analytics', regex: /google-analytics|ga\.js/i, category: 'Analytics' },
  { name: 'Hotjar', regex: /hotjar/i, category: 'Analytics' },
  { name: 'Stripe', regex: /stripe/i, category: 'Payment' },
  { name: 'PayPal', regex: /paypal/i, category: 'Payment' },
  { name: 'Disqus', regex: /disqus/i, category: 'Comments' },
  { name: 'Font Awesome', regex: /font-awesome|fontawesome/i, category: 'Icons' },
  { name: 'Swagger', regex: /swagger|openapi/i, category: 'API' },
  { name: 'GraphQL', regex: /graphql/i, category: 'API' },
  { name: 'Socket.io', regex: /socket\.io/i, category: 'Realtime' },
  { name: 'Sentry', regex: /sentry/i, category: 'Error-Tracking' },
  { name: 'Matomo/Piwik', regex: /matomo|piwik/i, category: 'Analytics' },
];

function detectTech(html, headers) {
  const found = [];
  const text = html + ' ' + JSON.stringify(headers || {});
  for (const sig of TECH_SIGNATURES) {
    if (sig.regex.test(text)) {
      found.push({ name: sig.name, category: sig.category });
    }
  }
  const server = headers?.['server'] || '';
  if (server && !found.some(f => server.toLowerCase().includes(f.name.toLowerCase()))) {
    found.unshift({ name: server.split('/')[0], category: 'WebServer', version: server.split('/')[1] || '' });
  }
  const poweredBy = headers?.['x-powered-by'] || '';
  if (poweredBy && !found.some(f => poweredBy.toLowerCase().includes(f.name.toLowerCase()))) {
    found.push({ name: poweredBy, category: 'Tech' });
  }
  return [...new Map(found.map(f => [f.name, f])).values()];
}

const CVE_CACHE = new Map();

async function lookupCVE(query) {
  const keywords = ['nginx', 'apache', 'php', 'wordpress', 'joomla', 'drupal', 'openssh', 'mysql', 'postgresql'];
  const found = [];
  for (const kw of keywords) {
    if (!query.toLowerCase().includes(kw)) continue;
    const cacheKey = `cve_${kw}`;
    if (CVE_CACHE.has(cacheKey)) {
      found.push(...CVE_CACHE.get(cacheKey));
      continue;
    }
    try {
      const res = await fetchJSON(`https://cve.circl.lu/api/last/${kw}`, { timeout: 5000 });
      const cves = (res.data || []).slice(0, 5);
      const mapped = cves.map(c => ({
        id: c.id || 'Unknown',
        summary: (c.summary || '').substring(0, 200),
        cvss: c.cvss || 'N/A',
        published: c.published || '',
        link: `https://nvd.nist.gov/vuln/detail/${c.id}`
      }));
      CVE_CACHE.set(cacheKey, mapped);
      found.push(...mapped);
    } catch (e) {
      CVE_CACHE.set(cacheKey, []);
    }
  }
  return found;
}

const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'none'; img-src 'self' data:;");
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 60;
const rateCounts = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateCounts) {
    if (now - entry.reset > RATE_LIMIT_WINDOW * 2) rateCounts.delete(key);
  }
}, 60000).unref();

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = rateCounts.get(ip);
  if (!entry || now - entry.reset > RATE_LIMIT_WINDOW) {
    entry = { count: 0, reset: now + RATE_LIMIT_WINDOW };
    rateCounts.set(ip, entry);
  }
  entry.count++;
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT_MAX - entry.count));
  res.setHeader('X-RateLimit-Reset', Math.ceil(entry.reset / 1000));
  if (entry.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Too many requests - rate limit 60/min' });
  }
  next();
}

app.use(rateLimit);
app.use(express.json({ limit: '500kb' }));

app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  if (req.path.startsWith('/api/') && req.path !== '/api/health') {
    if (API_KEY) {
      const provided = req.headers['x-api-key'];
      if (provided !== API_KEY) {
        return res.status(401).json({ error: 'Unauthorized: invalid or missing X-API-Key header' });
      }
    }
  }
  next();
});

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});



app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '2.0' });
});

app.get('/api/stats', (req, res) => {
  const totalScans = scans.length;
  const byTypeMap = {};
  scans.forEach(s => { byTypeMap[s.type] = (byTypeMap[s.type] || 0) + 1; });
  const byType = Object.entries(byTypeMap).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
  const recentScans = scans.slice(0, 10).map(s => ({ id: s.id, type: s.type, target: s.target, created_at: s.created_at }));
  const topMap = {};
  scans.forEach(s => { topMap[s.target] = (topMap[s.target] || 0) + 1; });
  const topTargets = Object.entries(topMap).map(([target, count]) => ({ target, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  res.json({
    success: true,
    data: {
      total_scans: totalScans,
      scans_by_type: byType,
      recent_scans: recentScans,
      top_targets: topTargets,
      db_size: fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0
    }
  });
});

app.post('/api/scrape', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });
    if (!isValidUrl(url)) return res.status(400).json({ error: 'Invalid URL (must be http/https)' });
    await resolveAndCheck(url);
    console.log(`[SCRAPER] Starting: ${url}`);
    const response = await fetchText(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Matrix-Scraper/2.0' },
      timeout: 10000
    });
    const $ = cheerio.load(response.data);
    const hdrs = response.headers;
    const results = {
      url, title: $('title').text().trim(),
      meta: {
        description: $('meta[name="description"]').attr('content') || '',
        keywords: $('meta[name="keywords"]').attr('content') || '',
        author: $('meta[name="author"]').attr('content') || '',
        ogTitle: $('meta[property="og:title"]').attr('content') || '',
        ogImage: $('meta[property="og:image"]').attr('content') || ''
      },
      headings: [], paragraphs: [], links: [], images: [], scripts: [], emails: [], phones: [],
      technology_fingerprint: detectTech(response.data, hdrs),
      server_headers: {
        server: hdrs['server'] || '',
        powered_by: hdrs['x-powered-by'] || '',
        content_type: hdrs['content-type'] || ''
      }
    };
    $('h1, h2, h3, h4, h5, h6').each((i, el) => {
      const text = $(el).text().trim();
      if (text) results.headings.push({ tag: el.name, text, id: $(el).attr('id') || null });
    });
    $('p').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 20) results.paragraphs.push(text);
    });
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && !href.startsWith('#')) results.links.push({ text: text || 'No text', href, external: href.startsWith('http') && !href.includes(new URL(url).hostname) });
    });
    $('img[src]').each((i, el) => results.images.push({ src: $(el).attr('src'), alt: $(el).attr('alt') || 'No alt' }));
    $('script[src]').each((i, el) => results.scripts.push($(el).attr('src')));
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const bodyText = $('body').text();
    const emails = bodyText.match(emailRegex);
    if (emails) results.emails = [...new Set(emails)];
    const phoneRegex = /\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g;
    const phones = bodyText.match(phoneRegex);
    if (phones) results.phones = [...new Set(phones)];
    console.log(`[SCRAPER] Success: ${results.headings.length} headings, ${results.links.length} links`);
    const scanId = saveScan('scrape', url, results);
    res.json({ success: true, scan_id: scanId, data: results });
  } catch (error) {
    console.error(`[SCRAPER] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tech-fingerprint', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });
    if (!isValidUrl(url)) return res.status(400).json({ error: 'Invalid URL' });
    await resolveAndCheck(url);
    const response = await fetchText(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 Matrix-Fingerprint/1.0' },
      timeout: 10000
    });
    const tech = detectTech(response.data, response.headers);
    const scanId = saveScan('tech-fingerprint', url, { technologies: tech, headers: response.headers });
    res.json({ success: true, scan_id: scanId, data: { url, technologies: tech, headers: response.headers } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/cve-lookup', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });
    const cves = await lookupCVE(query);
    const scanId = saveScan('cve-lookup', query, { cves });
    res.json({ success: true, scan_id: scanId, data: { query, total: cves.length, cves } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/whois', async (req, res) => {
  try {
    let { domain } = req.body;
    if (!domain) return res.status(400).json({ error: 'Domain required' });
    domain = sanitizeInput(domain);
    if (!isValidDomain(domain)) return res.status(400).json({ error: 'Invalid domain format' });
    console.log(`[WHOIS] Looking up: ${domain}`);
    const whoisData = await new Promise((resolve, reject) => {
      whois.lookup(domain, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    const lines = whoisData.split('\n');
    const parsed = {};
    lines.forEach(line => {
      const match = line.match(/^([^:]+):\s*(.+)$/);
      if (match) {
        const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
        const value = match[2].trim();
        if (value) parsed[key] = value;
      }
    });
    const resultData = { raw: whoisData, parsed, domain };
    const scanId = saveScan('whois', domain, resultData);
    res.json({ success: true, scan_id: scanId, data: resultData });
  } catch (error) {
    console.error(`[WHOIS] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/geoip', async (req, res) => {
  try {
    let { ip } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP required' });
    ip = sanitizeInput(ip);
    if (!isValidIP(ip)) return res.status(400).json({ error: 'Invalid IP address format' });
    console.log(`[GEOIP] Looking up: ${ip}`);
    const geo = geoip.lookup(ip);
    let hostname = null;
    try {
      const hostnames = await dns.reverse(ip);
      hostname = hostnames[0] || null;
    } catch (e) {}
    const resultData = {
      ip, hostname,
      country: geo?.country || 'Unknown',
      region: geo?.region || 'Unknown',
      city: geo?.city || 'Unknown',
      ll: geo?.ll || [0, 0],
      timezone: geo?.timezone || 'Unknown',
      coordinates: geo?.ll ? `${geo.ll[0]}, ${geo.ll[1]}` : 'Unknown',
      org: 'N/A'
    };
    const scanId = saveScan('geoip', ip, resultData);
    res.json({ success: true, scan_id: scanId, data: resultData });
  } catch (error) {
    console.error(`[GEOIP] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/portscan', async (req, res) => {
  try {
    const { target, ports = '1-1000' } = req.body;
    if (!target) return res.status(400).json({ error: 'Target required' });
    const safeTarget = sanitizeInput(target);
    const safePorts = sanitizeInput(ports);
    if (!safeTarget || !safePorts) return res.status(400).json({ error: 'Invalid target or ports' });
    if (isPrivateHostname(safeTarget)) return res.status(400).json({ error: 'Private/internal targets not allowed' });
    console.log(`[PORTSCAN] Scanning ${safeTarget} ports ${safePorts}`);
    broadcast('progress', { scan: 'portscan', message: `Starting port scan: ${safeTarget} ports ${safePorts}...` });
    try { await execPromise('nmap --version'); } catch (e) {
      return res.status(500).json({ error: 'Nmap not installed. Install with: sudo apt install nmap' });
    }
    const nmapTargets = safeTarget.includes(',') ? safeTarget.split(',') : [safeTarget];
    broadcast('progress', { scan: 'portscan', message: `Running nmap on ${nmapTargets.join(' ')}...` });
    const { stdout } = await execFilePromise('nmap', ['-p', safePorts, ...nmapTargets, '-oG', '-']);
    const portRegex = /(\d+)\/open\/tcp/g;
    const openPorts = [];
    let match;
    while ((match = portRegex.exec(stdout)) !== null) openPorts.push(parseInt(match[1]));
    const serviceMap = {
      21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 80: 'HTTP',
      110: 'POP3', 143: 'IMAP', 443: 'HTTPS', 445: 'SMB', 3306: 'MySQL',
      3389: 'RDP', 5432: 'PostgreSQL', 5900: 'VNC', 8080: 'HTTP-Alt', 8443: 'HTTPS-Alt'
    };
    const results = openPorts.map(port => ({ port, status: 'OPEN', service: serviceMap[port] || 'Unknown' }));
    const resultData = { target: safeTarget, scanned_ports: safePorts, open_count: openPorts.length, results, raw_output: stdout };
    const scanId = saveScan('portscan', safeTarget, resultData);
    broadcast('progress', { scan: 'portscan', message: `Port scan done: ${openPorts.length} open ports found` });
    res.json({ success: true, scan_id: scanId, data: resultData });
  } catch (error) {
    console.error(`[PORTSCAN] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/subdomains', async (req, res) => {
  try {
    let { domain } = req.body;
    if (!domain) return res.status(400).json({ error: 'Domain required' });
    domain = sanitizeInput(domain);
    if (!isValidDomain(domain)) return res.status(400).json({ error: 'Invalid domain format' });
    console.log(`[SUBDOMAINS] Enumerating: ${domain}`);
    const commonSubs = [
      'www', 'mail', 'ftp', 'admin', 'api', 'blog', 'dev', 'test',
      'staging', 'prod', 'app', 'mobile', 'cdn', 'static', 'assets',
      'portal', 'web', 'shop', 'store', 'forum', 'vpn', 'remote',
      'vps', 'ns1', 'ns2', 'mx', 'smtp', 'pop', 'imap', 'webmail',
      'cpanel', 'whm', 'phpmyadmin', 'adminer', 'backup', 'git', 'jenkins',
      'kibana', 'grafana', 'prometheus', 'jira', 'confluence', 'wiki'
    ];
    const found = [];
    broadcast('progress', { scan: 'subdomains', message: `Enumerating subdomains for ${domain} (${commonSubs.length} candidates)...` });
    for (const sub of commonSubs) {
      const fullDomain = `${sub}.${domain}`;
      try {
        await dns.resolve4(fullDomain);
        found.push({ subdomain: fullDomain, exists: true });
        broadcast('progress', { scan: 'subdomains', message: `FOUND: ${fullDomain}` });
        console.log(`[SUBDOMAINS] Found: ${fullDomain}`);
      } catch (e) {
        broadcast('progress', { scan: 'subdomains', message: `NOT FOUND: ${fullDomain}` });
      }
    }
    broadcast('progress', { scan: 'subdomains', message: `Subdomain scan done: ${found.length} found` });
    const resultData = { domain, found_count: found.length, subdomains: found };
    const scanId = saveScan('subdomains', domain, resultData);
    res.json({ success: true, scan_id: scanId, data: resultData });
  } catch (error) {
    console.error(`[SUBDOMAINS] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ssl', async (req, res) => {
  try {
    let { domain } = req.body;
    if (!domain) return res.status(400).json({ error: 'Domain required' });
    domain = sanitizeInput(domain);
    if (!isValidDomain(domain)) return res.status(400).json({ error: 'Invalid domain format' });
    console.log(`[SSL] Checking: ${domain}`);
    const cert = await getSSLCert(domain);
    const fmtName = (obj) => obj ? Object.entries(obj).map(([k, v]) => `${k}=${v}`).join(', ') : 'Unknown';
    const resultData = {
      domain,
      issuer: fmtName(cert.issuer),
      subject: fmtName(cert.subject),
      valid_from: cert.valid_from || 'Unknown',
      valid_to: cert.valid_to || 'Unknown',
      raw: JSON.stringify(cert, null, 2)
    };
    const scanId = saveScan('ssl', domain, resultData);
    res.json({ success: true, scan_id: scanId, data: resultData });
  } catch (error) {
    console.error(`[SSL] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reverse-ip', async (req, res) => {
  try {
    let { ip } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP required' });
    ip = sanitizeInput(ip);
    if (!isValidIP(ip)) return res.status(400).json({ error: 'Invalid IP address format' });
    console.log(`[REVERSE-IP] Looking up: ${ip}`);
    const response = await fetchText(`https://api.hackertarget.com/reverseiplookup/?q=${ip}`, { timeout: 10000 });
    const domains = response.data.split('\n').filter(line => line && !line.startsWith('error'));
    const resultData = { ip, domain_count: domains.length, domains };
    const scanId = saveScan('reverse-ip', ip, resultData);
    res.json({ success: true, scan_id: scanId, data: resultData });
  } catch (error) {
    console.error(`[REVERSE-IP] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/full-recon', async (req, res) => {
  try {
    let { target } = req.body;
    if (!target) return res.status(400).json({ error: 'Target required' });
    target = sanitizeInput(target);
    if (!isValidDomain(target) && !isValidIP(target)) return res.status(400).json({ error: 'Invalid target format (domain or IP required)' });
    if (isPrivateHostname(target)) return res.status(400).json({ error: 'Private/internal targets not allowed' });
    console.log(`[FULL-RECON] Starting complete reconnaissance on: ${target}`);
    broadcast('progress', { scan: 'full-recon', message: `Starting full recon on ${target}...` });
    const results = {
      target, timestamp: new Date().toISOString(),
      whois: null, dns: null, geoip: null, subdomains: null, ssl: null, ports: null,
      technologies: [], cves: []
    };
    broadcast('progress', { scan: 'full-recon', message: 'Phase 1/8: WHOIS lookup...' });
    try {
      const whoisData = await new Promise((resolve, reject) => {
        whois.lookup(target, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });
      results.whois = { success: true, data: whoisData };
    } catch (e) { results.whois = { success: false, error: e.message }; }
    broadcast('progress', { scan: 'full-recon', message: 'Phase 2/8: DNS resolution...' });
    try {
      const ips = await dns.resolve4(target);
      results.dns = { success: true, ips };
      if (ips.length > 0) {
        const geo = geoip.lookup(ips[0]);
        results.geoip = { success: true, data: geo };
      }
    } catch (e) { results.dns = { success: false, error: e.message }; }
    broadcast('progress', { scan: 'full-recon', message: 'Phase 3/8: Subdomain enumeration...' });
    try {
      const commonSubs = ['www', 'mail', 'ftp', 'admin', 'api', 'dev', 'blog'];
      const found = [];
      for (const sub of commonSubs) {
        try { await dns.resolve4(`${sub}.${target}`); found.push(`${sub}.${target}`); } catch (e) {}
      }
      results.subdomains = { success: true, found };
    } catch (e) { results.subdomains = { success: false, error: e.message }; }
    broadcast('progress', { scan: 'full-recon', message: 'Phase 4/8: SSL certificate check...' });
    try {
      const cert = await getSSLCert(target);
      results.ssl = { success: true, data: `Subject: ${cert.subject ? Object.entries(cert.subject).map(([k, v]) => `${k}=${v}`).join(', ') : 'N/A'}\nIssuer: ${cert.issuer ? Object.entries(cert.issuer).map(([k, v]) => `${k}=${v}`).join(', ') : 'N/A'}\nNot Before: ${cert.valid_from || 'N/A'}\nNot After : ${cert.valid_to || 'N/A'}` };
    } catch (e) { results.ssl = { success: false, error: e.message }; }
    broadcast('progress', { scan: 'full-recon', message: 'Phase 5/8: Port scanning (22,80,443,8080,8443)...' });
    try {
      const { stdout } = await execFilePromise('nmap', ['-p', '22,80,443,8080,8443', target, '-oG', '-']);
      const portRegex = /(\d+)\/open\/tcp/g;
      const openPorts = [];
      let m;
      while ((m = portRegex.exec(stdout)) !== null) openPorts.push(parseInt(m[1]));
      results.ports = { success: true, open: openPorts };
    } catch (e) { results.ports = { success: false, error: e.message }; }
    broadcast('progress', { scan: 'full-recon', message: 'Phase 6/8: Technology fingerprinting...' });
    try {
      await resolveAndCheck(`https://${target}`);
      const response = await fetchText(`https://${target}`, { timeout: 8000 });
      results.technologies = detectTech(response.data, response.headers);
    } catch (e) { console.log(`[FULL-RECON] Tech scan skipped: ${e.message}`); }
    broadcast('progress', { scan: 'full-recon', message: 'Phase 7/8: CVE lookup...' });
    try { results.cves = await lookupCVE(target); } catch (e) {}
    broadcast('progress', { scan: 'full-recon', message: 'Phase 8/8: Saving results...' });
    const scanId = saveScan('full-recon', target, results);
    broadcast('progress', { scan: 'full-recon', message: `Full recon complete for ${target}` });
    console.log(`[FULL-RECON] Complete for: ${target}`);
    res.json({ success: true, scan_id: scanId, data: results });
  } catch (error) {
    console.error(`[FULL-RECON] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/local-ports', async (req, res) => {
  try {
    const { stdout } = await execPromise('ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null');
    const lines = stdout.split('\n').filter(l => l.trim());
    const header = lines[0];
    const data = lines.slice(1).map(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) return null;
      return {
        proto: parts[0],
        state: parts[1],
        recv_q: parts[2],
        send_q: parts[3],
        local: parts[4],
        peer: parts[5] || '-',
        process: parts.slice(6).join(' ') || '-'
      };
    }).filter(Boolean);
    res.json({ success: true, data: { header, count: data.length, ports: data } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/geoip/map', (req, res) => {
  try {
    const points = [];
    for (const scan of scans) {
      try {
        const parsed = JSON.parse(scan.results);
        let lat, lng, ip, country, city;
        if (scan.type === 'geoip' && parsed.ll) {
          lat = parsed.ll[0]; lng = parsed.ll[1];
          ip = parsed.ip; country = parsed.country; city = parsed.city;
        } else if (scan.type === 'full-recon' && parsed.geoip?.data?.ll) {
          lat = parsed.geoip.data.ll[0]; lng = parsed.geoip.data.ll[1];
          ip = parsed.geoip.data.ip || 'unknown';
          country = parsed.geoip.data.country; city = parsed.geoip.data.city;
        }
        if (lat != null && lng != null && lat !== 0 && lng !== 0) {
          points.push({ lat, lng, ip: ip || 'unknown', country: country || 'Unknown', city: city || 'Unknown', type: scan.type, target: scan.target, created_at: scan.created_at });
        }
      } catch (e) {}
    }
    res.json({ success: true, data: { total: points.length, points } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/history', (req, res) => {
  try {
    const { type, target, limit = 50, offset = 0 } = req.query;
    let filtered = scans;
    if (type) filtered = filtered.filter(s => s.type === type);
    if (target) filtered = filtered.filter(s => s.target.toLowerCase().includes(target.toLowerCase()));
    const total = filtered.length;
    const offsetNum = parseInt(offset);
    const limitNum = parseInt(limit);
    const page = filtered.slice(offsetNum, offsetNum + limitNum).map(s => ({
      id: s.id, type: s.type, target: s.target,
      summary: s.summary,
      preview: (s.results || '').substring(0, 100),
      created_at: s.created_at
    }));
    res.json({ success: true, data: { total, returned: page.length, scans: page } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/history/:id', (req, res) => {
  try {
    const row = scans.find(s => s.id === req.params.id);
    if (!row) return res.status(404).json({ error: 'Scan not found' });
    const out = { ...row };
    out.results = JSON.parse(row.results);
    res.json({ success: true, data: out });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/history/:id', (req, res) => {
  try {
    if (!deleteScan(req.params.id)) return res.status(404).json({ error: 'Scan not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/history/:id/notes', (req, res) => {
  try {
    const { notes } = req.body;
    if (notes === undefined) return res.status(400).json({ error: 'Notes required' });
    if (typeof notes !== 'string' || notes.length > 500) return res.status(400).json({ error: 'Notes max 500 characters' });
    if (!updateScanNotes(req.params.id, notes)) return res.status(404).json({ error: 'Scan not found' });
    res.json({ success: true, message: 'Notes updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/history/:id/report', (req, res) => {
  try {
    const row = scans.find(s => s.id === req.params.id);
    if (!row) return res.status(404).json({ error: 'Scan not found' });
    const data = JSON.parse(row.results);
    const html = generateReport(row, data);
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="report-${row.id}.html"`);
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function generateReport(row, data) {
  const prettyJson = JSON.stringify(data, null, 2);
  const date = escapeHtml(new Date(row.created_at).toLocaleString('pl-PL'));
  const scanType = escapeHtml(row.type.toUpperCase());
  const target = escapeHtml(row.target);
  const id = escapeHtml(row.id);
  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<title>MATRIX REPORT - ${scanType} - ${target}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #000; color: #0f0; font-family: 'Courier New', monospace; padding: 20px; }
  .container { max-width: 1200px; margin: 0 auto; }
  .header { border: 2px solid #0f0; padding: 20px; margin-bottom: 20px; text-align: center; }
  .header h1 { font-size: 24px; animation: pulse 2s infinite; }
  .header .meta { color: #0a0; font-size: 12px; margin-top: 10px; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.7; } }
  .section { border: 1px solid #0f0; padding: 15px; margin-bottom: 15px; }
  .section h2 { color: #0f0; font-size: 16px; margin-bottom: 10px; border-bottom: 1px solid #0f0; padding-bottom: 5px; }
  .section pre { background: #0a0a0a; padding: 10px; font-size: 11px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; color: #0f0; }
  .field { display: flex; padding: 4px 0; border-bottom: 1px solid #0a0a0a; }
  .field .label { color: #0f0; min-width: 150px; font-weight: bold; }
  .field .value { color: #0f0; flex: 1; }
  .badge { display: inline-block; border: 1px solid #0f0; padding: 2px 8px; margin: 2px; font-size: 11px; }
  .btn { display: inline-block; border: 1px solid #0f0; padding: 8px 16px; margin: 5px; color: #0f0; background: #000; cursor: pointer; font-family: monospace; text-decoration: none; }
  .btn:hover { background: #0f0; color: #000; }
  .footer { text-align: center; padding: 20px; color: #0a0; font-size: 11px; border-top: 1px solid #0a0; margin-top: 20px; }
  .matrix-rain { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; opacity: 0.03; z-index: -1; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>◢◤ MATRIX REPORT ◥◣</h1>
    <div class="meta">
      <div>TYPE: ${scanType}</div>
      <div>TARGET: ${target}</div>
      <div>DATE: ${date}</div>
      <div>ID: ${id}</div>
    </div>
  </div>
  <div style="text-align:center;margin-bottom:15px">
    <a href="#" onclick="window.print();return false;" class="btn">PRINT</a>
    <a href="data:text/json;charset=utf-8,${encodeURIComponent(prettyJson)}" download="data-${row.id}.json" class="btn">JSON</a>
  </div>
  <div class="section">
    <h2>SCAN DATA</h2>
    <pre>${escapeHtml(prettyJson)}</pre>
  </div>
  <div class="footer">
    MATRIX HACKER DASHBOARD v2.0 - Generated ${new Date().toISOString()}
  </div>
</div>
</body>
</html>`;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// WebSocket
let wss;
function broadcast(type, data) {
  if (!wss) return;
  const msg = JSON.stringify({ type, data });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

// Serve built frontend in production (for share.sh / cloudflare tunnel)
const distPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(distPath)) {
  app.get('/', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      res.sendFile(path.join(distPath, 'index.html'));
    }
  });
  console.log(`[STATIC] Serving frontend from ${distPath}`);
}

app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  res.status(500).json({ error: err.message });
});

const server = http.createServer(app);
wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  ws.on('close', () => console.log('[WS] Client disconnected'));
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║     MATRIX HACKER DASHBOARD - BACKEND API v2.0                  ║
║                                                                  ║
║     Status: ONLINE                                               ║
║     Port: ${PORT}                                                  ║
║     DB: ${path.basename(DB_PATH)}                                      ║
║     Dependencies: 5 (express, cheerio, whois, geoip-lite, ws)   ║
║     Zero optional deps - minimal attack surface                 ║
║                                                                  ║
║     NEW in v2.0:                                                 ║
║       JSON History - every scan auto-saved                       ║
║       HTML Report Export - standalone reports                    ║
║       Tech Fingerprint - 40+ technology signatures               ║
║       CVE Lookup - vulnerability database integration            ║
║       Dashboard Stats - scan analytics                           ║
║       Scan Notes - annotate your findings                        ║
║       Batch Port Scan targets (comma separated)                  ║
║       Removed: axios, cors, dotenv, better-sqlite3               ║
║       Replaced with: native fetch, manual CORS, JSON storage    ║
║                                                                  ║
║     Endpoints (20):                                              ║
║       POST /api/scrape            Web Scraper                    ║
║       POST /api/whois             WHOIS Lookup                   ║
║       POST /api/geoip             GeoIP + DNS                    ║
║       POST /api/portscan          Port Scanner (nmap)            ║
║       POST /api/subdomains        Subdomain Enum                 ║
║       POST /api/ssl               SSL Certificate Info           ║
║       POST /api/reverse-ip        Reverse IP Lookup              ║
║       POST /api/full-recon        Complete Reconnaissance        ║
║       POST /api/tech-fingerprint  Tech Stack Detection           ║
║       POST /api/cve-lookup        CVE Vulnerability Search       ║
║       GET  /api/history           List Scan History              ║
║       GET  /api/history/:id       Get Scan Detail                ║
║       GET  /api/history/:id/report HTML Report Download          ║
║       DELETE /api/history/:id     Delete Scan                    ║
║       PUT  /api/history/:id/notes  Update Notes                  ║
║       GET  /api/geoip/map         GeoIP Map Data                  ║
║       GET  /api/local-ports       Local Listening Ports            ║
║       GET  /api/stats             Dashboard Statistics            ║
║                                                                  ║
║     WebSocket live progress on /ws                               ║
║     Welcome to the Matrix. HIK!                                 ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
  `);
});
