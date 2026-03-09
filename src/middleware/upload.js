const multer = require('multer');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const FFmpegConfig = require('../config/ffmpeg');

const tempUploadDir = path.join(os.tmpdir(), 'ffmpeg-remote-api-uploads');

// Configuration du stockage — files land in a shared temp dir,
// then the route handler moves them into the final UUID folder.
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(tempUploadDir, { recursive: true });
      cb(null, tempUploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    // Prefix with timestamp to avoid collisions in the shared temp dir
    const uniqueName = `${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`;
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
    // Text (FFmpeg filter_complex_script files)
    'text/plain',
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
  cleanupOldUploads,
};
