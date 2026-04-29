# CallCenter Pro

A production-ready, VICIdial-like call center system built with Asterisk 20+, Node.js, PostgreSQL, Redis, and React.

**Architecture:** Single monolith, single VPS deployment.

```
Browser (HTTPS) → NGINX → Node.js (API + WS + ARI + AMI + Dialer) → Asterisk 20+ → PSTN
                                    ↕                                      ↕
                              PostgreSQL + Redis                    SIP Trunks
```

## Quick Start

### One-Command Deployment (Ubuntu 22.04/24.04)

```bash
sudo bash deploy.sh
```

This will install and configure everything:
- Node.js 20 LTS
- PostgreSQL 16
- Redis 7
- Asterisk 20+ (compiled from source with PJSIP, ARI, ODBC)
- NGINX with HTTPS (Let's Encrypt)
- PM2 process manager

### After Deployment

1. Open `https://your-domain.com`
2. Login as **admin** / **admin123**
3. Navigate to Trunks → configure your SIP trunk
4. Navigate to Campaigns → create a campaign
5. Upload contacts CSV (columns: phone, first_name, last_name)
6. Start the campaign
7. Login as **agent1** / **agent123** → connect softphone → start taking calls

## Test Accounts

| Role | Username | Password | SIP Extension | Phone Type |
|------|----------|----------|---------------|------------|
| Admin | admin | admin123 | — | — |
| Supervisor | supervisor | super123 | — | — |
| Agent 1 | agent1 | agent123 | 101 | WebRTC (browser) |
| Agent 2 | agent2 | agent123 | 102 | WebRTC (browser) |
| Agent 3 | agent3 | agent123 | 103 | External SIP |

## External Softphone Setup

Agents with **External** phone type can use any standard SIP client:

- **Obeam / Eyebeam**
- **Zoiper**
- **MicroSIP**
- **Obeam / LinPhone**

### Configuration

| Setting | Value |
|---------|-------|
| SIP Server | Your VPS IP or domain |
| Port | 5060 (UDP) |
| Username | agent_10X (e.g., agent_103) |
| Password | Shown on agent creation |
| Codec | ulaw, alaw, opus |
| DTMF | RFC4733 |

Phone type can be switched per agent from **Admin → Users & Agents → Edit Agent Phone**.

## Features

- **SIP Trunk Management** — CRUD, Asterisk Realtime integration, health checks
- **Agent WebRTC Softphone** — SIP.js via WSS, mute/hold/transfer/DTMF
- **Campaign Dialer** — Blast, Progressive, Predictive modes
- **Call Recording** — MixMonitor, playback via UI
- **IVR Builder** — JSON-based flow editor
- **AMD** — Asterisk answering machine detection
- **Live Dashboard** — WebSocket real-time stats
- **Queue System (ACD)** — Ring strategies, agent assignment
- **JWT Authentication** — Admin/Supervisor/Agent roles

## Project Structure

```
├── server/                 # Node.js monolith
│   ├── app.js              # Entry point
│   ├── config/             # Environment config
│   ├── db/                 # PostgreSQL pool, Redis, schema
│   ├── middleware/         # Auth, RBAC, rate limiting
│   ├── modules/            # Feature modules
│   │   ├── auth/           # JWT authentication
│   │   ├── users/          # User management
│   │   ├── agents/         # Agent + SIP provisioning
│   │   ├── trunks/         # SIP trunk management
│   │   ├── campaigns/      # Campaign + contacts
│   │   ├── calls/          # CDR + recordings
│   │   ├── queues/         # ACD queues
│   │   ├── ivr/            # IVR flow builder
│   │   ├── dialer/         # Campaign dialer worker
│   │   └── realtime/       # WebSocket server
│   ├── ari/                # Asterisk ARI client
│   └── ami/                # Asterisk AMI client
├── client/                 # React + Vite + Tailwind
├── asterisk/               # Asterisk config templates
├── nginx/                  # NGINX config
├── deploy.sh               # One-command deployment
├── seed.js                 # Database seed script
└── .env.example            # Environment template
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/auth/login | Login, returns JWT |
| GET | /api/v1/health | Health check |
| GET/POST/PUT/DELETE | /api/v1/users | User CRUD |
| GET/POST/PUT/DELETE | /api/v1/agents | Agent CRUD |
| POST | /api/v1/agents/:id/status | Set agent status |
| GET/POST/PUT/DELETE | /api/v1/trunks | SIP trunk CRUD |
| POST | /api/v1/trunks/:id/health-check | Trunk health check |
| GET/POST/PUT/DELETE | /api/v1/campaigns | Campaign CRUD |
| POST | /api/v1/campaigns/:id/contacts/upload | CSV upload |
| POST | /api/v1/campaigns/:id/start | Start campaign |
| POST | /api/v1/campaigns/:id/pause | Pause campaign |
| POST | /api/v1/campaigns/:id/stop | Stop campaign |
| GET | /api/v1/calls | CDR list |
| GET | /api/v1/calls/:id/recording | Stream recording |
| GET/POST/PUT/DELETE | /api/v1/queues | Queue CRUD |
| GET/POST/PUT/DELETE | /api/v1/ivr | IVR flow CRUD |
| WS | /ws?token=JWT | Realtime WebSocket |

## Management Commands

```bash
# View logs
pm2 logs callcenter

# Restart backend
pm2 restart callcenter

# Asterisk CLI
asterisk -rvvv

# Check PJSIP endpoints
asterisk -rx 'pjsip show endpoints'

# Database access
psql -U callcenter -d callcenter

# Redis CLI
redis-cli
```

## Performance

- Handles 100+ concurrent calls on 8GB RAM
- Backend memory: < 500MB (PM2 auto-restart at 500MB)
- PostgreSQL: all key columns indexed
- Redis: live stats caching, agent state pub/sub
- Frontend: Vite production build, gzipped via NGINX

## Security

- HTTPS everywhere (Let's Encrypt with auto-renewal)
- WSS-only WebRTC
- SIP over TLS option
- JWT authentication with 24h expiry
- bcrypt password hashing (12 rounds)
- Rate limiting on all endpoints
- Encrypted trunk credentials (AES-128-CBC)
- UFW firewall configured
- AMI bound to localhost only

## Troubleshooting

**Asterisk won't start:**
```bash
asterisk -cvvv  # Start in console mode for debugging
```

**WebRTC not connecting:**
- Ensure SSL cert is valid: `openssl s_client -connect your-domain.com:8089`
- Check Asterisk HTTP: `asterisk -rx 'http show status'`

**No audio in calls:**
- Check RTP ports are open: `ufw status`
- Verify ICE: `asterisk -rx 'pjsip show endpoint agent_101'`

**Database issues:**
```bash
sudo -u postgres psql -c "\l"  # List databases
sudo -u postgres psql -d callcenter -c "\dt"  # List tables
```

## License

MIT
