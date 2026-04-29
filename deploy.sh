#!/usr/bin/env bash
# =============================================================
# CallCenter Pro — One-Command Deployment Script
# Target: Ubuntu 22.04/24.04 LTS
# Supports: Domain (HTTPS) or IP-only (HTTP) mode
# =============================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err() { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     CallCenter Pro — Deployment Script     ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════╝${NC}"
echo ""

# --- Check root ---
if [[ $EUID -ne 0 ]]; then
  err "This script must be run as root (sudo bash deploy.sh)"
fi

# --- Deployment mode ---
echo "How do you want to access the app?"
echo "  1) Domain name (HTTPS with Let's Encrypt)"
echo "  2) IP address only (HTTP, for testing)"
read -rp "Select [1/2]: " DEPLOY_MODE

USE_DOMAIN=false
DOMAIN=""
LE_EMAIL=""

if [[ "$DEPLOY_MODE" == "1" ]]; then
  USE_DOMAIN=true
  read -rp "Enter your domain name (e.g., callcenter.example.com): " DOMAIN
  if [[ -z "$DOMAIN" ]]; then
    err "Domain name is required for mode 1"
  fi
  read -rp "Enter email for Let's Encrypt: " LE_EMAIL
  if [[ -z "$LE_EMAIL" ]]; then
    LE_EMAIL="admin@${DOMAIN}"
  fi
else
  info "IP-only mode selected — app will be served over HTTP"
fi

# --- Config ---
APP_DIR="/opt/callcenter"
DB_NAME="callcenter"
DB_USER="callcenter"
DB_PASS=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
ARI_PASS=$(openssl rand -hex 12)
AMI_PASS=$(openssl rand -hex 12)
TRUNK_KEY=$(openssl rand -hex 16)
EXTERNAL_IP=$(curl -s4 ifconfig.me || curl -s4 icanhazip.com || echo "0.0.0.0")

if [[ "$USE_DOMAIN" == true ]]; then
  info "Domain: $DOMAIN"
fi
info "External IP: $EXTERNAL_IP"
info "App directory: $APP_DIR"

# =============================================================
# 1. System Packages
# =============================================================
log "Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

log "Installing base packages..."
apt-get install -y -qq \
  build-essential curl wget git unzip \
  software-properties-common apt-transport-https \
  ca-certificates gnupg lsb-release \
  libssl-dev libncurses5-dev libjansson-dev \
  libxml2-dev libsqlite3-dev uuid-dev \
  libedit-dev pkg-config autoconf \
  unixodbc unixodbc-dev odbc-postgresql \
  certbot ufw

# =============================================================
# 2. Node.js 20 LTS
# =============================================================
if ! command -v node &>/dev/null; then
  log "Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
else
  log "Node.js already installed: $(node --version)"
fi

# Install PM2 globally
npm install -g pm2 2>/dev/null || true

# =============================================================
# 3. PostgreSQL 16
# =============================================================
if ! command -v psql &>/dev/null; then
  log "Installing PostgreSQL 16..."
  sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
  wget -qO - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add - 2>/dev/null
  apt-get update -qq
  apt-get install -y -qq postgresql-16
else
  log "PostgreSQL already installed"
fi

# Start PostgreSQL
systemctl enable postgresql
systemctl start postgresql

# Create database and user
log "Configuring PostgreSQL..."
sudo -u postgres psql -c "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

# =============================================================
# 4. Redis 7
# =============================================================
if ! command -v redis-server &>/dev/null; then
  log "Installing Redis..."
  apt-get install -y -qq redis-server
fi
systemctl enable redis-server
systemctl start redis-server

