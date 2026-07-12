# MATRIX HACKER DASHBOARD

Recon dashboard. 20 endpointów backend, React + Vite frontend, WebSocket live progress.

## Wymagania

- Node.js 20+
- npm
- Nmap (do portscan/full-recon)
- Tor na `127.0.0.1:9050` (opcjonalnie)

## Start

```bash
cd backend && npm install && node server.js    # :3001
cd frontend && npm run dev                     # :5173
```

Setup: `./setup.sh` — sprawdza Node, instaluje zależności, testuje backend.
Cloudflare tunnel: `./share.sh`

## Uwagi bezpieczeństwa

- Jeśli backend ma ustawione `API_KEY` w `.env`, wszystkie zapytania API muszą mieć nagłówek `X-API-Key` — ustaw `VITE_API_KEY` w `frontend/.env` na tę samą wartość
- Rate limiting aktywny (100 req/min na IP, trust proxy włączone dla Cloudflare)
- HSTS: `max-age=31536000; includeSubDomains`
- Private IP check dla wszystkich endpointów DNS (SSRF fix)
- Zero zewnętrznych API (żadnych calli do hackertarget.com, circl.lu itp.)
- Zero remote fontów — tylko `'Courier New', monospace`

## Zależności

**Backend:** 5 w package.json (express, cheerio, whois, geoip-lite, ws)
**Frontend:** React, Vite, leaflet — zero lucide-react, zero tailwindcss

## Licencja

Proprietary — niekomercyjna. Użycie w firmie >10 pracowników lub przychodzie >250k EUR wymaga zapłaty. Kary: 10k EUR/miesiąc naruszenia.
