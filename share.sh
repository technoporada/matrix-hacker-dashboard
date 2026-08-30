#!/bin/bash
# ============================================================================
# MATRIX HACKER DASHBOARD - SHARE.SH
# Buduje frontend, odpała backend + Cloudflare Tunnel
# Zero kasy. Zero konfiguracji. Działa od razu.
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║   MATRIX HACKER DASHBOARD - SHARE v1.0                   ║"
echo "║   Wystaw swój dashboard na zewnątrz przez Cloudflare     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# --- 1. Cloudflared ---
echo -e "${CYAN}[1/4] Cloudflared...${NC}"
if command -v cloudflared &>/dev/null; then
  echo -e "  [${GREEN}OK${NC}] cloudflared $(cloudflared --version 2>&1 | head -1)"
else
  echo -e "  [${YELLOW}INFO${NC}] Instaluje cloudflared..."
  ARCH=$(uname -m)
  if [ "$ARCH" = "x86_64" ]; then
    curl -sL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared
  elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    curl -sL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 -o /tmp/cloudflared
  else
    echo -e "  [${RED}ERROR${NC}] Nieznana architektura: $ARCH"
    exit 1
  fi
  chmod +x /tmp/cloudflared
  sudo mv /tmp/cloudflared /usr/local/bin/cloudflared
  echo -e "  [${GREEN}OK${NC}] cloudflared zainstalowany"
fi

# --- 2. Buduję frontend ---
echo ""
echo -e "${CYAN}[2/4] Buduję frontend...${NC}"
cd "$SCRIPT_DIR/frontend"
npm run build 2>&1 | tail -5
echo -e "  [${GREEN}OK${NC}] Frontend zbudowany"

# --- 3. Odpalam backend ---
echo ""
echo -e "${CYAN}[3/4] Odpalam backend na port 3001...${NC}"
cd "$SCRIPT_DIR/backend"
node server.js &
SERVER_PID=$!
sleep 2

if kill -0 $SERVER_PID 2>/dev/null; then
  echo -e "  [${GREEN}OK${NC}] Backend PID $SERVER_PID"
else
  echo -e "  [${RED}ERROR${NC}] Backend nie wystartował"
  exit 1
fi

# --- 4. Cloudflare Tunnel ---
echo ""
echo -e "${CYAN}[4/4] Cloudflare Tunnel...${NC}"
echo ""
echo -e "  ${YELLOW}Twój publiczny link pojawi się poniżej za chwilę:${NC}"
echo -e "  ${YELLOW}Naciśnij Ctrl+C żeby zamknąć wszystko.${NC}"
echo ""
echo -e "  ${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "  ${GREEN}║  LINK DO DASHBOARDA (wyślij komuś chcesz):         ║${NC}"
echo -e "  ${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

cloudflared tunnel --url http://localhost:3001

# Cleanup
kill $SERVER_PID 2>/dev/null
echo -e "  [${GREEN}OK${NC}] Zakończono"