# =============================================================
# 5. Asterisk 20
# =============================================================
if ! command -v asterisk &>/dev/null; then
  log "Installing Asterisk 20 (this may take 15-20 minutes)..."
  cd /usr/src

  if [[ ! -d "asterisk-20-current" ]]; then
    ASTERISK_VER="20.11.0"
    wget -q "https://downloads.asterisk.org/pub/telephony/asterisk/asterisk-${ASTERISK_VER}.tar.gz" -O asterisk.tar.gz
    tar xzf asterisk.tar.gz
    mv asterisk-${ASTERISK_VER} asterisk-20-current
    rm asterisk.tar.gz
  fi

  cd asterisk-20-current

  # Install prerequisites
  contrib/scripts/get_mp3_source.sh 2>/dev/null || true
  contrib/scripts/install_prereq install 2>/dev/null || true

  # Configure with PJSIP, ODBC, and codec opus
  ./configure --with-jansson-bundled --with-pjproject-bundled 2>&1 | tail -5

  # Select modules
  make menuselect.makeopts
  menuselect/menuselect \
    --enable codec_opus \
    --enable res_odbc \
    --enable res_config_odbc \
    --enable app_mixmonitor \
    --enable app_amd \
    --enable res_http_websocket \
    --enable CORE-SOUNDS-EN-WAV \
    --enable MOH-OPSOUND-WAV \
    menuselect.makeopts 2>/dev/null || true

  make -j$(nproc) 2>&1 | tail -3
  make install 2>&1 | tail -3
  make samples 2>&1 | tail -3
  make config 2>&1 | tail -3

  # Create asterisk user
  useradd -r -s /sbin/nologin asterisk 2>/dev/null || true
  chown -R asterisk:asterisk /var/lib/asterisk /var/spool/asterisk /var/log/asterisk /var/run/asterisk /etc/asterisk

  cd /opt
  log "Asterisk installed successfully"
else
  log "Asterisk already installed: $(asterisk -V)"
fi

# Ensure recording directory exists
mkdir -p /var/spool/asterisk/monitor
chown asterisk:asterisk /var/spool/asterisk/monitor

# =============================================================
# 6. ODBC Configuration
# =============================================================
log "Configuring ODBC..."

# Find PostgreSQL ODBC driver
PG_ODBC_DRIVER=$(find /usr -name "psqlodbcw.so" 2>/dev/null | head -1)
if [[ -z "$PG_ODBC_DRIVER" ]]; then
  PG_ODBC_DRIVER=$(find /usr -name "psqlodbca.so" 2>/dev/null | head -1)
fi
if [[ -z "$PG_ODBC_DRIVER" ]]; then
  PG_ODBC_DRIVER="/usr/lib/x86_64-linux-gnu/odbc/psqlodbcw.so"
fi

cat > /etc/odbcinst.ini << EOF
[PostgreSQL]
Description = PostgreSQL ODBC driver
Driver = $PG_ODBC_DRIVER
Setup = /usr/lib/x86_64-linux-gnu/odbc/libodbcpsqlS.so
EOF

cat > /etc/odbc.ini << EOF
[asterisk]
Description = Asterisk PostgreSQL
Driver = PostgreSQL
Servername = localhost
Database = $DB_NAME
UserName = $DB_USER
Password = $DB_PASS
Port = 5432
Protocol = 9.0
ReadOnly = No
EOF

# =============================================================
# 7. SSL Certificate (domain mode only)
# =============================================================
if [[ "$USE_DOMAIN" == true ]]; then
  log "Obtaining SSL certificate..."
  systemctl stop nginx 2>/dev/null || true

  certbot certonly --standalone --non-interactive --agree-tos \
    --email "$LE_EMAIL" -d "$DOMAIN" 2>/dev/null || \
    warn "Certbot failed — you may need to configure DNS first. Continuing..."

  # Copy certs for Asterisk
  CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
  if [[ -d "$CERT_DIR" ]]; then
    mkdir -p /etc/asterisk/keys
    cp "$CERT_DIR/fullchain.pem" /etc/asterisk/keys/asterisk.pem
    cp "$CERT_DIR/privkey.pem" /etc/asterisk/keys/asterisk.key
    chown -R asterisk:asterisk /etc/asterisk/keys
    log "SSL certificates configured"
  else
    warn "SSL certificates not found — generating self-signed..."
    mkdir -p /etc/asterisk/keys
    mkdir -p "/etc/letsencrypt/live/$DOMAIN"
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout "/etc/letsencrypt/live/$DOMAIN/privkey.pem" \
      -out "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" \
      -subj "/CN=$DOMAIN" 2>/dev/null
    cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" /etc/asterisk/keys/asterisk.pem
    cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" /etc/asterisk/keys/asterisk.key
    chown -R asterisk:asterisk /etc/asterisk/keys
  fi
