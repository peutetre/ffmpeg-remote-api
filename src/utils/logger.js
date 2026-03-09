const winston = require('winston');

const consoleFormat = winston.format.printf(({ timestamp, level, message, ...meta }) => {
  const metadata = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] ${level}: ${message}${metadata}`;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'ffmpeg-remote-api' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.colorize({ all: true }),
        consoleFormat
      ),
    }),
  ],
});

// Logger dédié aux jobs
const createJobLogger = (jobId) => {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return `[${timestamp}] [${jobId}] [${level.toUpperCase()}] ${message} ${JSON.stringify(meta)}`;
      })
    ),
    defaultMeta: { service: 'ffmpeg-remote-api', jobId },
    transports: [
      new winston.transports.File({ filename: `logs/job-${jobId}.log` }),
    ],
  });
};

module.exports = {
  logger,
  createJobLogger,
};
