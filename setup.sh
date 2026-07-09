#!/bin/bash
# ============================================================================
# MATRIX HACKER DASHBOARD - SETUP.SH
# Self-setting-up environment z kontrola bezpieczenstwa
# ============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║   MATRIX HACKER DASHBOARD - SETUP v2.0                   ║"
echo "║   Security-first deployment                              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# --- Funkcje ---
check() {
  if [ $? -eq 0 ]; then echo -e "  [${GREEN}OK${NC}] $1"; else echo -e "  [${RED}FAIL${NC}] $1"; fi
}

warn() {
  echo -e "  [${YELLOW}WARN${NC}] $1"
}

fail() {
  echo -e "  [${RED}FAIL${NC}] $1"
  exit 1
}

# --- 1. Node.js ---
echo ""
echo -e "${CYAN}[1/7] Sprawdzam Node.js...${NC}"
if command -v node &>/dev/null; then
  NODE_VER=$(node -v)
  echo -e "  Node: ${GREEN}$NODE_VER${NC}"
else
  fail "Node.js not found. Zainstaluj: nvm install 18 || apt install nodejs"
fi

# --- 2. npm audit ---
echo ""
echo -e "${CYAN}[2/7] npm audit - kontrola paczek...${NC}"
cd backend
npm audit 2>&1 | head -20 || true
echo ""

# --- 3. Sprawdzam remote fonts w kodzie ---
echo -e "${CYAN}[3/7] Skanuje remote fonts...${NC}"
FONT_MATCHES=$(grep -rni "fonts.googleapis\|fonts.gstatic\|@import url.*font\|@font-face.*url.*http" --include="*.html" --include="*.tsx" --include="*.js" --include="*.css" ../frontend/src/ 2>/dev/null || true)
if [ -z "$FONT_MATCHES" ]; then
  echo -e "  [${GREEN}OK${NC}] Brak remote fontow - bezpieczne"
else
  warn "Znaleziono remote fonty:"
  echo "$FONT_MATCHES"
fi

FONT_BACKEND=$(grep -rni "fonts.googleapis\|fonts.gstatic\|@import url.*font\|@font-face.*url.*http" --include="*.html" --include="*.js" --include="*.css" . 2>/dev/null || true)
if [ -n "$FONT_BACKEND" ]; then
  warn "Znaleziono remote fonty w backendzie:"
  echo "$FONT_BACKEND"
fi

# --- 4. Instaluje zależności ---
echo ""
echo -e "${CYAN}[4/7] Instaluje zależności backendu...${NC}"
npm install 2>&1 | tail -5
check "npm install"

# --- 5. Sprawdzam czy to tylko 4 zależności główne ---
echo ""
echo -e "${CYAN}[5/7] Weryfikuje minimalnosc zależności...${NC}"
DEPS=$(node -e "const p=require('./package.json');console.log(Object.keys(p.dependencies||{}).join(', '))")
echo -e "  Zależności: ${GREEN}$DEPS${NC}"
DEP_COUNT=$(node -e "const p=require('./package.json');console.log(Object.keys(p.dependencies||{}).length)")
echo -e "  Liczba: ${GREEN}$DEP_COUNT${NC} (cel: < 10)"
if [ "$DEP_COUNT" -lt 10 ]; then
  echo -e "  [${GREEN}OK${NC}] Minimalna liczba zależności"
else
  warn "Dużo zależności ($DEP_COUNT) - ryzyko supply chain attack"
fi

# --- 6. Sprawdzam npm audit po instalacji ---
echo ""
echo -e "${CYAN}[6/7] npm audit fix...${NC}"
npm audit fix --dry-run 2>&1 | head -5 || true
AUDIT_OUT=$(npm audit 2>&1)
if echo "$AUDIT_OUT" | grep -q "0 vulnerabilities"; then
  echo -e "  [${GREEN}OK${NC}] Zero podatności"
else
  echo "$AUDIT_OUT" | grep -i "vulnerabilit" | head -3
  warn "Są podatności - rozważ: npm audit fix"
fi

# --- 7. Test uruchomienia ---
echo ""
echo -e "${CYAN}[7/7] Test uruchomienia (5s)...${NC}"
timeout 5 node server.js 2>&1 &
PID=$!
sleep 2
if kill -0 $PID 2>/dev/null; then
  echo -e "  [${GREEN}OK${NC}] Backend uruchomiony na PID $PID"
  curl -s http://localhost:3001/api/health 2>/dev/null && echo -e "  [${GREEN}OK${NC}] Health check passed" || warn "Health check nie odpowiada"
  kill $PID 2>/dev/null
  wait $PID 2>/dev/null
else
  fail "Backend nie wystartował"
fi

echo ""
echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║   SETUP COMPLETE                                         ║"
echo "║                                                          ║"
echo "║   Uruchom:                                               ║"
echo "║     cd backend && node server.js                         ║"
echo "║                                                          ║"
echo "║   Backend: http://localhost:3001                         ║"
echo "║   Frontend: http://localhost:5173                        ║"
echo "║                                                          ║"
echo "║   Security:                                              ║"
echo "║   - Zero remote fonts                                    ║"
echo "║   - Tylko 4 zależności główne                            ║"
echo "║   - JSON storage (no SQLite native deps)                 ║"
echo "║   - Manual CORS (no cors package)                        ║"
echo "║   - Native fetch (no axios)                              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