else
  log "Skipping SSL (IP-only mode)..."
  # Generate self-signed cert for Asterisk WSS
  mkdir -p /etc/asterisk/keys
  mkdir -p "/etc/letsencrypt/live/self-signed"
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "/etc/letsencrypt/live/self-signed/privkey.pem" \
    -out "/etc/letsencrypt/live/self-signed/fullchain.pem" \
    -subj "/CN=$EXTERNAL_IP" 2>/dev/null
  cp "/etc/letsencrypt/live/self-signed/fullchain.pem" /etc/asterisk/keys/asterisk.pem
  cp "/etc/letsencrypt/live/self-signed/privkey.pem" /etc/asterisk/keys/asterisk.key
  chown -R asterisk:asterisk /etc/asterisk/keys
  DOMAIN="$EXTERNAL_IP"
fi

# =============================================================
# 8. Deploy Application
# =============================================================
log "Deploying application..."
mkdir -p "$APP_DIR"

# Copy project files
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp -r "$SCRIPT_DIR"/* "$APP_DIR/" 2>/dev/null || true
cp "$SCRIPT_DIR"/.env.example "$APP_DIR/.env.example" 2>/dev/null || true

# Create .env
cat > "$APP_DIR/.env" << EOF
NODE_ENV=production
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASS=$DB_PASS
REDIS_URL=redis://localhost:6379
JWT_SECRET=$JWT_SECRET
ARI_URL=http://localhost:8088
ARI_USER=callcenter
ARI_PASS=$ARI_PASS
ARI_APP=callcenter
AMI_HOST=localhost
AMI_PORT=5038
AMI_USER=callcenter
AMI_PASS=$AMI_PASS
DOMAIN=$DOMAIN
RECORDING_PATH=/var/spool/asterisk/monitor
TRUNK_ENCRYPT_KEY=$TRUNK_KEY
EOF

# Install backend dependencies
cd "$APP_DIR"
npm install --production 2>&1 | tail -5

# Install and build frontend
cd "$APP_DIR/client"
npm install 2>&1 | tail -5
npm run build 2>&1 | tail -5

# =============================================================
# 9. Run Database Schema & Seed
# =============================================================
log "Setting up database schema..."
PGPASSWORD=$DB_PASS psql -h localhost -U $DB_USER -d $DB_NAME -f "$APP_DIR/server/db/schema.sql" 2>/dev/null || \
  warn "Schema may already exist (this is OK on re-deploy)"

log "Seeding database..."
cd "$APP_DIR"
node seed.js 2>&1 || warn "Seed may have already run"

# =============================================================
# 10. Configure Asterisk
# =============================================================
log "Configuring Asterisk..."

# Copy config files and substitute variables
for conf in pjsip.conf extensions.conf ari.conf http.conf manager.conf rtp.conf modules.conf res_odbc.conf extconfig.conf sorcery.conf; do
  if [[ -f "$APP_DIR/asterisk/$conf" ]]; then
    cp "$APP_DIR/asterisk/$conf" "/etc/asterisk/$conf"
  fi
done

# Substitute placeholders
sed -i "s/__DOMAIN__/$DOMAIN/g" /etc/asterisk/*.conf
sed -i "s/__EXTERNAL_IP__/$EXTERNAL_IP/g" /etc/asterisk/*.conf
sed -i "s/__ARI_PASS__/$ARI_PASS/g" /etc/asterisk/*.conf
sed -i "s/__AMI_PASS__/$AMI_PASS/g" /etc/asterisk/*.conf
sed -i "s/__DB_USER__/$DB_USER/g" /etc/asterisk/*.conf
sed -i "s/__DB_PASS__/$DB_PASS/g" /etc/asterisk/*.conf

chown -R asterisk:asterisk /etc/asterisk

# Restart Asterisk
systemctl enable asterisk 2>/dev/null || true
systemctl restart asterisk 2>/dev/null || \
  asterisk -g 2>/dev/null || warn "Could not start Asterisk — check logs"

# =============================================================
# 11. Configure NGINX
# =============================================================
log "Configuring NGINX..."
apt-get install -y -qq nginx

if [[ "$USE_DOMAIN" == true ]]; then
  # Domain mode: HTTPS config
  cp "$APP_DIR/nginx/callcenter.conf" /etc/nginx/sites-available/callcenter.conf
  sed -i "s/__DOMAIN__/$DOMAIN/g" /etc/nginx/sites-available/callcenter.conf
else
  # IP mode: HTTP-only config
  cp "$APP_DIR/nginx/callcenter-ip.conf" /etc/nginx/sites-available/callcenter.conf
fi

# Enable site
ln -sf /etc/nginx/sites-available/callcenter.conf /etc/nginx/sites-enabled/callcenter.conf
rm -f /etc/nginx/sites-enabled/default

# Test and restart
nginx -t 2>/dev/null && systemctl enable nginx && systemctl restart nginx

# =============================================================
# 12. Start Backend with PM2
# =============================================================
log "Starting backend with PM2..."
cd "$APP_DIR"
pm2 delete callcenter 2>/dev/null || true
pm2 start server/app.js --name callcenter --max-memory-restart 500M
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# =============================================================
# 13. Configure Firewall
# =============================================================
log "Configuring firewall..."
ufw --force reset 2>/dev/null || true
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp       # SSH
ufw allow 80/tcp       # HTTP
ufw allow 443/tcp      # HTTPS
ufw allow 8089/tcp     # Asterisk WSS
ufw allow 5060/udp     # SIP
ufw allow 5061/tcp     # SIP TLS
ufw allow 10000:20000/udp  # RTP
ufw --force enable

# =============================================================
# 14. Certbot auto-renewal (domain mode only)
# =============================================================
if [[ "$USE_DOMAIN" == true ]]; then
  log "Setting up certificate auto-renewal..."
  cat > /etc/cron.d/certbot-callcenter << 'EOF'
0 3 * * * root certbot renew --quiet --post-hook "systemctl reload nginx && cp /etc/letsencrypt/live/*/fullchain.pem /etc/asterisk/keys/asterisk.pem && cp /etc/letsencrypt/live/*/privkey.pem /etc/asterisk/keys/asterisk.key && asterisk -rx 'module reload res_http_websocket.so'"
EOF
fi

# =============================================================
# Done!
# =============================================================
if [[ "$USE_DOMAIN" == true ]]; then
  ACCESS_URL="https://${DOMAIN}"
else
  ACCESS_URL="http://${EXTERNAL_IP}"
fi

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         🎉 Deployment Complete!                       ║${NC}"
echo -e "${GREEN}╠═══════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║                                                       ║${NC}"
echo -e "${GREEN}║  URL:        ${ACCESS_URL}${NC}"
echo -e "${GREEN}║                                                       ║${NC}"
echo -e "${GREEN}║  Admin:      admin / admin123                         ║${NC}"
echo -e "${GREEN}║  Supervisor: supervisor / super123                    ║${NC}"
echo -e "${GREEN}║  Agent 1:    agent1 / agent123  (Ext: 101)            ║${NC}"
echo -e "${GREEN}║  Agent 2:    agent2 / agent123  (Ext: 102)            ║${NC}"
echo -e "${GREEN}║  Agent 3:    agent3 / agent123  (Ext: 103)            ║${NC}"
echo -e "${GREEN}║                                                       ║${NC}"
echo -e "${GREEN}║  DB Pass:    ${DB_PASS}         ║${NC}"
echo -e "${GREEN}║  JWT Secret: ${JWT_SECRET:0:20}...              ║${NC}"
echo -e "${GREEN}║                                                       ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""
if [[ "$USE_DOMAIN" == false ]]; then
  echo -e "${YELLOW}NOTE: Running in IP-only mode (HTTP).${NC}"
  echo -e "${YELLOW}WebRTC softphone requires HTTPS — it will not work in IP mode.${NC}"
  echo -e "${YELLOW}All other features (dashboard, campaigns, API) work fine over HTTP.${NC}"
  echo ""
fi
echo -e "${YELLOW}IMPORTANT: Change default passwords in production!${NC}"
echo -e "${CYAN}Logs: pm2 logs callcenter${NC}"
echo -e "${CYAN}Status: pm2 status${NC}"
echo -e "${CYAN}Asterisk CLI: asterisk -rvvv${NC}"
echo ""
