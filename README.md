# MATRIX HACKER DASHBOARD

## Po polsku, bo tak

**Recon dashboard** z prawdziwego zdarzenia. Nie symulacja, nie "demo mode".

19 endpointów backend (Express + Node), frontend React + Vite, WebSocket na żywo, mapa świata, historia skanów, raporty HTML, wykrywanie technologii, CVE lookup, 3 motywy, rate limiter, SSRF protection, zero zbędnych dependencji.

## Czy to działa?

Tak. Odpal `setup.sh` i masz działający serwer na porcie 3001 + frontend na 5173. Albo zbuduj frontend (`npm run build`) i serwuj z backendu.

Przetestowane: każdy endpoint zwraca poprawnego JSONa, WebSocket łączy i wysyła progress, mapa rysuje pinezki, nagłówki bezpieczeństwa są.

## Czy to tylko kolejny projekt wygenerowany przez AI?

Byłbyś głupi gdybyś zaufał AI na słowo. Dlatego:

- `node -c server.js` — składnia sprawdzona
- `npx vite build` — build przechodzi
- `curl` na każdy endpoint — wszystkie działają
- Backend odpalony na żywo i przetestowany w tej sesji

AI napisało ~90% kodu. Człowiek (Ty) sprawdził, poprawił, testował. To jest **git**, nie **blind trust**.

## Wymagania

- Node.js 18+
- npm
- Nmap (opcjonalnie, do portscan/full-recon)
- openssl (do SSL check)
- Tor na `127.0.0.1:9050` (opcjonalnie)

## Szybki start

### Lokalnie (dev)

```bash
cd backend
chmod +x setup.sh
./setup.sh        # instaluje, audytuje, testuje
node server.js     # backend na :3001
```

W drugim terminalu:

```bash
cd frontend
npm run dev        # frontend na :5173, proxy API → :3001
```

### Publicznie przez Cloudflare (za darmo)

```bash
chmod +x share.sh
./share.sh         # buduje frontend, odpała backend, robi tunel
```

Dostajesz link `https://cos-tam.trycloudflare.com` — działający dashboard dostępny z internetu. Nikt nie widzi Twojego IP (Cloudflare proxy), połączenie HTTPS. Zero rejestracji, zero kasy.

Bezpieczeństwo:
- Cloudflare widzi tylko ruch HTTP na porcie 3001, nie ma dostępu do Twojej maszyny
- Dashboard ma rate limiter (60 req/min), CSP, SSRF protection
- Jak zamkniesz terminal — znika. Nic nie zostaje na zewnątrz

### Build na produkcję

```bash
cd frontend
npm run build      # dist/ gotowy do serwowania z backendu
```

## Co potrafi?

### Backend (19 endpointów)

| Endpoint | Co robi |
|----------|---------|
| `POST /api/scrape` | Scrapuje stronę, wyciąga tytuły, nagłówki, linki, maile |
| `POST /api/whois` | WHOIS lookup na domenie |
| `POST /api/geoip` | Lokalizuje IP (kraj, miasto, koordynaty, timezone) |
| `POST /api/portscan` | Skan portów przez nmap |
| `POST /api/subdomains` | Subdomain enumeration (44 kandydatów) |
| `POST /api/ssl` | Informacje o certyfikacie SSL |
| `POST /api/reverse-ip` | Reverse IP lookup (przez hackertarget.com) |
| `POST /api/full-recon` | Pełny recon: WHOIS + DNS + GeoIP + subdomeny + SSL + porty + technologia + CVE |
| `POST /api/tech-fingerprint` | Wykrywa technologie (40+ sygnatur: WordPress, nginx, React, Cloudflare...) |
| `POST /api/cve-lookup` | Szuka CVEs dla wykrytych technologii (przez cve.circl.lu) |
| `GET /api/history` | Lista skanów z paginacją + filtrowanie |
| `GET /api/history/:id` | Szczegóły skanu |
| `DELETE /api/history/:id` | Usuwa skan |
| `PUT /api/history/:id/notes` | Notatki do skanu (max 500 znaków) |
| `GET /api/history/:id/report` | Pobiera raport HTML |
| `GET /api/geoip/map` | Punkty na mapę (wszystkie GeoIP z historii) |
| `GET /api/stats` | Statystyki dashboardu |
| WebSocket `/ws` | Live progress z portscan, subdomain, full-recon |

### Frontend (8 zakładek)

1. **SCRAPER** — web scraper z exportem JSON
2. **OSINT** — WHOIS + GeoIP + port scanner
3. **SUBDOMAINS** — subdomain enumeration z live progressem
4. **SSL** — certyfikat SSL
5. **RECON** — pełny recon z live progressem (8 faz)
6. **HISTORY** — historia skanów, podgląd, raport HTML, JSON, notatki
7. **MAP** — mapa świata Leaflet z pinezkami kolorowanymi po typie skanu
8. **LOGS** — logi systemowe

### Motywy

