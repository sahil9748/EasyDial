const path = require('path');
const fs = require('fs');
const { query } = require('../../db/pool');
const config = require('../../config');
const logger = require('../../utils/logger');
const { paginationParams } = require('../../utils/helpers');

const callsController = {
  async list(req, res) {
    try {
      const { limit, offset, page } = paginationParams(req.query.page, req.query.limit);
      const { direction, agentId, campaignId, dateFrom, dateTo } = req.query;

      let where = 'WHERE 1=1';
      const params = [];
      let idx = 1;

      if (direction) { where += ` AND c.direction = $${idx++}`; params.push(direction); }
      if (agentId) { where += ` AND c.agent_id = $${idx++}`; params.push(agentId); }
      if (campaignId) { where += ` AND c.campaign_id = $${idx++}`; params.push(campaignId); }
      if (dateFrom) { where += ` AND c.started_at >= $${idx++}`; params.push(dateFrom); }
      if (dateTo) { where += ` AND c.started_at <= $${idx++}`; params.push(dateTo); }

      // If agent role, only show their calls
      if (req.user.role === 'agent' && req.user.agentId) {
        where += ` AND c.agent_id = $${idx++}`;
        params.push(req.user.agentId);
      }

      params.push(limit, offset);

      const result = await query(
        `SELECT c.*, a.sip_username as agent_name, camp.name as campaign_name
         FROM calls c
         LEFT JOIN agents a ON c.agent_id = a.id
         LEFT JOIN campaigns camp ON c.campaign_id = camp.id
         ${where}
         ORDER BY c.started_at DESC
         LIMIT $${idx++} OFFSET $${idx}`,
        params
      );

      const countResult = await query(`SELECT COUNT(*) FROM calls c ${where}`, params.slice(0, -2));

      res.json({
        calls: result.rows,
        pagination: { page, limit, total: parseInt(countResult.rows[0].count, 10) },
      });
    } catch (err) {
      logger.error('List calls error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async listActive(req, res) {
    try {
      const result = await query(
        `SELECT c.*, a.sip_username as agent_name, camp.name as campaign_name
         FROM calls c
         LEFT JOIN agents a ON c.agent_id = a.id
         LEFT JOIN campaigns camp ON c.campaign_id = camp.id
         WHERE c.status IN ('originated', 'ringing', 'answered', 'bridged')
         ORDER BY c.started_at DESC`
      );
      res.json({ calls: result.rows });
    } catch (err) {
      logger.error('List active calls error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getById(req, res) {
    try {
      const result = await query(
        `SELECT c.*, a.sip_username as agent_name, camp.name as campaign_name
         FROM calls c LEFT JOIN agents a ON c.agent_id = a.id
         LEFT JOIN campaigns camp ON c.campaign_id = camp.id
         WHERE c.id = $1`, [req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Call not found' });
      res.json({ call: result.rows[0] });
    } catch (err) {
      logger.error('Get call error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getRecording(req, res) {
    try {
      const result = await query('SELECT recording_path FROM calls WHERE id = $1', [req.params.id]);
      if (result.rows.length === 0 || !result.rows[0].recording_path) {
        return res.status(404).json({ error: 'Recording not found' });
      }

      const filePath = result.rows[0].recording_path;
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Recording file not found on disk' });
      }

      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      logger.error('Get recording error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async setDisposition(req, res) {
    try {
      const { disposition } = req.body;
      if (!disposition) return res.status(400).json({ error: 'Disposition is required' });

      const result = await query(
        `UPDATE calls SET disposition = $1 WHERE id = $2 RETURNING *`,
        [disposition, req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Call not found' });

      // Also update contact disposition if linked
      const call = result.rows[0];
      if (call.contact_id) {
        await query(
          `UPDATE campaign_contacts SET disposition = $1, status = 'completed' WHERE id = $2`,
          [disposition, call.contact_id]
        );
      }

      res.json({ call: result.rows[0] });
    } catch (err) {
      logger.error('Set disposition error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};

module.exports = callsController;
