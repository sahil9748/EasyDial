const { query, getClient } = require('../../db/pool');
const { redis } = require('../../db/redis');
const logger = require('../../utils/logger');
const { randomString, paginationParams } = require('../../utils/helpers');
const amiClient = require('../../ami/amiClient');

const agentsController = {
  async list(req, res) {
    try {
      const { limit, offset, page } = paginationParams(req.query.page, req.query.limit);
      const result = await query(
        `SELECT a.id, a.sip_username, a.extension, a.phone_type, a.status, a.status_changed_at, a.max_channels,
                u.id as user_id, u.username, u.first_name, u.last_name, u.email, u.role
         FROM agents a JOIN users u ON a.user_id = u.id
         ORDER BY a.created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const countResult = await query('SELECT COUNT(*) FROM agents');
      res.json({
        agents: result.rows,
        pagination: { page, limit, total: parseInt(countResult.rows[0].count, 10) },
      });
    } catch (err) {
      logger.error('List agents error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async listStatuses(req, res) {
    try {
      const result = await query(
        `SELECT a.id, a.sip_username, a.extension, a.status, a.status_changed_at,
                u.username, u.first_name, u.last_name
         FROM agents a JOIN users u ON a.user_id = u.id
         ORDER BY a.status, u.username`
      );
      res.json({ agents: result.rows });
    } catch (err) {
      logger.error('List agent statuses error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getById(req, res) {
    try {
      const result = await query(
        `SELECT a.*, u.username, u.first_name, u.last_name, u.email
         FROM agents a JOIN users u ON a.user_id = u.id WHERE a.id = $1`,
        [req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Agent not found' });
      res.json({ agent: result.rows[0] });
    } catch (err) {
      logger.error('Get agent error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async create(req, res) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const { userId, extension, maxChannels, phoneType } = req.body;
      if (!userId || !extension) {
        return res.status(400).json({ error: 'userId and extension are required' });
      }

      const pType = phoneType === 'external' ? 'external' : 'webrtc';
      const sipUsername = `agent_${extension}`;
      const sipPassword = randomString(12);

      // Create agent record
      const agentResult = await client.query(
        `INSERT INTO agents (user_id, sip_username, sip_password, extension, phone_type, max_channels)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, sipUsername, sipPassword, extension, pType, maxChannels || 1]
      );

      const agent = agentResult.rows[0];

      // Create Asterisk PJSIP realtime records based on phone type
      if (pType === 'webrtc') {
        // WebRTC endpoint (browser softphone via WSS)
        await client.query(
          `INSERT INTO ps_endpoints (id, transport, aors, auth, context, disallow, allow,
           webrtc, dtls_auto_generate_cert, media_encryption, dtmf_mode, direct_media,
           force_rport, rewrite_contact, rtp_symmetric, ice_support, device_state_busy_at)
           VALUES ($1, 'transport-wss', $1, $1, 'from-internal', 'all', 'opus,ulaw,alaw',
           'yes', 'yes', 'dtls', 'rfc4733', 'no', 'yes', 'yes', 'yes', 'yes', 1)`,
          [sipUsername]
        );
      } else {
        // External SIP endpoint (Obeam, Zoiper, MicroSIP, etc. via UDP)
        await client.query(
          `INSERT INTO ps_endpoints (id, transport, aors, auth, context, disallow, allow,
           webrtc, dtmf_mode, direct_media, force_rport, rewrite_contact, rtp_symmetric,
           ice_support, device_state_busy_at)
           VALUES ($1, 'transport-udp', $1, $1, 'from-internal', 'all', 'ulaw,alaw,opus',
           'no', 'rfc4733', 'no', 'yes', 'yes', 'yes', 'no', 1)`,
          [sipUsername]
        );
      }

      await client.query(
        `INSERT INTO ps_auths (id, auth_type, password, username) VALUES ($1, 'userpass', $2, $1)`,
        [sipUsername, sipPassword]
      );

      await client.query(
        `INSERT INTO ps_aors (id, max_contacts, remove_existing, qualify_frequency)
         VALUES ($1, 1, 'yes', 60)`,
        [sipUsername]
      );

      await client.query('COMMIT');

      res.status(201).json({
        agent: {
          ...agent,
          sipPassword, // Return once on creation
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Agent with this user or extension already exists' });
      }
      logger.error('Create agent error', err);
      res.status(500).json({ error: 'Internal server error' });
    } finally {
      client.release();
    }
  },

  async update(req, res) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const { extension, maxChannels, status, phoneType } = req.body;
      const fields = [];
      const params = [];
      let idx = 1;

      if (extension) { fields.push(`extension = $${idx++}`); params.push(extension); }
      if (maxChannels) { fields.push(`max_channels = $${idx++}`); params.push(maxChannels); }
      if (phoneType && ['webrtc', 'external'].includes(phoneType)) {
        fields.push(`phone_type = $${idx++}`);
        params.push(phoneType);
      }
      if (status) {
        fields.push(`status = $${idx++}`);
        params.push(status);
        fields.push(`status_changed_at = NOW()`);
      }

      if (fields.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'No fields to update' });
      }

      params.push(req.params.id);
      const result = await client.query(
        `UPDATE agents SET ${fields.join(', ')} WHERE id = $${idx}
         RETURNING *`,
        params
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Agent not found' });
      }

      const agent = result.rows[0];

      // Re-provision PJSIP endpoint if phone type changed
      if (phoneType && ['webrtc', 'external'].includes(phoneType)) {
        const sipUsername = agent.sip_username;
        // Delete and re-create endpoint with new transport settings
        await client.query('DELETE FROM ps_endpoints WHERE id = $1', [sipUsername]);

        if (phoneType === 'webrtc') {
          await client.query(
            `INSERT INTO ps_endpoints (id, transport, aors, auth, context, disallow, allow,
             webrtc, dtls_auto_generate_cert, media_encryption, dtmf_mode, direct_media,
             force_rport, rewrite_contact, rtp_symmetric, ice_support, device_state_busy_at)
             VALUES ($1, 'transport-wss', $1, $1, 'from-internal', 'all', 'opus,ulaw,alaw',
             'yes', 'yes', 'dtls', 'rfc4733', 'no', 'yes', 'yes', 'yes', 'yes', 1)`,
            [sipUsername]
          );
        } else {
          await client.query(
            `INSERT INTO ps_endpoints (id, transport, aors, auth, context, disallow, allow,
             webrtc, dtmf_mode, direct_media, force_rport, rewrite_contact, rtp_symmetric,
             ice_support, device_state_busy_at)
             VALUES ($1, 'transport-udp', $1, $1, 'from-internal', 'all', 'ulaw,alaw,opus',
             'no', 'rfc4733', 'no', 'yes', 'yes', 'yes', 'no', 1)`,
            [sipUsername]
          );
        }
      }

      await client.query('COMMIT');

      // Update Redis agent status
      await redis.hset(`agent:${agent.id}`, 'status', agent.status);

      res.json({ agent });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('Update agent error', err);
      res.status(500).json({ error: 'Internal server error' });
    } finally {
      client.release();
    }
  },

  async remove(req, res) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Get agent's sip_username to clean up PJSIP records
      const agentResult = await client.query('SELECT sip_username FROM agents WHERE id = $1', [req.params.id]);
      if (agentResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Agent not found' });
      }

      const sipUsername = agentResult.rows[0].sip_username;

      // Remove PJSIP records
      await client.query('DELETE FROM ps_endpoints WHERE id = $1', [sipUsername]);
      await client.query('DELETE FROM ps_auths WHERE id = $1', [sipUsername]);
      await client.query('DELETE FROM ps_aors WHERE id = $1', [sipUsername]);

      // Remove agent
      await client.query('DELETE FROM agents WHERE id = $1', [req.params.id]);

      await client.query('COMMIT');

      // Clean up Redis
      await redis.del(`agent:${req.params.id}`);

      res.json({ message: 'Agent deleted' });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('Delete agent error', err);
      res.status(500).json({ error: 'Internal server error' });
    } finally {
      client.release();
    }
  },

  async setStatus(req, res) {
    try {
      const { status } = req.body;
      const validStatuses = ['available', 'busy', 'paused', 'offline', 'wrapup'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const result = await query(
        `UPDATE agents SET status = $1, status_changed_at = NOW() WHERE id = $2 RETURNING *`,
        [status, req.params.id]
      );

      if (result.rows.length === 0) return res.status(404).json({ error: 'Agent not found' });

      const agent = result.rows[0];
      await redis.hset(`agent:${agent.id}`, 'status', status);
      await redis.publish('agent:status', JSON.stringify({ agentId: agent.id, status, timestamp: Date.now() }));

      res.json({ agent });
    } catch (err) {
      logger.error('Set agent status error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async agentLogin(req, res) {
    try {
      // Create session
      const result = await query(
        `INSERT INTO agent_sessions (agent_id) VALUES ($1) RETURNING *`,
        [req.params.id]
      );

      // Set agent as available
      await query(
        `UPDATE agents SET status = 'available', status_changed_at = NOW() WHERE id = $1`,
        [req.params.id]
      );

      await redis.hset(`agent:${req.params.id}`, 'status', 'available');
      await redis.hset(`agent:${req.params.id}`, 'sessionId', result.rows[0].id);
      await redis.publish('agent:status', JSON.stringify({
        agentId: req.params.id, status: 'available', timestamp: Date.now()
      }));

      res.json({ session: result.rows[0] });
    } catch (err) {
      logger.error('Agent login error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async agentLogout(req, res) {
    try {
      const sessionId = await redis.hget(`agent:${req.params.id}`, 'sessionId');

      if (sessionId) {
        await query(
          `UPDATE agent_sessions SET logout_at = NOW() WHERE id = $1`,
          [sessionId]
        );
      }

      await query(
        `UPDATE agents SET status = 'offline', status_changed_at = NOW() WHERE id = $1`,
        [req.params.id]
      );

      await redis.hset(`agent:${req.params.id}`, 'status', 'offline');
      await redis.del(`agent:${req.params.id}`);
      await redis.publish('agent:status', JSON.stringify({
        agentId: req.params.id, status: 'offline', timestamp: Date.now()
      }));

      res.json({ message: 'Agent logged out' });
    } catch (err) {
      logger.error('Agent logout error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async sipStatus(req, res) {
    try {
      const result = await query(
        'SELECT id, sip_username, extension, phone_type FROM agents'
      );
      const sipUsernames = result.rows.map(r => r.sip_username);
      const sipStatus = await amiClient.getSipRegistrationStatus(sipUsernames);

      const agents = result.rows.map(a => ({
        id: a.id,
        sipUsername: a.sip_username,
        extension: a.extension,
        phoneType: a.phone_type,
        sipRegistered: sipStatus[a.sip_username]?.registered || false,
        sipIp: sipStatus[a.sip_username]?.ip || null,
      }));

      res.json({ agents });
    } catch (err) {
      logger.error('SIP status error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};

module.exports = agentsController;
