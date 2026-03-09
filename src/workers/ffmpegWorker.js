const { Worker } = require('bullmq');
const { redisOptions } = require('../config/redis');
const { executeFfmpegCommand } = require('../services/ffmpeg');
const { updateJobProgress } = require('../services/jobQueue');
const { createJobLogger } = require('../utils/logger');
const FFmpegConfig = require('../config/ffmpeg');

const QUEUE_NAME = 'ffmpeg_jobs';

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
        
        // Publier l'événement pour les clients WebSocket
        if (global.io) {
          global.io.emit(`job:${id}:progress`, { progress, data });
        }
      } catch (error) {
        logger.error('Erreur mise à jour progression', { error });
      }
    };
    
    // Fonction callback pour les logs
    const onLog = (line) => {
      // Publier l'événement pour les clients WebSocket
      if (global.io) {
        global.io.emit(`job:${id}:log`, { line });
      }
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
    if (global.io) {
      global.io.emit(`job:${id}:completed`, result);
    }
    
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
    
    // Publier l'événement d'erreur
    if (global.io) {
      global.io.emit(`job:${job.id}:failed`, { error: error.message });
    }
  }
});

worker.on('completed', async (job) => {
  if (job) {
    const logger = createJobLogger(job.id);
    logger.info('Job complété', { result: job.returnvalue });
  }
});

module.exports = worker;
