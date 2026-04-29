require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME || 'callcenter',
    user: process.env.DB_USER || 'callcenter',
    password: process.env.DB_PASS || 'changeme',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  ari: {
    url: process.env.ARI_URL || 'http://localhost:8088',
    user: process.env.ARI_USER || 'callcenter',
    pass: process.env.ARI_PASS || 'changeme',
    app: process.env.ARI_APP || 'callcenter',
  },

  ami: {
    host: process.env.AMI_HOST || 'localhost',
    port: parseInt(process.env.AMI_PORT, 10) || 5038,
    user: process.env.AMI_USER || 'callcenter',
    pass: process.env.AMI_PASS || 'changeme',
  },

  domain: process.env.DOMAIN || 'localhost',
  recordingPath: process.env.RECORDING_PATH || '/var/spool/asterisk/monitor',
  trunkEncryptKey: process.env.TRUNK_ENCRYPT_KEY || '0123456789abcdef0123456789abcdef',
};

module.exports = config;
