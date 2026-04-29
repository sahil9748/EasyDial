const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const { redis, redisSub } = require('../../db/redis');
const { query } = require('../../db/pool');
const logger = require('../../utils/logger');

class RealtimeServer {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // ws -> { userId, role, agentId }
    this.statsInterval = null;
  }

  attach(server) {
    this.wss = new WebSocket.Server({ server, path: '/ws' });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    // Subscribe to Redis channels
    redisSub.subscribe('agent:status', 'call:ended', 'campaign:update', (err) => {
      if (err) logger.error('Redis subscribe error', err);
    });

    redisSub.on('message', (channel, message) => {
      this.broadcastToAll({ type: channel, data: JSON.parse(message) });
    });

    // Broadcast stats every 2 seconds
    this.statsInterval = setInterval(() => this.broadcastStats(), 2000);

    logger.info('Realtime WebSocket server attached');
  }

  handleConnection(ws, req) {
    // Authenticate via query param or first message
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (token) {
      try {
        const decoded = jwt.verify(token, config.jwt.secret);
        this.clients.set(ws, { userId: decoded.id, role: decoded.role, agentId: decoded.agentId });
        ws.send(JSON.stringify({ type: 'authenticated', data: { userId: decoded.id } }));
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'Invalid token' } }));
        ws.close();
        return;
      }
    } else {
      ws.send(JSON.stringify({ type: 'error', data: { message: 'Token required' } }));
      ws.close();
      return;
    }

    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        this.handleMessage(ws, data);
      } catch (err) {
        // Ignore parse errors
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
    });

    ws.on('error', () => {
      this.clients.delete(ws);
    });
  }

  handleMessage(ws, data) {
    // Handle ping/pong for keepalive
    if (data.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' }));
    }
  }

  broadcastToAll(message) {
    const payload = JSON.stringify(message);
    for (const [ws] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  broadcastToRole(role, message) {
    const payload = JSON.stringify(message);
    for (const [ws, client] of this.clients) {
      if (ws.readyState === WebSocket.OPEN && client.role === role) {
        ws.send(payload);
      }
    }
  }

  sendToAgent(agentId, message) {
    const payload = JSON.stringify(message);
    for (const [ws, client] of this.clients) {
      if (ws.readyState === WebSocket.OPEN && client.agentId === agentId) {
        ws.send(payload);
      }
    }
  }

  async broadcastStats() {
    try {
      const amiClient = require('../../ami/amiClient');

      // Gather live stats
      const [
        activeCallsResult,
        agentStatsResult,
        todayStatsResult,
        agentsResult,
      ] = await Promise.all([
        query(`SELECT COUNT(*) as count FROM calls WHERE status IN ('originated','ringing','answered','bridged')`),
        query(`SELECT status, COUNT(*) as count FROM agents GROUP BY status`),
        query(`SELECT
                 COUNT(*) as total_calls,
                 COUNT(*) FILTER (WHERE status = 'completed' AND answered_at IS NOT NULL) as answered_calls,
                 COALESCE(AVG(billsec) FILTER (WHERE billsec > 0), 0) as avg_handle_time,
                 COALESCE(AVG(duration) FILTER (WHERE duration > 0), 0) as avg_duration
               FROM calls WHERE started_at >= CURRENT_DATE`),
        query(`SELECT id, sip_username, extension, phone_type FROM agents`),
      ]);

      const activeCalls = parseInt(activeCallsResult.rows[0].count, 10);
      const agentStats = {};
      agentStatsResult.rows.forEach(r => { agentStats[r.status] = parseInt(r.count, 10); });

      const today = todayStatsResult.rows[0];
      const totalCalls = parseInt(today.total_calls, 10);
      const answeredCalls = parseInt(today.answered_calls, 10);
      const asr = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;

      // Get live SIP registration status from Asterisk
      let sipStatus = {};
      if (amiClient.authenticated && agentsResult.rows.length > 0) {
        const sipUsernames = agentsResult.rows.map(r => r.sip_username);
        sipStatus = await amiClient.getSipRegistrationStatus(sipUsernames);
      }

      const sipAgents = agentsResult.rows.map(a => ({
        id: a.id,
        sipUsername: a.sip_username,
        extension: a.extension,
        phoneType: a.phone_type,
        sipRegistered: sipStatus[a.sip_username]?.registered || false,
      }));

      const stats = {
        activeCalls,
        agentStats,
        todayCalls: totalCalls,
        answeredCalls,
        asr,
        aht: Math.round(parseFloat(today.avg_handle_time)),
        avgDuration: Math.round(parseFloat(today.avg_duration)),
        connectedClients: this.clients.size,
        sipAgents,
      };

      this.broadcastToAll({ type: 'stats', data: stats });
    } catch (err) {
      // Don't spam logs, stats failures are non-critical
    }
  }

  shutdown() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
    }
    if (this.wss) {
      this.wss.close();
    }
  }
}

const realtimeServer = new RealtimeServer();
module.exports = realtimeServer;
