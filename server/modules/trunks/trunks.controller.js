const { query, getClient } = require('../../db/pool');
const logger = require('../../utils/logger');
const { encryptPassword, decryptPassword, paginationParams } = require('../../utils/helpers');

const trunksController = {
  async list(req, res) {
    try {
      const result = await query(
        `SELECT id, name, host, port, username, codecs, transport, context,
                max_channels, active, last_health_check, health_status, created_at
         FROM sip_trunks ORDER BY created_at DESC`
      );
      res.json({ trunks: result.rows });
    } catch (err) {
      logger.error('List trunks error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getById(req, res) {
    try {
      const result = await query('SELECT * FROM sip_trunks WHERE id = $1', [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Trunk not found' });
      const trunk = result.rows[0];
      // Don't return encrypted password
      delete trunk.password_encrypted;
      res.json({ trunk });
    } catch (err) {
      logger.error('Get trunk error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async create(req, res) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const { name, host, port, username, password, codecs, transport, context, maxChannels } = req.body;
      if (!name || !host) return res.status(400).json({ error: 'Name and host are required' });

      const encPass = password ? encryptPassword(password) : null;
      const trunkId = name.toLowerCase().replace(/[^a-z0-9]/g, '_');

      const result = await client.query(
        `INSERT INTO sip_trunks (name, host, port, username, password_encrypted, codecs, transport, context, max_channels)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [name, host, port || 5060, username || '', encPass, codecs || 'ulaw,alaw,opus',
         transport || 'udp', context || 'from-trunk', maxChannels || 30]
      );

      const trunk = result.rows[0];

      // Create PJSIP endpoint for this trunk
      await client.query(
        `INSERT INTO ps_endpoints (id, transport, aors, auth, context, disallow, allow, direct_media,
         force_rport, rewrite_contact, rtp_symmetric, from_user, from_domain, outbound_auth)
         VALUES ($1, $2, $1, $1, $3, 'all', $4, 'no', 'yes', 'yes', 'yes', $5, $6, $1)`,
        [`trunk_${trunkId}`, `transport-${transport || 'udp'}`, context || 'from-trunk',
         codecs || 'ulaw,alaw,opus', username || '', host]
      );

      if (username && password) {
        await client.query(
          `INSERT INTO ps_auths (id, auth_type, password, username) VALUES ($1, 'userpass', $2, $3)`,
          [`trunk_${trunkId}`, password, username]
        );
      }

      await client.query(
        `INSERT INTO ps_aors (id, max_contacts, qualify_frequency) VALUES ($1, 1, 60)`,
        [`trunk_${trunkId}`]
      );

      await client.query('COMMIT');
      delete trunk.password_encrypted;
      res.status(201).json({ trunk });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') return res.status(409).json({ error: 'Trunk name already exists' });
      logger.error('Create trunk error', err);
      res.status(500).json({ error: 'Internal server error' });
    } finally {
      client.release();
    }
  },

  async update(req, res) {
    try {
      const { host, port, username, password, codecs, transport, context, maxChannels, active } = req.body;
      const fields = [];
      const params = [];
      let idx = 1;

      if (host) { fields.push(`host = $${idx++}`); params.push(host); }
      if (port) { fields.push(`port = $${idx++}`); params.push(port); }
      if (username !== undefined) { fields.push(`username = $${idx++}`); params.push(username); }
      if (password) { fields.push(`password_encrypted = $${idx++}`); params.push(encryptPassword(password)); }
      if (codecs) { fields.push(`codecs = $${idx++}`); params.push(codecs); }
      if (transport) { fields.push(`transport = $${idx++}`); params.push(transport); }
      if (context) { fields.push(`context = $${idx++}`); params.push(context); }
      if (maxChannels) { fields.push(`max_channels = $${idx++}`); params.push(maxChannels); }
      if (active !== undefined) { fields.push(`active = $${idx++}`); params.push(active); }

      if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

      params.push(req.params.id);
      const result = await query(
        `UPDATE sip_trunks SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
        params
      );

      if (result.rows.length === 0) return res.status(404).json({ error: 'Trunk not found' });
      const trunk = result.rows[0];
      delete trunk.password_encrypted;
      res.json({ trunk });
    } catch (err) {
      logger.error('Update trunk error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async remove(req, res) {
    try {
      const result = await query('DELETE FROM sip_trunks WHERE id = $1 RETURNING name', [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Trunk not found' });
      res.json({ message: 'Trunk deleted' });
    } catch (err) {
      logger.error('Delete trunk error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async healthCheck(req, res) {
    try {
      // For now, just update the health check timestamp
      // In production, this would send SIP OPTIONS via AMI
      const result = await query(
        `UPDATE sip_trunks SET last_health_check = NOW(), health_status = 'reachable'
         WHERE id = $1 RETURNING id, name, health_status, last_health_check`,
        [req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Trunk not found' });
      res.json({ trunk: result.rows[0] });
    } catch (err) {
      logger.error('Health check error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};

module.exports = trunksController;
