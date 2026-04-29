const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../../db/pool');
const config = require('../../config');
const logger = require('../../utils/logger');

const authController = {
  async login(req, res) {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      const result = await query(
        'SELECT id, username, password_hash, email, first_name, last_name, role, active FROM users WHERE username = $1',
        [username]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];
      if (!user.active) {
        return res.status(403).json({ error: 'Account is disabled' });
      }

      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Update last login
      await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

      // Get agent info if role is agent
      let agent = null;
      if (user.role === 'agent') {
        const agentResult = await query(
          'SELECT id, sip_username, sip_password, extension, phone_type, status FROM agents WHERE user_id = $1',
          [user.id]
        );
        if (agentResult.rows.length > 0) {
          agent = agentResult.rows[0];
        }
      }

      const token = jwt.sign(
        {
          id: user.id,
          username: user.username,
          role: user.role,
          agentId: agent?.id || null,
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
        },
        agent: agent
          ? {
              id: agent.id,
              sipUsername: agent.sip_username,
              sipPassword: agent.sip_password,
              extension: agent.extension,
              phoneType: agent.phone_type,
            }
          : null,
      });
    } catch (err) {
      logger.error('Login error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async register(req, res) {
    try {
      const { username, password, email, firstName, lastName, role } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }

      // Only admins can create users (checked via middleware before this)
      const validRoles = ['admin', 'supervisor', 'agent'];
      const userRole = validRoles.includes(role) ? role : 'agent';

      const passwordHash = await bcrypt.hash(password, 12);

      const result = await query(
        `INSERT INTO users (username, password_hash, email, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, username, email, first_name, last_name, role, created_at`,
        [username, passwordHash, email || null, firstName || null, lastName || null, userRole]
      );

      res.status(201).json({ user: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Username or email already exists' });
      }
      logger.error('Register error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  async me(req, res) {
    try {
      const result = await query(
        'SELECT id, username, email, first_name, last_name, role, active, created_at FROM users WHERE id = $1',
        [req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      let agent = null;
      if (req.user.role === 'agent' && req.user.agentId) {
        const agentResult = await query(
          'SELECT id, sip_username, sip_password, extension, phone_type, status FROM agents WHERE id = $1',
          [req.user.agentId]
        );
        if (agentResult.rows.length > 0) {
          const a = agentResult.rows[0];
          agent = {
            id: a.id,
            sipUsername: a.sip_username,
            sipPassword: a.sip_password,
            extension: a.extension,
            phoneType: a.phone_type,
            status: a.status,
          };
        }
      }

      res.json({ user: result.rows[0], agent });
    } catch (err) {
      logger.error('Me error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};

module.exports = authController;
