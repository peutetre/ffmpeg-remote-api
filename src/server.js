const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs').promises;

const { redisOptions, redisPub, redisSub } = require('./config/redis');
const FFmpegConfig = require('./config/ffmpeg');
const { logger } = require('./utils/logger');
const { checkFfmpegInstalled } = require('./services/ffmpeg');
const { getQueueStats } = require('./services/jobQueue');

// Routes
const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');
const jobsRoutes = require('./routes/jobs');

// Initialisation Express
const app = express();
const server = http.createServer(app);

// Configuration Socket.io
const io = new Server(server, {
  cors: {
    origin: process.env.SOCKET_IO_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
});

// Redis pub/sub bridge: worker publishes events, server forwards to Socket.io
redisSub.subscribe('job:events');
redisSub.on('message', (channel, message) => {
  if (channel === 'job:events') {
    try {
      const event = JSON.parse(message);
      io.emit(`job:${event.jobId}:${event.type}`, event.data);
    } catch (error) {
      logger.error('Error parsing job event', { error: error.message });
    }
  }
});

// Request logging middleware
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode}`, { duration, ip: req.ip });
  });
  next();
});

// Middleware
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false, // Désactivé pour le développement
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Créer les dossiers nécessaires
async function createDirectories() {
  await fs.mkdir(FFmpegConfig.uploadDir, { recursive: true });
  await fs.mkdir(FFmpegConfig.outputDir, { recursive: true });
  await fs.mkdir(path.join(__dirname, '..', 'logs'), { recursive: true });
}

// Routes API
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/jobs', jobsRoutes);

// Route de santé
app.get('/health', async (req, res) => {
  const ffmpegStatus = await checkFfmpegInstalled();
  const queueStats = await getQueueStats();
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ffmpeg: ffmpegStatus,
    queue: queueStats,
  });
});

// Route racine
app.get('/', (req, res) => {
  res.json({
    name: 'FFmpeg Remote API',
    version: '1.0.0',
    description: 'API pour exécuter des jobs ffmpeg à distance',
    endpoints: {
      upload: {
        post: '/api/upload - Uploader des assets',
        get: '/api/upload/:id - Lister les fichiers',
        delete: '/api/upload/:id - Supprimer un upload',
      },
      jobs: {
        post: '/api/jobs - Créer un job',
        get: '/api/jobs/stats - Statistiques de la queue',
        get: '/api/jobs/:id - Statut d\'un job',
        delete: '/api/jobs/:id - Annuler un job',
        get: '/api/jobs/:id/result - Télécharger le résultat',
      },
    },
  });
});

// Socket.io - Connexions clients
io.on('connection', (socket) => {
  logger.info('Client connecté', { clientId: socket.id });
  
  // Abonnement à un job spécifique
  socket.on('subscribe:job', (jobId) => {
    socket.join(`job:${jobId}`);
    logger.info('Client abonné à un job', { clientId: socket.id, jobId });
  });
  
  socket.on('disconnect', () => {
    logger.info('Client déconnecté', { clientId: socket.id });
  });
});

// Gestion des erreurs
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack, path: req.originalUrl });
  res.status(500).json({
    error: 'Erreur interne du serveur',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Une erreur est survenue',
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route introuvable' });
});

// Démarrage du serveur
async function startServer() {
  try {
    // Créer les dossiers
    await createDirectories();
    
    // Vérifier ffmpeg
    const ffmpegStatus = await checkFfmpegInstalled();
    if (!ffmpegStatus.installed) {
      logger.error('FFmpeg is not installed or not in PATH');
    } else {
      logger.info(`FFmpeg installed: version ${ffmpegStatus.version}`);
    }
    
    // Vérifier Redis
    try {
      await redisPub.ping();
      logger.info('Redis connection established');
    } catch (error) {
      logger.error('Redis connection failed', { error: error.message });
    }
    
    // Démarrer le serveur HTTP
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      logger.info(`FFmpeg Remote API started on http://localhost:${PORT}`);
      logger.info(`Socket.io available on ws://localhost:${PORT}`);
    });
    
  } catch (error) {
    logger.error('Server startup failed', { error: error.message });
    process.exit(1);
  }
}

// Gestion des signaux de terminaison
process.on('SIGINT', () => {
  logger.info('Server shutting down (SIGINT)');
  server.close(() => {
    redisPub.quit();
    redisSub.quit();
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  logger.info('Server shutting down (SIGTERM)');
  server.close(() => {
    redisPub.quit();
    redisSub.quit();
    process.exit(0);
  });
});

startServer();
