const { query } = require('../../db/pool');
const logger = require('../../utils/logger');

const queuesController = {
  async list(req, res) {
    try {
      const result = await query(
        `SELECT q.*,
          (SELECT COUNT(*) FROM queue_agents qa WHERE qa.queue_id = q.id) as agent_count
         FROM queues q ORDER BY q.name`
      );
      res.json({ queues: result.rows });
    } catch (err) {
      logger.error('List queues error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getById(req, res) {
    try {
      const result = await query('SELECT * FROM queues WHERE id = $1', [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Queue not found' });
      res.json({ queue: result.rows[0] });
    } catch (err) {
      logger.error('Get queue error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async create(req, res) {
    try {
      const { name, strategy, timeout, maxWait, wrapupTime, musicOnHold } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });

      const result = await query(
        `INSERT INTO queues (name, strategy, timeout, max_wait, wrapup_time, music_on_hold)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [name, strategy||'roundrobin', timeout||30, maxWait||300, wrapupTime||10, musicOnHold||'default']
      );
      res.status(201).json({ queue: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Queue name already exists' });
      logger.error('Create queue error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async update(req, res) {
    try {
      const { name, strategy, timeout, maxWait, wrapupTime, active, musicOnHold } = req.body;
      const fields = []; const params = []; let idx = 1;
      if (name) { fields.push(`name=$${idx++}`); params.push(name); }
      if (strategy) { fields.push(`strategy=$${idx++}`); params.push(strategy); }
      if (timeout) { fields.push(`timeout=$${idx++}`); params.push(timeout); }
      if (maxWait) { fields.push(`max_wait=$${idx++}`); params.push(maxWait); }
      if (wrapupTime) { fields.push(`wrapup_time=$${idx++}`); params.push(wrapupTime); }
      if (active !== undefined) { fields.push(`active=$${idx++}`); params.push(active); }
      if (musicOnHold) { fields.push(`music_on_hold=$${idx++}`); params.push(musicOnHold); }

      if (fields.length === 0) return res.status(400).json({ error: 'No fields' });
      params.push(req.params.id);
      const result = await query(
        `UPDATE queues SET ${fields.join(',')} WHERE id=$${idx} RETURNING *`, params
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Queue not found' });
      res.json({ queue: result.rows[0] });
    } catch (err) {
      logger.error('Update queue error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async remove(req, res) {
    try {
      const result = await query('DELETE FROM queues WHERE id=$1 RETURNING id', [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Queue not found' });
      res.json({ message: 'Queue deleted' });
    } catch (err) {
      logger.error('Delete queue error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async listAgents(req, res) {
    try {
      const result = await query(
        `SELECT qa.*, a.sip_username, a.extension, a.status, u.username, u.first_name, u.last_name
         FROM queue_agents qa
         JOIN agents a ON qa.agent_id = a.id
         JOIN users u ON a.user_id = u.id
         WHERE qa.queue_id = $1 ORDER BY qa.priority`, [req.params.id]
      );
      res.json({ agents: result.rows });
    } catch (err) {
      logger.error('List queue agents error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async addAgent(req, res) {
    try {
      const { agentId, priority, penalty } = req.body;
      if (!agentId) return res.status(400).json({ error: 'agentId required' });
      const result = await query(
        `INSERT INTO queue_agents (queue_id, agent_id, priority, penalty) VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.params.id, agentId, priority||1, penalty||0]
      );
      res.status(201).json({ queueAgent: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Agent already in queue' });
      logger.error('Add queue agent error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async removeAgent(req, res) {
    try {
      const result = await query(
        'DELETE FROM queue_agents WHERE queue_id=$1 AND agent_id=$2 RETURNING id',
        [req.params.id, req.params.agentId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Agent not in queue' });
      res.json({ message: 'Agent removed from queue' });
    } catch (err) {
      logger.error('Remove queue agent error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};

module.exports = queuesController;
