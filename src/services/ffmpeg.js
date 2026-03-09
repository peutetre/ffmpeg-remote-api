const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const FFmpegConfig = require('../config/ffmpeg');

const execAsync = promisify(exec);

// Vérifier que ffmpeg est installé
async function checkFfmpegInstalled() {
  try {
    const { stdout } = await execAsync('ffmpeg -version');
    const versionMatch = stdout.match(/ffmpeg version ([^\s]+)/);
    return {
      installed: true,
      version: versionMatch ? versionMatch[1] : 'unknown',
    };
  } catch (error) {
    return { installed: false, error: error.message };
  }
}

// Obtenir la durée d'un fichier vidéo/audio
async function getMediaDuration(filePath) {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    );
    const duration = parseFloat(stdout);
    return isNaN(duration) ? 0 : duration;
  } catch (error) {
    return 0;
  }
}

// Estimer la progression basée sur la durée
function estimateProgress(currentTime, totalDuration) {
  if (!totalDuration || totalDuration === 0) return 0;
  const progress = Math.min(100, Math.round((currentTime / totalDuration) * 100));
  return progress;
}

// Parser les logs ffmpeg pour extraire la progression
function parseFfmpegProgress(line) {
  // Regex pour extraire le timestamp (ex: "frame= 1234 time=00:01:30.123")
  const timeMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2})\.\d+/);
  
  if (timeMatch) {
    const hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2]);
    const seconds = parseInt(timeMatch[3]);
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    return { currentTime: totalSeconds, raw: line };
  }
  
  return { raw: line };
}

// Exécuter une commande ffmpeg
async function executeFfmpegCommand(jobId, command, inputDir, outputFileName, onProgress, onLog) {
  const workspaceDir = path.join(FFmpegConfig.uploadDir, 'jobs', jobId);
  const outputDir = FFmpegConfig.outputDir;
  
  // Créer le dossier de sortie si nécessaire
  await fs.mkdir(outputDir, { recursive: true });
  
  // Chemin de sortie complet
  const outputPath = path.join(outputDir, outputFileName || `${jobId}.mp4`);
  
  // Logger pour ce job
  const logger = require('../utils/logger').createJobLogger(jobId);
  
  logger.info('Début de l\'exécution de la commande', { command, inputDir, outputPath });
  
  // Vérifier que les fichiers d'entrée existent
  const inputFiles = command.match(/-["']?[a-zA-Z]+["']?\s+["']?([^"'\s]+)["']?/g) || [];
  for (const match of inputFiles) {
    const filePath = match.match(/["']?([^"'\s]+)["']?$/)?.[1];
    if (filePath && !filePath.startsWith('http') && !filePath.startsWith('/dev/')) {
      const fullPath = path.join(inputDir, filePath);
      try {
        await fs.access(fullPath);
      } catch (error) {
        logger.error('Fichier d\'entrée introuvable', { filePath, fullPath });
        throw new Error(`Fichier d\'entrée introuvable: ${filePath}`);
      }
    }
  }
  
  // Obtenir la durée du fichier source pour estimer la progression
  let sourceDuration = 0;
  const sourceFileMatch = command.match(/-["']?[a-zA-Z]+["']?\s+["']?(\S+)["']?/);
  if (sourceFileMatch) {
    const sourceFile = sourceFileMatch[1];
    if (!sourceFile.startsWith('http') && !sourceFile.startsWith('/dev/')) {
      const sourcePath = path.join(inputDir, sourceFile);
      sourceDuration = await getMediaDuration(sourcePath);
      logger.info('Durée du fichier source', { sourceFile, duration: sourceDuration });
    }
  }
  
  // Exécuter la commande
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    // Créer le processus ffmpeg
    const process = exec(command, {
      cwd: inputDir,
      timeout: FFmpegConfig.defaultOptions.timeout,
      killSignal: 'SIGTERM',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });
    
    let lastProgress = 0;
    
    // Capturer stdout
    process.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      
      for (const line of lines) {
        if (line.trim()) {
          // Parser la progression
          const parsed = parseFfmpegProgress(line);
          
          // Mettre à jour la progression si une durée source est disponible
          if (parsed.currentTime && sourceDuration > 0) {
            const progress = estimateProgress(parsed.currentTime, sourceDuration);
            
            // Ne mettre à jour que si la progression a changé de plus de 5%
            if (Math.abs(progress - lastProgress) >= 5) {
              lastProgress = progress;
              onProgress(progress, { currentTime: parsed.currentTime, totalDuration: sourceDuration });
            }
          }
          
          // Logger la ligne
          onLog(line);
          logger.debug(line);
        }
      }
    });
    
    // Capturer stderr (les messages d'erreur et d'info de ffmpeg)
    process.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      
      for (const line of lines) {
        if (line.trim()) {
          // Parser la progression
          const parsed = parseFfmpegProgress(line);
          
          // Mettre à jour la progression
          if (parsed.currentTime && sourceDuration > 0) {
            const progress = estimateProgress(parsed.currentTime, sourceDuration);
            
            if (Math.abs(progress - lastProgress) >= 5) {
              lastProgress = progress;
              onProgress(progress, { currentTime: parsed.currentTime, totalDuration: sourceDuration });
            }
          }
          
          // Logger
          onLog(line);
          logger.debug(line);
        }
      }
    });
    
    // Process terminé
    process.on('close', (code) => {
      const duration = Math.round((Date.now() - startTime) / 1000);
      
      if (code === 0) {
        logger.info('Commande terminée avec succès', { code, duration });
        resolve({
          success: true,
          outputPath,
          outputFileName: path.basename(outputPath),
          duration,
        });
      } else {
        logger.error('Commande échouée', { code, duration });
        reject(new Error(`ffmpeg a échoué avec le code ${code}`));
      }
    });
    
    // Erreur du processus
    process.on('error', (error) => {
      logger.error('Erreur du processus', { error });
      reject(error);
    });
  });
}

module.exports = {
  checkFfmpegInstalled,
  getMediaDuration,
  executeFfmpegCommand,
  parseFfmpegProgress,
};
