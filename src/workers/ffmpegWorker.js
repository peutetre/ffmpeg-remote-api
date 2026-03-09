const { Worker } = require('bullmq');
const { redisOptions } = require('../config/redis');
const { executeFfmpegCommand } = require('../services/ffmpeg');
const { updateJobProgress } = require('../services/jobQueue');
const { createJobLogger } = require('../utils/logger');
const FFmpegConfig = require('../config/ffmpeg');
const { Redis } = require('ioredis');

const QUEUE_NAME = 'ffmpeg_jobs';

// Dedicated Redis publisher for worker→server events
const redisPub = new Redis(redisOptions);

function publishEvent(type, jobId, data) {
  redisPub.publish('job:events', JSON.stringify({ type, jobId, data }));
}

// Créer le worker
const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const { id, data } = job;
    const { command, uploadId, inputDir, outputFileName } = data;
    
    // Logger pour ce job
    const logger = createJobLogger(id);
    
    logger.info('Début du traitement du job', { command, uploadId, inputDir });
    
    // Fonction callback pour les mises à jour de progression
    const onProgress = async (progress, data) => {
      try {
        await updateJobProgress(id, progress, {
          currentTime: data.currentTime,
          totalDuration: data.totalDuration,
        });
        
        // Publier via Redis pub/sub (worker runs in separate process)
        publishEvent('progress', id, { progress, data });
      } catch (error) {
        logger.error('Erreur mise à jour progression', { error });
      }
    };
    
    // Fonction callback pour les logs
    const onLog = (line) => {
      publishEvent('log', id, { line });
    };
    
    // Exécuter la commande ffmpeg
    const result = await executeFfmpegCommand(
      id,
      command,
      inputDir,
      outputFileName,
      onProgress,
      onLog
    );
    
    // Publier l'événement de succès
    publishEvent('completed', id, result);
    
    logger.info('Job terminé avec succès', result);
    
    return result;
    
  },
  {
    connection: redisOptions,
    concurrency: FFmpegConfig.maxConcurrentJobs,
    limiter: {
      max: FFmpegConfig.maxConcurrentJobs,
      duration: 1000,
    },
  }
);

// Gestion des erreurs du worker
worker.on('error', (error) => {
  console.error('Erreur du worker:', error);
});

// Gestion des erreurs de jobs
worker.on('failed', async (job, error) => {
  if (job) {
    const logger = createJobLogger(job.id);
    logger.error('Job échoué', { error: error.message });
    
    publishEvent('failed', job.id, { error: error.message });
  }
});

worker.on('completed', async (job) => {
  if (job) {
    const logger = createJobLogger(job.id);
    logger.info('Job complété', { result: job.returnvalue });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nArrêt du worker...');
  await worker.close();
  await redisPub.quit();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Arrêt du worker...');
  await worker.close();
  await redisPub.quit();
  process.exit(0);
});

module.exports = worker;
