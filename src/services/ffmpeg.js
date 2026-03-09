const { spawn, exec } = require('child_process');
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

// Parse and validate an ffmpeg/ffprobe command string.
// Returns { executable, args } or throws on invalid/dangerous input.
function parseFFmpegCommand(command) {
  const trimmed = command.trim();
  
  const allowedExecutables = ['ffmpeg', 'ffprobe'];
  
  // Shell-like argument splitting (handles quoted strings)
  const args = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';
  
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (inQuote) {
      if (char === quoteChar) {
        inQuote = false;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuote = true;
      quoteChar = char;
    } else if (char === ' ' || char === '\t') {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current) args.push(current);
  
  if (args.length === 0) throw new Error('Empty command');
  
  const executable = args.shift();
  if (!allowedExecutables.includes(executable)) {
    throw new Error(`Only ffmpeg and ffprobe are allowed, got: ${executable}`);
  }
  
  // Block shell metacharacters in arguments.
  // Since we use spawn() (no shell), only characters that could break out
  // of the process boundary are dangerous. Backslashes, parentheses, semicolons,
  // colons, and equals signs are all legitimate in FFmpeg filter expressions
  // (drawtext, overlay, xfade, etc.) and are harmless without a shell.
  const dangerous = /[&|`${}]/;
  
  for (const arg of args) {
    if (dangerous.test(arg)) {
      throw new Error(`Dangerous character in argument: ${arg}`);
    }
  }
  
  return { executable, args };
}

// Exécuter une commande ffmpeg
async function executeFfmpegCommand(jobId, command, inputDir, outputFileName, onProgress, onLog) {
  const outputDir = FFmpegConfig.outputDir;
  
  // Créer le dossier de sortie si nécessaire
  await fs.mkdir(outputDir, { recursive: true });
  
  // Chemin de sortie complet
  const outputPath = path.join(outputDir, outputFileName || `${jobId}.mp4`);
  
  // Logger pour ce job
  const logger = require('../utils/logger').createJobLogger(jobId);
  
  logger.info('Début de l\'exécution de la commande', { command, inputDir, outputPath });
  
  // Parse and validate the command (prevents command injection)
  const { executable, args } = parseFFmpegCommand(command);
  
  // Obtenir la durée du fichier source pour estimer la progression
  let sourceDuration = 0;
  // Find first -i argument to probe duration
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-i' && args[i + 1]) {
      const sourceFile = args[i + 1];
      if (!sourceFile.startsWith('http') && !sourceFile.startsWith('/dev/')) {
        const sourcePath = path.join(inputDir, sourceFile);
        sourceDuration = await getMediaDuration(sourcePath);
        logger.info('Durée du fichier source', { sourceFile, duration: sourceDuration });
      }
      break;
    }
  }
  
  // Determine ffmpeg's output file from the command args.
  // The last argument (that isn't an option value) is typically the output path.
  const ffmpegOutputName = args.length > 0 ? args[args.length - 1] : null;
  const finalOutputName = outputFileName || (ffmpegOutputName ? path.basename(ffmpegOutputName) : `${jobId}.mp4`);
  
  // Exécuter la commande via spawn (no shell)
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    const childProcess = spawn(executable, args, {
      cwd: inputDir,
      timeout: FFmpegConfig.defaultOptions.timeout,
      killSignal: 'SIGTERM',
    });
    
    let lastProgress = 0;
    
    const processLine = (line) => {
      if (!line.trim()) return;
      
      const parsed = parseFfmpegProgress(line);
      
      if (parsed.currentTime && sourceDuration > 0) {
        const progress = estimateProgress(parsed.currentTime, sourceDuration);
        if (Math.abs(progress - lastProgress) >= 5) {
          lastProgress = progress;
          onProgress(progress, { currentTime: parsed.currentTime, totalDuration: sourceDuration });
        }
      }
      
      onLog(line);
      logger.debug(line);
    };
    
    // Capturer stdout
    childProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) processLine(line);
    });
    
    // Capturer stderr (ffmpeg outputs progress info here)
    childProcess.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) processLine(line);
    });
    
    // Process terminé
    childProcess.on('close', async (code) => {
      const duration = Math.round((Date.now() - startTime) / 1000);
      
      if (code === 0) {
        // Move the output file from inputDir (ffmpeg CWD) to outputDir
        try {
          const ffmpegOutput = ffmpegOutputName ? path.join(inputDir, ffmpegOutputName) : null;
          const finalPath = path.join(outputDir, finalOutputName);
          
          if (ffmpegOutput) {
            try {
              await fs.access(ffmpegOutput);
              await fs.copyFile(ffmpegOutput, finalPath);
              await fs.unlink(ffmpegOutput).catch(() => {});
              logger.info('Output moved to outputDir', { from: ffmpegOutput, to: finalPath });
            } catch (moveErr) {
              logger.warn('Could not move output file, it may already be in outputDir', { error: moveErr.message });
            }
          }
        } catch (err) {
          logger.warn('Error during output file move', { error: err.message });
        }
        
        logger.info('Commande terminée avec succès', { code, duration });
        resolve({
          success: true,
          outputPath: path.join(outputDir, finalOutputName),
          outputFileName: finalOutputName,
          duration,
        });
      } else {
        logger.error('Commande échouée', { code, duration });
        reject(new Error(`ffmpeg a échoué avec le code ${code}`));
      }
    });
    
    // Erreur du processus
    childProcess.on('error', (error) => {
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
  parseFFmpegCommand,
};
