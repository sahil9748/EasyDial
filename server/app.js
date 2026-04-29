const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');
const { apiLimiter } = require('./middleware/rateLimiter');
const authMiddleware = require('./middleware/auth');
const rbac = require('./middleware/rbac');

// Module routes
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const agentsRoutes = require('./modules/agents/agents.routes');
const trunksRoutes = require('./modules/trunks/trunks.routes');
const campaignsRoutes = require('./modules/campaigns/campaigns.routes');
const callsRoutes = require('./modules/calls/calls.routes');
const queuesRoutes = require('./modules/queues/queues.routes');
const ivrRoutes = require('./modules/ivr/ivr.routes');

// Core services
const ariClient = require('./ari/ariClient');
const amiClient = require('./ami/amiClient');
const dialerWorker = require('./modules/dialer/dialer.worker');
const realtimeServer = require('./modules/realtime/realtime.ws');
const { query } = require('./db/pool');
const { redis } = require('./db/redis');

// Express app
const app = express();

// Trust proxy (behind NGINX)
app.set('trust proxy', 1);

// Global middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: config.env === 'production' ? `https://${config.domain}` : '*',
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use('/api', apiLimiter);

// Health check (no auth)
app.get('/api/v1/health', async (req, res) => {
  try {
    await query('SELECT 1');
    const redisOk = redis.status === 'ready';
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: redisOk ? 'connected' : 'disconnected',
        ari: ariClient.connected ? 'connected' : 'disconnected',
        ami: amiClient.authenticated ? 'connected' : 'disconnected',
      },
    });
  } catch (err) {
    res.status(503).json({ status: 'error', error: err.message });
  }
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/agents', agentsRoutes);
app.use('/api/v1/trunks', trunksRoutes);
app.use('/api/v1/campaigns', campaignsRoutes);
app.use('/api/v1/calls', callsRoutes);
app.use('/api/v1/queues', queuesRoutes);
app.use('/api/v1/ivr', ivrRoutes);

// Dispositions endpoint
app.get('/api/v1/dispositions', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM dispositions WHERE active = true ORDER BY sort_order');
    res.json({ dispositions: result.rows });
  } catch (err) {
    logger.error('Dispositions error', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DNC endpoints
app.get('/api/v1/dnc', authMiddleware, rbac('admin', 'supervisor'), async (req, res) => {
  try {
    const result = await query('SELECT * FROM dnc_list ORDER BY created_at DESC LIMIT 500');
    res.json({ dncList: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/v1/dnc', authMiddleware, rbac('admin'), async (req, res) => {
  try {
    const { phone, reason } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone required' });
    const result = await query(
      'INSERT INTO dnc_list (phone, reason, added_by) VALUES ($1, $2, $3) ON CONFLICT (phone) DO NOTHING RETURNING *',
      [phone, reason || '', req.user.id]
    );
    res.status(201).json({ entry: result.rows[0] || { phone, message: 'Already in DNC' } });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve static frontend in production
if (config.env === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
    }
  });
}

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Create HTTP server
const server = http.createServer(app);

// Attach WebSocket
realtimeServer.attach(server);

// Start server
server.listen(config.port, '0.0.0.0', () => {
  logger.info(`Server running on port ${config.port} [${config.env}]`);

  // Connect to Asterisk
  ariClient.connect();
  amiClient.connect();

  // Start dialer worker
  dialerWorker.start();
});

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info(`${signal} received, shutting down gracefully...`);
  dialerWorker.stop();
  realtimeServer.shutdown();
  ariClient.disconnect();
  amiClient.disconnect();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason);
});

module.exports = app;
