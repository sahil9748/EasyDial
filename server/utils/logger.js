const winston = require('winston');
const config = require('../config');

const logger = winston.createLogger({
  level: config.env === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
      let log = `${timestamp} [${level.toUpperCase()}] ${message}`;
      if (stack) log += `\n${stack}`;
      if (Object.keys(meta).length > 0) log += ` ${JSON.stringify(meta)}`;
      return log;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error', maxsize: 10485760, maxFiles: 5 }),
    new winston.transports.File({ filename: 'logs/combined.log', maxsize: 10485760, maxFiles: 5 }),
  ],
});

module.exports = logger;
