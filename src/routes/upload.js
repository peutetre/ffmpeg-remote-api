const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { upload } = require('../middleware/upload');
const { authenticate } = require('../middleware/auth');
const FFmpegConfig = require('../config/ffmpeg');

const router = express.Router();

// UUID format validation
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/upload - Upload des assets (requires auth)
router.post('/', authenticate, upload.array('files', 100), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'Aucun fichier uploadé',
        message: 'Veuillez uploader au moins un fichier',
      });
    }
    
    // Générer un ID unique pour cet upload
    const uploadId = uuidv4();
    const uploadPath = path.join(FFmpegConfig.uploadDir, uploadId);
    await fs.mkdir(uploadPath, { recursive: true });
    
    // Déplacer les fichiers du dossier temp vers le dossier final
    const uploadedFiles = [];
    
    for (const file of req.files) {
      // Strip the timestamp prefix we added in multer filename
      const originalName = file.originalname.replace(/\s+/g, '_');
      const destPath = path.join(uploadPath, originalName);
      // Use copyFile + unlink instead of rename (rename fails across filesystems)
      await fs.copyFile(file.path, destPath);
      await fs.unlink(file.path).catch(() => {});
      
      uploadedFiles.push({
        name: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        path: originalName,
      });
    }
    
    res.json({
      success: true,
      uploadId,
      files: uploadedFiles,
      message: `${uploadedFiles.length} fichier(s) uploadé(s) avec succès`,
    });
    
  } catch (error) {
    console.error('Erreur upload:', error);
    res.status(500).json({
      error: 'Erreur lors de l\'upload',
      message: error.message,
    });
  }
});

// GET /api/upload/:id - Lister les fichiers d'un upload (requires auth)
router.get('/:id', authenticate, async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ error: 'ID invalide' });
    }
    
    const uploadPath = path.join(FFmpegConfig.uploadDir, req.params.id);
    
    const stat = await fs.stat(uploadPath);
    if (!stat.isDirectory()) {
      return res.status(404).json({ error: 'Upload introuvable' });
    }
    
    const files = await fs.readdir(uploadPath);
    const fileList = [];
    
    for (const file of files) {
      const filePath = path.join(uploadPath, file);
      const fileStat = await fs.stat(filePath);
      
      fileList.push({
        name: file,
        size: fileStat.size,
      });
    }
    
    res.json({
      success: true,
      uploadId: req.params.id,
      files: fileList,
    });
    
  } catch (error) {
    res.status(404).json({ error: 'Upload introuvable' });
  }
});

// DELETE /api/upload/:id - Supprimer un upload (requires auth)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.id)) {
      return res.status(400).json({ error: 'ID invalide' });
    }
    
    const uploadPath = path.join(FFmpegConfig.uploadDir, req.params.id);
    
    await fs.rm(uploadPath, { recursive: true, force: true });
    
    res.json({
      success: true,
      message: 'Upload supprimé avec succès',
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

module.exports = router;
