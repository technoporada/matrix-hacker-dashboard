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

Cloudflare tunnel: `./share.sh`

## Rzeczywisty stan

AI napisało ~90% kodu. Potem człowiek znalazł:

- AI wyłączyło TypeScript strict mode (`strict: false`) żeby przechodziło >100 błędów
- AI wymyśliło pole `geo?.org` w `geoip-lite` (nie istnieje, halucynacja)
- AI zostawiło martwy import `Camera` + dead config `VITE_ANTHROPIC_API_KEY`
- AI użyło `execFile('bash', ['-c', ...])` — command injection wektor
- Brak private IP check w portscan/full-recon (SSRF)
- `new URL(location)` bez try-catch (crash na malformed header)
- 154MB dysku zżera baza `geoip-lite` (dla jednego endpointa)
- CORS `.env.example` ma port 3001, kod ma 5173 — niespójne
- Full-recon ma 7 subdomen, standalone endpoint 44 — niespójne
- Full-recon ma 5 portów, standalone 1-1000 — niespójne

Wszystko naprawione. TypeScript strict: true, SSRF załatane, execFile bezpieczne, openssl zastąpiony `tls.connect()`.

## Zależności (faktyczne)

**Backend:** 5 w package.json, 142 po instalacji, 182MB (z czego 154MB to baza geoip-lite)
**Frontend:** 3 + dev, 101 po instalacji, 113MB

## License

MIT. Rób co chcesz.
