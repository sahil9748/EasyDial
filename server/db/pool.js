const { Pool } = require('pg');
const config = require('../config');
const logger = require('../utils/logger');

const pool = new Pool(config.db);

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', err);
});

pool.on('connect', () => {
  logger.debug('New PostgreSQL client connected');
});

// Helper for single queries
const query = (text, params) => pool.query(text, params);

// Helper for transactions
const getClient = () => pool.connect();

module.exports = { pool, query, getClient };