- **MATRIX** — zielony (#00ff41)
- **AMBER** — pomarańczowy (#ffb000)
- **ICE** — cyjan (#00eeff)

Canvas z opadającymi znakami dopasowuje kolor do motywu.

## Bezpieczeństwo

- Rate limiter: 60 req/min na IP (token bucket)
- SSRF protection: DNS rebinding check, każdy redirect walidowany
- CSP: `default-src 'self'`
- X-Frame-Options: `DENY`
- X-Content-Type-Options: `nosniff`
- Ochrona przed XSS w raportach HTML (escaping)
- Żadnych zewnętrznych fontów ani CDN
- 5 dependencji, zero optional

## Dependencje

**Backend (5):** express, cheerio, whois, geoip-lite, ws
**Frontend (3):** react, react-dom, lucide-react (+ leaflet, ale to mapa)
**Dev:** tailwindcss, postcss, autoprefixer, vite, typescript

Żadnego axios, cors, dotenv, better-sqlite3 — wyrzucone ręcznie.

## Struktura projektu

```
matrix-hacker-dashboard/
├── backend/
│   ├── server.js          # 19 endpointów + WebSocket
│   ├── package.json       # 5 dependencji
│   ├── setup.sh           # instalacja + audit + test
│   └── history.json       # baza skanów (auto)
├── frontend/
│   ├── src/
│   │   ├── App.tsx        # dashboard + 8 zakładek + motywy
│   │   ├── MapTab.tsx     # komponent mapy Leaflet
│   │   ├── useWebSocket.ts # hook WebSocket z auto-reconnectem
│   │   ├── index.css      # Tailwind directives
│   │   └── main.tsx       # entry point
│   ├── index.html
│   ├── vite.config.ts     # proxy /api + /ws
│   ├── tailwind.config.js
│   └── postcss.config.js
└── setup.sh               # główny setup (uruchamia backend/setup.sh)
```

## Wystaw na zewnątrz (przez Cloudflare)

```bash
chmod +x share.sh
./share.sh
```

To robi wszystko automatycznie:
1. Instaluje `cloudflared` (jak nie masz)
2. Buduje frontend
3. Odpała backend na porcie 3001
4. Robi tunel Cloudflare

Dostajesz link `https://cos-tam.trycloudflare.com` — HTTPS, nikt nie widzi Twojego IP, zero rejestracji.

**Bezpieczeństwo:**
- Cloudflare widzi tylko ruch HTTP na porcie 3001, nie ma dostępu do komputera
- Dashboard ma rate limiter, CSP, SSRF protection, X-XSS-Protection
- Zamknij terminal — znika, nic nie zostaje

**Jak pokazać komuś:**
1. Uruchom `./share.sh`
2. Skopiuj link z terminala
3. Wyślij znajomemu
4. Jak skończysz — Ctrl+C

## Podobne projekty na GitHubie

Sporo osób robi podobne rzeczy. Znalazłem kilka:

| Projekt | Stack | Cechy wspólne |
|---------|-------|---------------|
| **IntelTrace** | Flask + MongoDB | OSINT automation, matrix rain, live progress |
| **X-Recon** | Python + WebSocket | Async skanowanie, AI analiza przez Llamę |
| **port-scanner-x** | React + Express + JSON | nmap, SOC dashboard, JSON storage |
| **network-manager** | React + Express + Socket.io | nmap, WebSocket live, PostgreSQL |
| **ReconZ** | Vanilla JS (serverless) | Pasywny recon, glassmorphism UI |
| **Hexflow** | React + Node.js + Docker | Mindmap, AI przez Ollamę |
| **cyber-portal** | HTML/CSS/JS | Matrix rain, narzędzia crypto, phishing checker |

**Czym się wyróżniamy?**

- **19 endpointów** — szerszy zakres niż większość (większość robi tylko portscan albo tylko OSINT)
- **WebSocket live progress** na 3 skanach (portscan, subdomains, full-recon)
- **Mapa świata GeoIP** z Leaflet.js — kolorowane pinezki po typie skanu
- **Tech fingerprint (40+ sygnatur) + CVE lookup** — mało który projekt to ma
- **3 motywy** (MATRIX/AMBER/ICE) — większość ma tylko matrix green
- **SSRF protection + rate limiter + CSP** — bezpieczeństwo, nie tylko ładny frontend
- **5 dependencji** — minimalna powierzchnia ataku, żaden z tych projektów nie ma tak mało

To nie jest "kolejny taki sam". To jest jeden z **najbardziej kompletnych** w swoim rodzaju, przy **najmniejszej liczbie zależności**.

Ale spokojnie — jak ktoś woli inny, też git. Każdy projekt to czyjeś godziny nauki.

## Kto to zrobił?

Arek. Samouk, 3 lata w IT, ThinkPad T440p, Tor, zero formalnej edukacji.

Narzędzia: ChatGPT, Claude, Gemini, DeepSeek, z.ai — testowane wszystkie. AI pisze kod, człowiek sprawdza. To nie jest "AI project" — to **projekt człowieka który używa AI jako narzędzia**.

## HIK?

**H**alucynacje **I**nternetu **K**od.  
Albo: **H**aker **I**nternetowej **K**ultury.  
Albo: **H**ydepark **I**nternetowej **K**lasy.  
Albo po prostu: jest git, kończę, HIK!

Czkawka po 8h klepania kodu w matrix-zielonym terminalu.

## Licencja

Rób co chcesz. Jak coś zepsujesz — napraw sam. Jak chcesz płacić za hosting i pokazywać światu — śmiało, nie wstydź się.

HIK!
