const { query } = require('../../db/pool');
const logger = require('../../utils/logger');

const ivrController = {
  async list(req, res) {
    try {
      const result = await query(
        'SELECT id, name, description, active, created_at, updated_at FROM call_flows ORDER BY name'
      );
      res.json({ flows: result.rows });
    } catch (err) {
      logger.error('List IVR flows error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getById(req, res) {
    try {
      const result = await query('SELECT * FROM call_flows WHERE id = $1', [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Flow not found' });
      res.json({ flow: result.rows[0] });
    } catch (err) {
      logger.error('Get IVR flow error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async create(req, res) {
    try {
      const { name, description, flowJson } = req.body;
      if (!name || !flowJson) return res.status(400).json({ error: 'Name and flowJson are required' });

      const result = await query(
        `INSERT INTO call_flows (name, description, flow_json, created_by) VALUES ($1,$2,$3,$4) RETURNING *`,
        [name, description || '', JSON.stringify(flowJson), req.user.id]
      );
      res.status(201).json({ flow: result.rows[0] });
    } catch (err) {
      logger.error('Create IVR flow error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async update(req, res) {
    try {
      const { name, description, flowJson, active } = req.body;
      const fields = []; const params = []; let idx = 1;
      if (name) { fields.push(`name=$${idx++}`); params.push(name); }
      if (description !== undefined) { fields.push(`description=$${idx++}`); params.push(description); }
      if (flowJson) { fields.push(`flow_json=$${idx++}`); params.push(JSON.stringify(flowJson)); }
      if (active !== undefined) { fields.push(`active=$${idx++}`); params.push(active); }

      if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
      params.push(req.params.id);
      const result = await query(
        `UPDATE call_flows SET ${fields.join(',')} WHERE id=$${idx} RETURNING *`, params
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Flow not found' });
      res.json({ flow: result.rows[0] });
    } catch (err) {
      logger.error('Update IVR flow error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async remove(req, res) {
    try {
      const result = await query('DELETE FROM call_flows WHERE id=$1 RETURNING id', [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Flow not found' });
      res.json({ message: 'Flow deleted' });
    } catch (err) {
      logger.error('Delete IVR flow error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};

module.exports = ivrController;
