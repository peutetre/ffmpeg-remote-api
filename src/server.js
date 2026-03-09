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

// Stocker io globalement pour les workers
global.io = io;

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
  console.error('Erreur inattendue:', err);
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
      console.error('⚠️  FFmpeg n\'est pas installé ou pas dans le PATH');
      console.error('Installation:', 'sudo apt-get install ffmpeg');
    } else {
      console.log(`✓ FFmpeg installé: version ${ffmpegStatus.version}`);
    }
    
    // Vérifier Redis
    try {
      await redisPub.ping();
      console.log('✓ Connexion Redis établie');
    } catch (error) {
      console.error('✗ Erreur de connexion Redis:', error.message);
      console.error('Assurez-vous que Redis est démarré: docker-compose up -d');
    }
    
    // Démarrer le serveur HTTP
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`\n🚀 FFmpeg Remote API démarrée sur http://localhost:${PORT}`);
      console.log(`📡 Socket.io disponible sur ws://localhost:${PORT}`);
      console.log(`\n📚 Documentation:`);
      console.log(`   - Health check: http://localhost:${PORT}/health`);
      console.log(`   - API info: http://localhost:${PORT}/`);
      console.log(`\n⚙️  Pour démarrer le worker:`);
      console.log(`   npm run worker`);
      console.log(`\n`);
    });
    
  } catch (error) {
    console.error('Erreur au démarrage:', error);
    process.exit(1);
  }
}

// Gestion des signaux de terminaison
process.on('SIGINT', () => {
  console.log('\nArrêt du serveur...');
  server.close(() => {
    redisPub.quit();
    redisSub.quit();
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('Arrêt du serveur...');
  server.close(() => {
    redisPub.quit();
    redisSub.quit();
    process.exit(0);
  });
});

startServer();
