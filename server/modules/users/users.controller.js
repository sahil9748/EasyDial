const bcrypt = require('bcryptjs');
const { query } = require('../../db/pool');
const logger = require('../../utils/logger');
const { paginationParams } = require('../../utils/helpers');

const usersController = {
  async list(req, res) {
    try {
      const { limit, offset, page } = paginationParams(req.query.page, req.query.limit);
      const roleFilter = req.query.role;

      let sql = `SELECT id, username, email, first_name, last_name, role, active, last_login, created_at
                  FROM users`;
      const params = [];

      if (roleFilter) {
        sql += ` WHERE role = $1`;
        params.push(roleFilter);
      }

      sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await query(sql, params);

      // Get total count
      let countSql = 'SELECT COUNT(*) FROM users';
      const countParams = [];
      if (roleFilter) {
        countSql += ' WHERE role = $1';
        countParams.push(roleFilter);
      }
      const countResult = await query(countSql, countParams);

      res.json({
        users: result.rows,
        pagination: { page, limit, total: parseInt(countResult.rows[0].count, 10) },
      });
    } catch (err) {
      logger.error('List users error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getById(req, res) {
    try {
      const result = await query(
        `SELECT id, username, email, first_name, last_name, role, active, last_login, created_at
         FROM users WHERE id = $1`,
        [req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      res.json({ user: result.rows[0] });
    } catch (err) {
      logger.error('Get user error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async create(req, res) {
    try {
      const { username, password, email, firstName, lastName, role } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const validRoles = ['admin', 'supervisor', 'agent'];
      const userRole = validRoles.includes(role) ? role : 'agent';

      const result = await query(
        `INSERT INTO users (username, password_hash, email, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, username, email, first_name, last_name, role, active, created_at`,
        [username, passwordHash, email || null, firstName || null, lastName || null, userRole]
      );

      res.status(201).json({ user: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Username or email already exists' });
      }
      logger.error('Create user error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async update(req, res) {
    try {
      const { email, firstName, lastName, role, active, password } = req.body;
      const fields = [];
      const params = [];
      let idx = 1;

      if (email !== undefined) { fields.push(`email = $${idx++}`); params.push(email); }
      if (firstName !== undefined) { fields.push(`first_name = $${idx++}`); params.push(firstName); }
      if (lastName !== undefined) { fields.push(`last_name = $${idx++}`); params.push(lastName); }
      if (role !== undefined) { fields.push(`role = $${idx++}`); params.push(role); }
      if (active !== undefined) { fields.push(`active = $${idx++}`); params.push(active); }
      if (password) {
        const hash = await bcrypt.hash(password, 12);
        fields.push(`password_hash = $${idx++}`);
        params.push(hash);
      }

      if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

      params.push(req.params.id);
      const result = await query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}
         RETURNING id, username, email, first_name, last_name, role, active`,
        params
      );

      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      res.json({ user: result.rows[0] });
    } catch (err) {
      logger.error('Update user error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async remove(req, res) {
    try {
      const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      res.json({ message: 'User deleted' });
    } catch (err) {
      logger.error('Delete user error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};

module.exports = usersController;
