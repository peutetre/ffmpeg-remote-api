const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { redisClient } = require('../config/redis');
const { createJob, getJobStatus, cancelJob, getQueueStats, listJobs, getUserJobs, updateJobMetadata } = require('../services/jobQueue');
const { authenticate } = require('../middleware/auth');
const FFmpegConfig = require('../config/ffmpeg');

const router = express.Router();

// UUID format validation
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/jobs - Créer un nouveau job
router.post('/', authenticate, async (req, res) => {
  try {
    const { command, uploadId, outputFileName } = req.body;
    
    // Validation
    if (!command || typeof command !== 'string') {
      return res.status(400).json({
        error: 'Commande manquante',
        message: 'La commande ffmpeg est requise',
      });
    }
    
    if (!uploadId) {
      return res.status(400).json({
        error: 'Upload ID manquant',
        message: 'L\'ID de l\'upload est requis',
      });
    }
    
    // Validate uploadId format (path traversal protection)
    if (!UUID_RE.test(uploadId)) {
      return res.status(400).json({
        error: 'Upload ID invalide',
        message: 'L\'ID de l\'upload doit être un UUID valide',
      });
    }
    
    // Vérifier que l'upload existe
    const uploadPath = path.join(FFmpegConfig.uploadDir, uploadId);
    try {
      const stat = await fs.stat(uploadPath);
      if (!stat.isDirectory()) {
        throw new Error('Upload introuvable');
      }
    } catch (error) {
      return res.status(404).json({
        error: 'Upload introuvable',
        message: `L'upload ${uploadId} n'existe pas`,
      });
    }
    
    // Ajouter le job à la queue
    const jobId = await createJob({
      command,
      uploadId,
      inputDir: uploadPath,
      outputFileName,
      userId: req.userId,
    });
    
    res.status(201).json({
      success: true,
      jobId,
      message: 'Job créé avec succès',
    });
    
  } catch (error) {
    console.error('Erreur création job:', error);
    res.status(500).json({
      error: 'Erreur lors de la création du job',
      message: error.message,
    });
  }
});

// GET /api/jobs - Lister les jobs avec pagination
router.get('/', authenticate, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status = null,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search = '',
    } = req.query;
    
    const result = await getUserJobs(req.userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      status: status || null,
      sortBy,
      sortOrder,
      search,
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('Erreur liste jobs:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération des jobs',
      message: error.message,
    });
  }
});

// GET /api/jobs/stats - Statistiques de la queue (requires auth)
router.get('/stats', authenticate, async (req, res) => {
  try {
    const stats = await getQueueStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération des stats' });
  }
});

// GET /api/jobs/:id - Obtenir le statut d'un job
router.get('/:id', authenticate, async (req, res) => {
  try {
    const status = await getJobStatus(req.params.id);
    
    if (!status.exists) {
      return res.status(404).json({
        error: 'Job introuvable',
        message: `Le job ${req.params.id} n'existe pas`,
      });
    }
    
    // Vérifier que le job appartient à l'utilisateur
    const jobDataStr = await redisClient.hget('ffmpeg_jobs:data', req.params.id);
    if (jobDataStr) {
      const jobData = JSON.parse(jobDataStr);
      if (jobData.userId && jobData.userId !== req.userId) {
        return res.status(403).json({
          error: 'Interdit',
          message: 'Vous n\'avez pas accès à ce job',
        });
      }
    }
    
    res.json(status);
    
  } catch (error) {
    console.error('Erreur statut job:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération du statut',
      message: error.message,
    });
  }
});

// DELETE /api/jobs/:id - Annuler un job
router.delete('/:id', authenticate, async (req, res) => {
  try {
    // Vérifier que le job appartient à l'utilisateur
    const jobDataStr = await redisClient.hget('ffmpeg_jobs:data', req.params.id);
    if (jobDataStr) {
      const jobData = JSON.parse(jobDataStr);
      if (jobData.userId && jobData.userId !== req.userId) {
        return res.status(403).json({
          error: 'Interdit',
          message: 'Vous n\'avez pas accès à ce job',
        });
      }
    }
    
    const result = await cancelJob(req.params.id);
    
    if (!result.success) {
      return res.status(404).json({
        error: 'Job introuvable',
        message: result.error,
      });
    }
    
    res.json({
      success: true,
      message: 'Job annulé avec succès',
    });
    
  } catch (error) {
    console.error('Erreur annulation job:', error);
    res.status(500).json({
      error: 'Erreur lors de l\'annulation du job',
      message: error.message,
    });
  }
});

// GET /api/jobs/:id/result - Télécharger le résultat d'un job (requires auth)
router.get('/:id/result', authenticate, async (req, res) => {
  try {
    const status = await getJobStatus(req.params.id);
    
    if (!status.exists) {
      return res.status(404).json({ error: 'Job introuvable' });
    }
    
    // Vérifier que le job appartient à l'utilisateur
    const jobDataStr = await redisClient.hget('ffmpeg_jobs:data', req.params.id);
    if (jobDataStr) {
      const jobData = JSON.parse(jobDataStr);
      if (jobData.userId && jobData.userId !== req.userId) {
        return res.status(403).json({
          error: 'Interdit',
          message: 'Vous n\'avez pas accès à ce job',
        });
      }
    }
    
    if (status.status !== 'completed') {
      return res.status(400).json({
        error: 'Job non terminé',
        message: `Le job est en statut: ${status.status}`,
      });
    }
    
    if (!status.result || !status.result.outputFileName) {
      return res.status(400).json({
        error: 'Aucun résultat disponible',
        message: 'Le job n\'a pas produit de fichier',
      });
    }
    
    const outputPath = path.join(FFmpegConfig.outputDir, status.result.outputFileName);
    
    // Vérifier que le fichier existe
    try {
      await fs.access(outputPath);
    } catch (error) {
      return res.status(404).json({ error: 'Fichier de sortie introuvable' });
    }
    
    // Obtenir la taille du fichier pour le header Content-Length
    const stat = await fs.stat(outputPath);
    
    // Envoyer le fichier
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${status.result.outputFileName}"`);
    
    // Use sync fs for createReadStream (not available on fs.promises)
    const stream = fsSync.createReadStream(outputPath);
    stream.pipe(res);
    
  } catch (error) {
    console.error('Erreur téléchargement résultat:', error);
    res.status(500).json({
      error: 'Erreur lors du téléchargement',
      message: error.message,
    });
  }
});

module.exports = router;
