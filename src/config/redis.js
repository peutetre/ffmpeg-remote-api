const { Redis } = require('ioredis');

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

// Options Redis compatibles avec BullMQ (sans maxRetriesPerRequest)
const redisOptions = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
};

// Exporter les options pour BullMQ (pas une instance)
module.exports.redisOptions = redisOptions;

// Instance Redis principale pour les services (users, auth, jobs)
const redisClient = new Redis(redisOptions);

// Instances Redis pour Socket.io (pub/sub)
const redisPub = new Redis(redisOptions);
const redisSub = new Redis(redisOptions);

module.exports = {
  redisOptions, // Pour BullMQ
  redisClient,  // Pour les services (users, auth, jobs)
  redisPub,     // Pour Socket.io
  redisSub,     // Pour Socket.io
};
