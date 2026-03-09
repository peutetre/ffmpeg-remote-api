const { Queue, QueueEvents } = require('bullmq');
const { redisOptions, redisClient } = require('../config/redis');
const { createJobLogger } = require('../utils/logger');

const QUEUE_NAME = 'ffmpeg_jobs';
const JOBS_KEY = 'ffmpeg_jobs:data';

// Initialisation de la queue
const jobQueue = new Queue(QUEUE_NAME, {
  connection: redisOptions,
  defaultJobOptions: {
    attempts: 1, // Pas de retry automatique pour ffmpeg (trop long)
    removeOnComplete: { age: 24 * 60 * 60 }, // Nettoyer les jobs terminés après 24h
    removeOnFail: { age: 7 * 24 * 60 * 60 }, // Garder les jobs échoués 7 jours
  },
});

// QueueEvents pour écouter les changements de statut
const queueEvents = new QueueEvents(QUEUE_NAME, {
  connection: redisOptions,
});

// Mapping des statuts BullMQ vers nos statuts
const STATUS_MAP = {
  waiting: 'pending',
  paused: 'pending',
  delayed: 'pending',
  active: 'processing',
  completed: 'completed',
  failed: 'failed',
  canceled: 'canceled',
};

// Créer un job
async function createJob(data) {
  const { id } = await jobQueue.add('ffmpeg', data);
  
  // Sauvegarder les métadonnées pour la pagination
  const jobData = {
    id,
    ...data,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  
  await redisClient.hset(JOBS_KEY, id, JSON.stringify(jobData));
  
  return id;
}

// Obtenir le statut d'un job
async function getJobStatus(jobId) {
  try {
    const job = await jobQueue.getJob(jobId);
    
    if (!job) {
      return { exists: false };
    }

    const state = await job.getState();
    const progress = await job.progress();
    const result = await job.returnvalue;
    const failedReason = await job.failedReason;

    return {
      exists: true,
      id: jobId,
      status: STATUS_MAP[state] || 'unknown',
      progress: typeof progress === 'number' ? progress : 0,
      result: result,
      failedReason: failedReason,
      processedAt: job.processedOn,
      createdAt: job.createdAt,
    };
  } catch (error) {
    return { exists: false, error: error.message };
  }
}

// Annuler un job
async function cancelJob(jobId) {
  try {
    const job = await jobQueue.getJob(jobId);
    if (job) {
      await job.remove();
      return { success: true };
    }
    return { success: false, error: 'Job not found' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Mettre à jour la progression d'un job
async function updateJobProgress(jobId, progress, data = {}) {
  try {
    await jobQueue.updateJobProgress(jobId, progress, data);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Mettre à jour le statut d'un job dans les métadonnées
async function updateJobMetadata(jobId, updates) {
  const jobDataStr = await redisClient.hget(JOBS_KEY, jobId);
  if (jobDataStr) {
    const jobData = JSON.parse(jobDataStr);
    Object.assign(jobData, updates);
    await redisClient.hset(JOBS_KEY, jobId, JSON.stringify(jobData));
  }
}

// Lister les jobs avec pagination
async function listJobs(options = {}) {
  const {
    page = 1,
    limit = 20,
    status = null,
    userId = null,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    search = '',
  } = options;
  
  // Récupérer tous les jobs depuis les métadonnées
  const allJobsData = await redisClient.hgetall(JOBS_KEY);
  
  let jobs = Object.entries(allJobsData).map(([id, dataStr]) => {
    const data = JSON.parse(dataStr);
    data.id = id;
    return data;
  });
  
  // Filtrer par statut
  if (status) {
    jobs = jobs.filter(job => job.status === status);
  }
  
  // Filtrer par utilisateur
  if (userId) {
    jobs = jobs.filter(job => job.userId === userId);
  }
  
  // Filtrer par recherche
  if (search) {
    const searchLower = search.toLowerCase();
    jobs = jobs.filter(job => 
      job.command?.toLowerCase().includes(searchLower) ||
      job.outputFileName?.toLowerCase().includes(searchLower) ||
      job.id.toLowerCase().includes(searchLower)
    );
  }
  
  // Trier
  jobs.sort((a, b) => {
    let comparison = 0;
    
    if (sortBy === 'createdAt') {
      comparison = new Date(a.createdAt) - new Date(b.createdAt);
    } else if (sortBy === 'progress') {
      comparison = (a.progress || 0) - (b.progress || 0);
    } else if (sortBy === 'status') {
      const statusOrder = { pending: 1, processing: 2, completed: 3, failed: 4 };
      comparison = (statusOrder[a.status] || 9) - (statusOrder[b.status] || 9);
    }
    
    return sortOrder === 'desc' ? -comparison : comparison;
  });
  
  // Calculer le total avant pagination
  const total = jobs.length;
  
  // Appliquer la pagination
  const startIndex = (page - 1) * limit;
  const paginatedJobs = jobs.slice(startIndex, startIndex + limit);
  
  // Enrichir avec les détails de la queue pour les jobs actifs
  const enrichedJobs = await Promise.all(paginatedJobs.map(async (job) => {
    const queueJob = await jobQueue.getJob(job.id);
    if (queueJob) {
      const state = await queueJob.getState();
      job.status = STATUS_MAP[state] || job.status;
      job.progress = await queueJob.progress();
    }
    return job;
  }));
  
  return {
    jobs: enrichedJobs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1,
    },
  };
}

// Obtenir les jobs d'un utilisateur
async function getUserJobs(userId, options = {}) {
  return listJobs({ ...options, userId });
}

// Obtenir les jobs en attente/en cours
async function getQueueStats() {
  const waiting = await jobQueue.getWaitingCount();
  const active = await jobQueue.getActiveCount();
  const completed = await jobQueue.getCompletedCount();
  const failed = await jobQueue.getFailedCount();
  
  return {
    waiting,
    active,
    completed,
    failed,
    total: waiting + active,
  };
}

// Écouter les événements de la queue
function onEvent(event, callback) {
  queueEvents.on(event, (data) => {
    callback(data);
  });
}

module.exports = {
  jobQueue,
  queueEvents,
  createJob,
  getJobStatus,
  cancelJob,
  updateJobProgress,
  updateJobMetadata,
  getQueueStats,
  listJobs,
  getUserJobs,
  onEvent,
  STATUS_MAP,
};
