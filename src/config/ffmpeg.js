// Configuration pour ffmpeg

const defaultTimeoutHours = parseInt(process.env.FFPROG_TIMEOUT_HOURS) || 2;
const defaultTimeoutMs = defaultTimeoutHours * 60 * 60 * 1000;

const FFmpegConfig = {
  // Timeout par défaut pour les jobs (en heures)
  defaultTimeout: defaultTimeoutHours,
  
  // Taille max des uploads (en MB)
  maxUploadSize: parseInt(process.env.MAX_UPLOAD_SIZE_MB) || 5000,
  
  // Nombre max de jobs en parallèle
  maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS) || 4,
  
  // Chemins des dossiers
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  outputDir: process.env.OUTPUT_DIR || './output',
  
  // Durée de vie des fichiers temporaires (en heures)
  tempFileTTL: parseInt(process.env.TEMP_FILE_TTL_HOURS) || 24,
  
  // Options par défaut pour ffmpeg
  defaultOptions: {
    // Timeout pour l'exécution de la commande
    timeout: defaultTimeoutMs,
    
    // Kill signal sur timeout
    killSignal: 'SIGTERM',
  },
};

module.exports = FFmpegConfig;
