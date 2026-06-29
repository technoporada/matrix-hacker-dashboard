// ============================================================================
// 🔥 MATRIX HACKER DASHBOARD - BACKEND API (Node.js + Express)
// ============================================================================
// INSTALACJA: npm install express cors axios cheerio whois dns geoip-lite
// RUN: node server.js
// PORT: 3001 (zmień jeśli potrzebujesz)
// ============================================================================

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const whois = require('whois');
const dns = require('dns').promises;
const geoip = require('geoip-lite');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
const PORT = 3001;

// ============================================================================
// MIDDLEWARE
// ============================================================================
app.use(cors());
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// 🌐 WEB SCRAPER - BYPASS CORS, ADVANCED PARSING
// ============================================================================
app.post('/api/scrape', async (req, res) => {
  try {
    const { url, depth = 1, followLinks = false } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }

    console.log(`[SCRAPER] Starting: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Matrix-Scraper/2.0'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    
    const results = {
      url: url,
      title: $('title').text().trim(),
      meta: {
        description: $('meta[name="description"]').attr('content') || '',
        keywords: $('meta[name="keywords"]').attr('content') || '',
        author: $('meta[name="author"]').attr('content') || '',
        ogTitle: $('meta[property="og:title"]').attr('content') || '',
        ogImage: $('meta[property="og:image"]').attr('content') || ''
      },
      headings: [],
      paragraphs: [],
      links: [],
      images: [],
      scripts: [],
      emails: [],
      phones: []
    };

    // Extract headings
    $('h1, h2, h3, h4, h5, h6').each((i, el) => {
      const text = $(el).text().trim();
      if (text) {
        results.headings.push({
          tag: el.name,
          text: text,
          id: $(el).attr('id') || null
        });
      }
    });

    // Extract paragraphs
    $('p').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 20) {
        results.paragraphs.push(text);
      }
    });

    // Extract links
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && !href.startsWith('#')) {
        results.links.push({
          text: text || 'No text',
          href: href,
          external: href.startsWith('http') && !href.includes(new URL(url).hostname)
        });
      }
    });

    // Extract images
    $('img[src]').each((i, el) => {
      results.images.push({
        src: $(el).attr('src'),
        alt: $(el).attr('alt') || 'No alt'
      });
    });

    // Extract scripts
    $('script[src]').each((i, el) => {
      results.scripts.push($(el).attr('src'));
    });

    // Extract emails (regex)
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const bodyText = $('body').text();
    const emails = bodyText.match(emailRegex);
    if (emails) {
      results.emails = [...new Set(emails)];
    }

    // Extract phones (simple regex)
    const phoneRegex = /\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g;
    const phones = bodyText.match(phoneRegex);
    if (phones) {
      results.phones = [...new Set(phones)];
    }

    console.log(`[SCRAPER] Success: ${results.headings.length} headings, ${results.links.length} links`);
    res.json({ success: true, data: results });

  } catch (error) {
    console.error(`[SCRAPER] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 🔍 WHOIS - FULL DATA
// ============================================================================
app.post('/api/whois', async (req, res) => {
  try {
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain required' });
    }

    console.log(`[WHOIS] Looking up: ${domain}`);

    const whoisData = await new Promise((resolve, reject) => {
      whois.lookup(domain, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    // Parse WHOIS data
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

    res.json({ 
      success: true, 
      data: {
        raw: whoisData,
        parsed: parsed,
        domain: domain
      }
    });

  } catch (error) {
    console.error(`[WHOIS] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 🌍 GeoIP + DNS + ADVANCED RECON
// ============================================================================
app.post('/api/geoip', async (req, res) => {
  try {
    const { ip } = req.body;
    
    if (!ip) {
      return res.status(400).json({ error: 'IP required' });
    }

    console.log(`[GEOIP] Looking up: ${ip}`);

    const geo = geoip.lookup(ip);
    
    // DNS reverse lookup
    let hostname = null;
    try {
      const hostnames = await dns.reverse(ip);
      hostname = hostnames[0] || null;
    } catch (e) {
      console.log(`[GEOIP] No reverse DNS for ${ip}`);
    }

    res.json({
      success: true,
      data: {
        ip: ip,
        hostname: hostname,
        country: geo?.country || 'Unknown',
        region: geo?.region || 'Unknown',
        city: geo?.city || 'Unknown',
        ll: geo?.ll || [0, 0],
        timezone: geo?.timezone || 'Unknown',
        coordinates: geo?.ll ? `${geo.ll[0]}, ${geo.ll[1]}` : 'Unknown'
      }
    });

  } catch (error) {
    console.error(`[GEOIP] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 🔌 PORT SCANNER - REAL TCP CONNECTIONS (requires nmap)
// ============================================================================
app.post('/api/portscan', async (req, res) => {
  try {
    const { target, ports = '1-1000' } = req.body;
    
    if (!target) {
      return res.status(400).json({ error: 'Target required' });
    }

    console.log(`[PORTSCAN] Scanning ${target} ports ${ports}`);

    // Check if nmap is installed
    try {
      await execPromise('nmap --version');
    } catch (e) {
      return res.status(500).json({ 
        error: 'Nmap not installed. Install with: sudo apt install nmap (Linux) or brew install nmap (Mac)'
      });
    }

    // Run nmap
    const { stdout } = await execPromise(`nmap -p ${ports} ${target} -oG -`);
    
    // Parse nmap output
    const portRegex = /(\d+)\/open\/tcp/g;
    const openPorts = [];
    let match;
    
    while ((match = portRegex.exec(stdout)) !== null) {
      openPorts.push(parseInt(match[1]));
    }

    // Get service names
    const serviceMap = {
      21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP',
      53: 'DNS', 80: 'HTTP', 110: 'POP3', 143: 'IMAP',
      443: 'HTTPS', 445: 'SMB', 3306: 'MySQL', 3389: 'RDP',
      5432: 'PostgreSQL', 5900: 'VNC', 8080: 'HTTP-Alt', 8443: 'HTTPS-Alt'
    };

    const results = openPorts.map(port => ({
      port: port,
      status: 'OPEN',
      service: serviceMap[port] || 'Unknown'
    }));

    res.json({
      success: true,
      data: {
        target: target,
        scanned_ports: ports,
        open_count: openPorts.length,
        results: results,
        raw_output: stdout
      }
    });

  } catch (error) {
    console.error(`[PORTSCAN] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 🎯 SUBDOMAIN ENUMERATION
// ============================================================================
app.post('/api/subdomains', async (req, res) => {
  try {
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain required' });
    }

    console.log(`[SUBDOMAINS] Enumerating: ${domain}`);

    // Common subdomains to check
    const commonSubs = [
      'www', 'mail', 'ftp', 'admin', 'api', 'blog', 'dev', 'test', 
      'staging', 'prod', 'app', 'mobile', 'cdn', 'static', 'assets',
      'portal', 'web', 'shop', 'store', 'forum', 'vpn', 'remote'
    ];

    const found = [];
    
    for (const sub of commonSubs) {
      const fullDomain = `${sub}.${domain}`;
      try {
        await dns.resolve4(fullDomain);
        found.push({ subdomain: fullDomain, exists: true });
        console.log(`[SUBDOMAINS] Found: ${fullDomain}`);
      } catch (e) {
        // Subdomain doesn't exist
      }
    }

    res.json({
      success: true,
      data: {
        domain: domain,
        found_count: found.length,
        subdomains: found
      }
    });

  } catch (error) {
    console.error(`[SUBDOMAINS] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 🔐 SSL/TLS CERTIFICATE INFO
// ============================================================================
app.post('/api/ssl', async (req, res) => {
  try {
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain required' });
    }

    console.log(`[SSL] Checking: ${domain}`);

    const { stdout } = await execPromise(`echo | openssl s_client -connect ${domain}:443 -servername ${domain} 2>/dev/null | openssl x509 -noout -text`);
    
    // Parse certificate info
    const issuerMatch = stdout.match(/Issuer: (.+)/);
    const validFromMatch = stdout.match(/Not Before: (.+)/);
    const validToMatch = stdout.match(/Not After : (.+)/);
    const subjectMatch = stdout.match(/Subject: (.+)/);

    res.json({
      success: true,
      data: {
        domain: domain,
        issuer: issuerMatch ? issuerMatch[1].trim() : 'Unknown',
        subject: subjectMatch ? subjectMatch[1].trim() : 'Unknown',
        valid_from: validFromMatch ? validFromMatch[1].trim() : 'Unknown',
        valid_to: validToMatch ? validToMatch[1].trim() : 'Unknown',
        raw: stdout
      }
    });

  } catch (error) {
    console.error(`[SSL] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 🎯 REVERSE IP LOOKUP (domains on same IP)
// ============================================================================
app.post('/api/reverse-ip', async (req, res) => {
  try {
    const { ip } = req.body;
    
    if (!ip) {
      return res.status(400).json({ error: 'IP required' });
    }

    console.log(`[REVERSE-IP] Looking up: ${ip}`);

    // Use HackerTarget API (free, no key needed)
    const response = await axios.get(`https://api.hackertarget.com/reverseiplookup/?q=${ip}`);
    
    const domains = response.data.split('\n').filter(line => line && !line.startsWith('error'));

    res.json({
      success: true,
      data: {
        ip: ip,
        domain_count: domains.length,
        domains: domains
      }
    });

  } catch (error) {
    console.error(`[REVERSE-IP] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 🔥 ASY W RĘKAWIE - MULTI-TOOL SCAN
// ============================================================================
app.post('/api/full-recon', async (req, res) => {
  try {
    const { target } = req.body;
    
    if (!target) {
      return res.status(400).json({ error: 'Target required' });
    }

    console.log(`[FULL-RECON] Starting complete reconnaissance on: ${target}`);

    const results = {
      target: target,
      timestamp: new Date().toISOString(),
      whois: null,
      dns: null,
      geoip: null,
      subdomains: null,
      ssl: null,
      ports: null
    };

    // 1. WHOIS
    try {
      const whoisData = await new Promise((resolve, reject) => {
        whois.lookup(target, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });
      results.whois = { success: true, data: whoisData };
    } catch (e) {
      results.whois = { success: false, error: e.message };
    }

    // 2. DNS Resolution
    try {
      const ips = await dns.resolve4(target);
      results.dns = { success: true, ips: ips };
      
      // 3. GeoIP for first IP
      if (ips.length > 0) {
        const geo = geoip.lookup(ips[0]);
        results.geoip = { success: true, data: geo };
      }
    } catch (e) {
      results.dns = { success: false, error: e.message };
    }

    // 4. Subdomain enumeration (limited)
    try {
      const commonSubs = ['www', 'mail', 'ftp', 'admin', 'api'];
      const found = [];
      for (const sub of commonSubs) {
        try {
          await dns.resolve4(`${sub}.${target}`);
          found.push(`${sub}.${target}`);
        } catch (e) {}
      }
      results.subdomains = { success: true, found: found };
    } catch (e) {
      results.subdomains = { success: false, error: e.message };
    }

    // 5. SSL Check
    try {
      const { stdout } = await execPromise(`echo | openssl s_client -connect ${target}:443 -servername ${target} 2>/dev/null | openssl x509 -noout -dates`);
      results.ssl = { success: true, data: stdout };
    } catch (e) {
      results.ssl = { success: false, error: e.message };
    }

    console.log(`[FULL-RECON] Complete for: ${target}`);
    res.json({ success: true, data: results });

  } catch (error) {
    console.error(`[FULL-RECON] Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 🚀 SERVER START
// ============================================================================
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║     🔥 MATRIX HACKER DASHBOARD - BACKEND API 🔥           ║
║                                                            ║
║     Status: ONLINE                                         ║
║     Port: ${PORT}                                            ║
║     CORS: ENABLED                                          ║
║     Endpoints:                                             ║
║       POST /api/scrape        - Web Scraper                ║
║       POST /api/whois         - WHOIS Lookup               ║
║       POST /api/geoip         - GeoIP + DNS                ║
║       POST /api/portscan      - Port Scanner (nmap)        ║
║       POST /api/subdomains    - Subdomain Enum             ║
║       POST /api/ssl           - SSL Certificate Info       ║
║       POST /api/reverse-ip    - Reverse IP Lookup          ║
║       POST /api/full-recon    - Complete Reconnaissance    ║
║                                                            ║
║     Welcome to the Matrix. HIK! 🔥                        ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});

// ============================================================================
// ERROR HANDLER
// ============================================================================
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  res.status(500).json({ error: err.message });
});

// ============================================================================
// END OF BACKEND - DEPLOY AND CONQUER! 🔥
// ============================================================================