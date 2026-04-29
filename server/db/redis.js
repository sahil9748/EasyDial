const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 5000);
    return delay;
  },
  lazyConnect: false,
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (err) => {
  logger.error('Redis error', err.message);
});

// Separate client for pub/sub subscriber
const redisSub = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    return Math.min(times * 200, 5000);
  },
});

redisSub.on('error', (err) => {
  logger.error('Redis subscriber error', err.message);
});

module.exports = { redis, redisSub };
