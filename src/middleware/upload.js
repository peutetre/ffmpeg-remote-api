const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const FFmpegConfig = require('../config/ffmpeg');

// Configuration du stockage
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    // Créer un dossier unique pour chaque upload
    const uploadId = uuidv4();
    const uploadPath = path.join(FFmpegConfig.uploadDir, uploadId);
    
    await fs.mkdir(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Garder le nom original du fichier avec une extension unique
    const uniqueName = `${file.originalname.replace(/\s+/g, '_')}`;
    cb(null, uniqueName);
  },
});

// Filtrer les types de fichiers autorisés
const fileFilter = (req, file, cb) => {
  // Types MIME autorisés
  const allowedTypes = [
    // Vidéos
    'video/mp4', 'video/mpeg', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska',
    // Audio
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/x-m4a', 'audio/flac',
    // Images
    'image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp', 'image/tiff',
  ];
  
  // Vérifier le type MIME
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Type de fichier non autorisé: ${file.mimetype}`), false);
  }
};

// Limiter la taille des fichiers
const limits = {
  fileSize: FFmpegConfig.maxUploadSize * 1024 * 1024, // en octets
};

// Middleware multer configuré
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: limits,
});

// Middleware pour nettoyer les dossiers vides
const cleanupEmptyFolders = async (req, res, next) => {
  const originalJson = res.json;
  
  res.json = function(data) {
    // Nettoyer après la réponse
    setTimeout(async () => {
      try {
        await cleanupOldUploads();
      } catch (error) {
        console.error('Erreur lors du nettoyage:', error);
      }
    }, 100);
    
    return originalJson.apply(res, arguments);
  };
  
  next();
};

// Nettoyer les uploads anciens
const cleanupOldUploads = async () => {
  try {
    const uploadDir = FFmpegConfig.uploadDir;
    const uploads = await fs.readdir(uploadDir);
    const now = Date.now();
    const maxAge = FFmpegConfig.tempFileTTL * 60 * 60 * 1000;
    
    for (const upload of uploads) {
      if (upload === 'jobs') continue; // Ne pas toucher aux jobs
      
      const uploadPath = path.join(uploadDir, upload);
      const stat = await fs.stat(uploadPath);
      
      if (stat.isDirectory() && (now - stat.mtimeMs) > maxAge) {
        await fs.rm(uploadPath, { recursive: true });
      }
    }
  } catch (error) {
    // Ignorer les erreurs de nettoyage
  }
};

module.exports = {
  upload,
  cleanupEmptyFolders,
  cleanupOldUploads,
};
