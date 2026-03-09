const { Worker } = require('bullmq');
const { redisOptions } = require('../config/redis');
const { executeFfmpegCommand } = require('../services/ffmpeg');
const { updateJobProgress } = require('../services/jobQueue');
const { logger, createJobLogger } = require('../utils/logger');
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
    
    // Logger pour ce job (file-based)
    const jobLogger = createJobLogger(id);
    
    logger.info('Job processing started', { jobId: id, command, uploadId });
    jobLogger.info('Début du traitement du job', { command, uploadId, inputDir });
    
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
        jobLogger.error('Erreur mise à jour progression', { error });
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
    
    logger.info('Job completed', { jobId: id, outputFileName: result.outputFileName });
    jobLogger.info('Job terminé avec succès', result);
    
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
  logger.error('Worker error', { error: error.message });
});

// Gestion des erreurs de jobs
worker.on('failed', async (job, error) => {
  if (job) {
    const jobLogger = createJobLogger(job.id);
    logger.error('Job failed', { jobId: job.id, error: error.message });
    jobLogger.error('Job échoué', { error: error.message });
    
    publishEvent('failed', job.id, { error: error.message });
  }
});

worker.on('completed', async (job) => {
  if (job) {
    const jobLogger = createJobLogger(job.id);
    jobLogger.info('Job complété', { result: job.returnvalue });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Worker shutting down (SIGINT)');
  await worker.close();
  await redisPub.quit();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Worker shutting down (SIGTERM)');
  await worker.close();
  await redisPub.quit();
  process.exit(0);
});

module.exports = worker;
