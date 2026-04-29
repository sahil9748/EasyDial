const fs = require('fs');
const { parse } = require('csv-parse');
const { query, getClient } = require('../../db/pool');
const { redis } = require('../../db/redis');
const logger = require('../../utils/logger');
const { paginationParams, normalizePhone } = require('../../utils/helpers');

const campaignsController = {
  async list(req, res) {
    try {
      const result = await query(
        `SELECT c.*, t.name as trunk_name,
                (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = c.id) as total_contacts,
                (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = c.id AND status = 'completed') as completed_contacts
         FROM campaigns c LEFT JOIN sip_trunks t ON c.trunk_id = t.id
         ORDER BY c.created_at DESC`
      );
      res.json({ campaigns: result.rows });
    } catch (err) {
      logger.error('List campaigns error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getById(req, res) {
    try {
      const result = await query(
        `SELECT c.*, t.name as trunk_name FROM campaigns c
         LEFT JOIN sip_trunks t ON c.trunk_id = t.id WHERE c.id = $1`,
        [req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Campaign not found' });
      res.json({ campaign: result.rows[0] });
    } catch (err) {
      logger.error('Get campaign error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async create(req, res) {
    try {
      const { name, type, trunkId, callerId, maxConcurrency, retryCount, retryInterval,
              amdEnabled, scheduleStart, scheduleEnd, timezone, queueId } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });

      const result = await query(
        `INSERT INTO campaigns (name, type, trunk_id, caller_id, max_concurrency,
         retry_count, retry_interval, amd_enabled, schedule_start, schedule_end,
         timezone, queue_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [name, type || 'progressive', trunkId || null, callerId || null,
         maxConcurrency || 5, retryCount || 3, retryInterval || 3600,
         amdEnabled || false, scheduleStart || null, scheduleEnd || null,
         timezone || 'UTC', queueId || null, req.user.id]
      );
      res.status(201).json({ campaign: result.rows[0] });
    } catch (err) {
      logger.error('Create campaign error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async update(req, res) {
    try {
      const fields = [];
      const params = [];
      let idx = 1;
      const allowed = ['name','type','trunk_id','caller_id','max_concurrency','retry_count',
                       'retry_interval','amd_enabled','schedule_start','schedule_end','timezone','queue_id'];
      const bodyMap = { trunkId:'trunk_id', callerId:'caller_id', maxConcurrency:'max_concurrency',
                       retryCount:'retry_count', retryInterval:'retry_interval', amdEnabled:'amd_enabled',
                       scheduleStart:'schedule_start', scheduleEnd:'schedule_end', queueId:'queue_id' };

      for (const [bodyKey, dbKey] of Object.entries(bodyMap)) {
        if (req.body[bodyKey] !== undefined) {
          fields.push(`${dbKey} = $${idx++}`);
          params.push(req.body[bodyKey]);
        }
      }
      ['name','type','timezone'].forEach(k => {
        if (req.body[k] !== undefined) {
          fields.push(`${k} = $${idx++}`);
          params.push(req.body[k]);
        }
      });

      if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

      params.push(req.params.id);
      const result = await query(
        `UPDATE campaigns SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, params
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Campaign not found' });
      res.json({ campaign: result.rows[0] });
    } catch (err) {
      logger.error('Update campaign error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async remove(req, res) {
    try {
      const result = await query('DELETE FROM campaigns WHERE id = $1 RETURNING id', [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Campaign not found' });
      res.json({ message: 'Campaign deleted' });
    } catch (err) {
      logger.error('Delete campaign error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async uploadContacts(req, res) {
    try {
      if (!req.file) return res.status(400).json({ error: 'CSV file is required' });

      const contacts = [];
      const parser = fs.createReadStream(req.file.path).pipe(
        parse({ columns: true, skip_empty_lines: true, trim: true })
      );

      for await (const row of parser) {
        const phone = normalizePhone(row.phone || row.Phone || row.PHONE || '');
        if (phone) {
          contacts.push({
            phone,
            firstName: row.first_name || row.FirstName || row.firstName || '',
            lastName: row.last_name || row.LastName || row.lastName || '',
            email: row.email || row.Email || '',
            customData: {},
          });
        }
      }

      // Filter DNC numbers
      const dncResult = await query('SELECT phone FROM dnc_list');
      const dncSet = new Set(dncResult.rows.map(r => r.phone));
      const filtered = contacts.filter(c => !dncSet.has(c.phone));

      // Batch insert
      const client = await getClient();
      try {
        await client.query('BEGIN');
        for (const c of filtered) {
          await client.query(
            `INSERT INTO campaign_contacts (campaign_id, phone, first_name, last_name, email, custom_data)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT DO NOTHING`,
            [req.params.id, c.phone, c.firstName, c.lastName, c.email, JSON.stringify(c.customData)]
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      // Clean up temp file
      fs.unlink(req.file.path, () => {});

      res.json({
        message: 'Contacts uploaded',
        total: contacts.length,
        imported: filtered.length,
        dncFiltered: contacts.length - filtered.length,
      });
    } catch (err) {
      logger.error('Upload contacts error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async listContacts(req, res) {
    try {
      const { limit, offset, page } = paginationParams(req.query.page, req.query.limit);
      const statusFilter = req.query.status;
      const params = [req.params.id, limit, offset];
      let where = 'WHERE campaign_id = $1';
      if (statusFilter) { where += ` AND status = $4`; params.push(statusFilter); }

      const result = await query(
        `SELECT * FROM campaign_contacts ${where} ORDER BY created_at DESC LIMIT $2 OFFSET $3`, params
      );
      const countResult = await query(
        `SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = $1`, [req.params.id]
      );
      res.json({
        contacts: result.rows,
        pagination: { page, limit, total: parseInt(countResult.rows[0].count, 10) },
      });
    } catch (err) {
      logger.error('List contacts error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getStats(req, res) {
    try {
      const result = await query(
        `SELECT status, COUNT(*) as count FROM campaign_contacts
         WHERE campaign_id = $1 GROUP BY status`,
        [req.params.id]
      );
      const stats = {};
      result.rows.forEach(r => { stats[r.status] = parseInt(r.count, 10); });
      res.json({ stats });
    } catch (err) {
      logger.error('Campaign stats error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async start(req, res) {
    try {
      const result = await query(
        `UPDATE campaigns SET status = 'active' WHERE id = $1 AND status IN ('draft', 'paused')
         RETURNING *`, [req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Campaign not found or cannot be started' });
      await redis.sadd('active_campaigns', req.params.id);
      res.json({ campaign: result.rows[0] });
    } catch (err) {
      logger.error('Start campaign error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async pause(req, res) {
    try {
      const result = await query(
        `UPDATE campaigns SET status = 'paused' WHERE id = $1 AND status = 'active' RETURNING *`,
        [req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Campaign not found or not active' });
      await redis.srem('active_campaigns', req.params.id);
      res.json({ campaign: result.rows[0] });
    } catch (err) {
      logger.error('Pause campaign error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async stop(req, res) {
    try {
      const result = await query(
        `UPDATE campaigns SET status = 'completed' WHERE id = $1 AND status IN ('active', 'paused')
         RETURNING *`, [req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Campaign not found' });
      await redis.srem('active_campaigns', req.params.id);
      res.json({ campaign: result.rows[0] });
    } catch (err) {
      logger.error('Stop campaign error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};

module.exports = campaignsController;
