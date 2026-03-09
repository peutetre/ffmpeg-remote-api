const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { upload } = require('../middleware/upload');
const FFmpegConfig = require('../config/ffmpeg');

const router = express.Router();

// POST /api/upload - Upload des assets
router.post('/', upload.array('files', 100), async (req, res) => {
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
    
    // Déplacer les fichiers vers le dossier de l'upload
    const uploadedFiles = [];
    
    for (const file of req.files) {
      const destPath = path.join(uploadPath, file.filename);
      await fs.copyFile(file.path, destPath);
      
      uploadedFiles.push({
        name: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        path: file.filename,
      });
      
      // Supprimer le fichier temporaire
      await fs.unlink(file.path);
    }
    
    // Supprimer le dossier temporaire créé par multer
    const tempDir = path.dirname(req.files[0].path);
    await fs.rm(tempDir, { recursive: true, force: true });
    
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

// GET /api/upload/:id - Lister les fichiers d'un upload
router.get('/:id', async (req, res) => {
  try {
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
        path: filePath,
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

// DELETE /api/upload/:id - Supprimer un upload
router.delete('/:id', async (req, res) => {
  try {
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
