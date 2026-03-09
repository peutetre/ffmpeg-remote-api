#!/usr/bin/env node

const { Command } = require('commander');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const FormData = require('form-data');
const ora = require('ora');
const chalk = require('chalk').default;

// Configuration
const HOME_DIR = os.homedir();
const CONFIG_FILE = path.join(HOME_DIR, '.ffmpeg-api-config');

// Programme principal
const program = new Command();

program
  .name('ffmpeg-api')
  .description('CLI pour l\'API FFmpeg Remote')
  .version('1.0.0');

// Utilitaires

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (error) {
    console.error(chalk.red('Erreur lors du chargement de la configuration'));
  }
  return null;
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function getApiUrl(config) {
  return process.env.API_URL || config?.apiUrl || 'http://localhost:3000';
}

function getHeaders(config) {
  const headers = { 'Content-Type': 'application/json' };
  if (config?.accessToken) {
    headers['Authorization'] = `Bearer ${config.accessToken}`;
  }
  return headers;
}

function isAuthorized(config) {
  return config && config.accessToken;
}

// Commandes Auth

const authCmd = program.command('auth')
  .description('Commandes d\'authentification');

authCmd.command('register <email> <password>')
  .option('-n, --name <name>', 'Nom de l\'utilisateur')
  .option('-u, --url <url>', 'URL de l\'API')
  .description('Créer un nouvel utilisateur')
  .action(async (email, password, options) => {
    const apiUrl = options.url || getApiUrl(loadConfig());
    
    try {
      const response = await axios.post(`${apiUrl}/api/auth/register`, {
        email,
        password,
        name: options.name,
      });
      
      const config = {
        apiUrl,
        email,
        accessToken: response.data.accessToken,
        refreshToken: response.data.refreshToken,
      };
      
      saveConfig(config);
      
      console.log(chalk.green('✓ Inscription réussie !'));
      console.log(chalk.cyan(`  Email: ${response.data.user.email}`));
      console.log(chalk.cyan(`  Nom: ${response.data.user.name}`));
      console.log(chalk.cyan(`  ID: ${response.data.user.id}`));
      console.log(chalk.yellow('  Token sauvegardé dans ~/.ffmpeg-api-config'));
      
    } catch (error) {
      if (error.response?.status === 409) {
        console.error(chalk.red('✗ Email déjà utilisé'));
        console.error(chalk.yellow('  Utilisez "ffmpeg-api auth login" pour vous connecter'));
      } else {
        console.error(chalk.red('✗ Erreur :'), error.response?.data?.message || error.message);
      }
      process.exit(1);
    }
  });

authCmd.command('login <email> <password>')
  .option('-u, --url <url>', 'URL de l\'API')
  .description('Se connecter')
  .action(async (email, password, options) => {
    const apiUrl = options.url || getApiUrl(loadConfig());
    
    try {
      const response = await axios.post(`${apiUrl}/api/auth/login`, {
        email,
        password,
      });
      
      const config = {
        apiUrl,
        email,
        accessToken: response.data.accessToken,
        refreshToken: response.data.refreshToken,
      };
      
      saveConfig(config);
      
      console.log(chalk.green('✓ Connexion réussie !'));
      console.log(chalk.cyan(`  Email: ${response.data.user.email}`));
      console.log(chalk.cyan(`  Nom: ${response.data.user.name}`));
      console.log(chalk.cyan(`  ID: ${response.data.user.id}`));
      
    } catch (error) {
      console.error(chalk.red('✗ Identifiants incorrects'));
      process.exit(1);
    }
  });

authCmd.command('logout')
  .description('Se déconnecter')
  .action(async () => {
    const config = loadConfig();
    
    if (!config?.accessToken) {
      console.log(chalk.yellow('⚠ Vous n\'êtes pas connecté'));
      return;
    }
    
    try {
      const apiUrl = getApiUrl(config);
      await axios.post(`${apiUrl}/api/auth/logout`, {}, {
        headers: getHeaders(config),
      });
      
      fs.unlinkSync(CONFIG_FILE);
      console.log(chalk.green('✓ Déconnexion réussie'));
      
    } catch (error) {
      console.error(chalk.red('✗ Erreur :'), error.message);
      process.exit(1);
    }
  });

authCmd.command('me')
  .description('Afficher l\'utilisateur courant')
  .action(async () => {
    const config = loadConfig();
    
    if (!config?.accessToken) {
      console.log(chalk.yellow('⚠ Vous n\'êtes pas connecté'));
      console.log(chalk.yellow('  Utilisez "ffmpeg-api auth login" pour vous connecter'));
      return;
    }
    
    try {
      const apiUrl = getApiUrl(config);
      const response = await axios.get(`${apiUrl}/api/auth/me`, {
        headers: getHeaders(config),
      });
      
      const user = response.data.user;
      console.log(chalk.bold('Utilisateur connecté :'));
      console.log(chalk.cyan(`  ID:    ${user.id}`));
      console.log(chalk.cyan(`  Nom:   ${user.name}`));
      console.log(chalk.cyan(`  Email: ${user.email}`));
      console.log(chalk.cyan(`  Créé:  ${user.createdAt}`));
      
    } catch (error) {
      if (error.response?.status === 401) {
        console.log(chalk.yellow('⚠ Token expiré ou invalide'));
        console.log(chalk.yellow('  Utilisez "ffmpeg-api auth login" pour vous reconnecter'));
      } else {
        console.error(chalk.red('✗ Erreur :'), error.message);
      }
      process.exit(1);
    }
  });

authCmd.command('refresh')
  .description('Rafraîchir le token')
  .action(async () => {
    const config = loadConfig();
    
    if (!config?.refreshToken) {
      console.log(chalk.yellow('⚠ Aucun token de rafraîchissement trouvé'));
      console.log(chalk.yellow('  Utilisez "ffmpeg-api auth login" pour vous connecter'));
      return;
    }
    
    try {
      const apiUrl = getApiUrl(config);
      const response = await axios.post(`${apiUrl}/api/auth/refresh`, {
        refreshToken: config.refreshToken,
      });
      
      config.accessToken = response.data.accessToken;
      saveConfig(config);
      
      console.log(chalk.green('✓ Token rafraîchi'));
      
    } catch (error) {
      console.error(chalk.red('✗ Erreur :'), error.response?.data?.message || error.message);
      process.exit(1);
    }
  });

// Commandes Upload

const uploadCmd = program.command('upload')
  .description('Uploader des fichiers')
  .argument('[files...]', 'Fichiers à uploader');

uploadCmd.action(async (files, options) => {
  const config = loadConfig();
  
  if (!files || files.length === 0) {
    console.error(chalk.red('✗ Aucun fichier spécifié'));
    console.error(chalk.yellow('  Usage: ffmpeg-api upload <file1> [file2] ...'));
    process.exit(1);
  }
  
  // Vérifier que les fichiers existent
  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.error(chalk.red(`✗ Fichier introuvable: ${file}`));
      process.exit(1);
    }
  }
  
  const apiUrl = getApiUrl(config);
  const formData = new FormData();
  
  for (const file of files) {
    formData.append('files', fs.createReadStream(file));
  }
  
  const spinner = ora('Upload des fichiers...').start();
  
  try {
    const response = await axios.post(`${apiUrl}/api/upload`, formData, {
      headers: formData.getHeaders(),
    });
    
    spinner.succeed(chalk.green('Upload terminé !'));
    console.log(chalk.cyan(`  Upload ID: ${response.data.uploadId}`));
    console.log(chalk.cyan(`  Fichiers: ${response.data.files.length}`));
    
    for (const file of response.data.files) {
      console.log(chalk.gray(`    - ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`));
    }
    
  } catch (error) {
    spinner.fail(chalk.red('Erreur lors de l\'upload'));
    console.error(chalk.red('✗'), error.response?.data?.message || error.message);
    process.exit(1);
  }
});

uploadCmd.alias('u');

// Commandes Job

const jobCmd = program.command('job')
  .description('Gérer les jobs');

jobCmd.command('create')
  .requiredOption('-c, --command <command>', 'Commande FFmpeg à exécuter')
  .requiredOption('-u, --upload-id <id>', 'ID de l\'upload contenant les fichiers')
  .option('-o, --output <filename>', 'Nom du fichier de sortie')
  .description('Créer un nouveau job')
  .action(async (options) => {
    const config = loadConfig();
    
    if (!isAuthorized(config)) {
      console.error(chalk.red('✗ Non autorisé'));
      console.error(chalk.yellow('  Utilisez "ffmpeg-api auth login" pour vous connecter'));
      process.exit(1);
    }
    
    const apiUrl = getApiUrl(config);
    const spinner = ora('Création du job...').start();
    
    try {
      const response = await axios.post(`${apiUrl}/api/jobs`, {
        command: options.command,
        uploadId: options.uploadId,
        outputFileName: options.output,
      }, {
        headers: getHeaders(config),
      });
      
      spinner.succeed(chalk.green('Job créé !'));
      console.log(chalk.cyan(`  Job ID: ${response.data.jobId}`));
      console.log(chalk.gray(`  Commande: ${options.command}`));
      
    } catch (error) {
      spinner.fail(chalk.red('Erreur lors de la création du job'));
      console.error(chalk.red('✗'), error.response?.data?.message || error.message);
      process.exit(1);
    }
  });

jobCmd.command('status <jobId>')
  .description('Obtenir le statut d\'un job')
  .action(async (jobId) => {
    const config = loadConfig();
    
    if (!isAuthorized(config)) {
      console.error(chalk.red('✗ Non autorisé'));
      console.error(chalk.yellow('  Utilisez "ffmpeg-api auth login" pour vous connecter'));
      process.exit(1);
    }
    
    const apiUrl = getApiUrl(config);
    
    try {
      const response = await axios.get(`${apiUrl}/api/jobs/${jobId}`, {
        headers: getHeaders(config),
      });
      
      const job = response.data;
      
      const statusColors = {
        pending: chalk.yellow,
        processing: chalk.blue,
        completed: chalk.green,
        failed: chalk.red,
        canceled: chalk.gray,
      };
      
      const statusColor = statusColors[job.status] || chalk.white;
      
      console.log(chalk.bold('Statut du job :'));
      console.log(chalk.cyan(`  ID:      ${job.id}`));
      console.log(statusColor(`  Statut:  ${job.status}`));
      
      if (job.progress !== undefined) {
        const progressBar = `[${'█'.repeat(Math.floor(job.progress / 5))}${'░'.repeat(20 - Math.floor(job.progress / 5))}] ${job.progress}%`;
        console.log(chalk.cyan(`  Progres: ${progressBar}`));
      }
      
      if (job.result?.outputFileName) {
        console.log(chalk.cyan(`  Sortie:  ${job.result.outputFileName}`));
      }
      
      if (job.failedReason) {
        console.error(chalk.red(`  Erreur:  ${job.failedReason}`));
      }
      
      if (job.createdAt) {
        console.log(chalk.gray(`  Créé:    ${new Date(job.createdAt).toLocaleString()}`));
      }
      
    } catch (error) {
      if (error.response?.status === 404) {
        console.error(chalk.red('✗ Job introuvable'));
      } else if (error.response?.status === 403) {
        console.error(chalk.red('✗ Vous n\'avez pas accès à ce job'));
      } else {
        console.error(chalk.red('✗ Erreur :'), error.message);
      }
      process.exit(1);
    }
  });

jobCmd.command('list')
  .option('-p, --page <page>', 'Numéro de page', '1')
  .option('-l, --limit <limit>', 'Limites par page', '20')
  .option('-s, --status <status>', 'Filtrer par statut')
  .option('-q, --search <query>', 'Rechercher dans les commandes')
  .description('Lister les jobs')
  .action(async (options) => {
    const config = loadConfig();
    
    if (!isAuthorized(config)) {
      console.error(chalk.red('✗ Non autorisé'));
      console.error(chalk.yellow('  Utilisez "ffmpeg-api auth login" pour vous connecter'));
      process.exit(1);
    }
    
    const apiUrl = getApiUrl(config);
    
    const params = {
      page: options.page,
      limit: options.limit,
    };
    
    if (options.status) params.status = options.status;
    if (options.search) params.search = options.search;
    
    try {
      const response = await axios.get(`${apiUrl}/api/jobs`, {
        headers: getHeaders(config),
        params,
      });
      
      const { jobs, pagination } = response.data;
      
      console.log(chalk.bold('Jobs :'));
      console.log(chalk.gray(`  Page ${pagination.page}/${pagination.totalPages} (${pagination.total} jobs au total)`));
      console.log('');
      
      if (jobs.length === 0) {
        console.log(chalk.gray('  Aucun job trouvé'));
        return;
      }
      
      for (const job of jobs) {
        const statusColors = {
          pending: chalk.yellow,
          processing: chalk.blue,
          completed: chalk.green,
          failed: chalk.red,
          canceled: chalk.gray,
        };
        const statusColor = statusColors[job.status] || chalk.white;
        
        console.log(chalk.cyan(`  ${job.id}`));
        console.log(chalk.gray(`    ${job.command?.substring(0, 60)}${job.command?.length > 60 ? '...' : ''}`));
        console.log(chalk.gray(`    ${statusColor(job.status)}${job.progress !== undefined ? ` - ${job.progress}%` : ''}`));
        console.log('');
      }
      
    } catch (error) {
      console.error(chalk.red('✗ Erreur :'), error.message);
      process.exit(1);
    }
  });

jobCmd.command('watch <jobId>')
  .description('Suivre la progression d\'un job en temps réel')
  .action(async (jobId) => {
    const config = loadConfig();
    
    if (!isAuthorized(config)) {
      console.error(chalk.red('✗ Non autorisé'));
      console.error(chalk.yellow('  Utilisez "ffmpeg-api auth login" pour vous connecter'));
      process.exit(1);
    }
    
    const apiUrl = getApiUrl(config);
    
    const checkStatus = async () => {
      try {
        const response = await axios.get(`${apiUrl}/api/jobs/${jobId}`, {
          headers: getHeaders(config),
        });
        
        const job = response.data;
        
        if (job.status === 'pending') {
          process.stdout.write(chalk.yellow('  ⏳ En attente...') + '\r');
        } else if (job.status === 'processing') {
          const progressBar = `[${'█'.repeat(Math.floor(job.progress / 5))}${'░'.repeat(20 - Math.floor(job.progress / 5))}] ${job.progress}%`;
          process.stdout.write(chalk.blue(`  🔄 ${progressBar}`) + '\r');
        } else if (job.status === 'completed') {
          process.stdout.write('\n');
          console.log(chalk.green('  ✓ Job terminé avec succès !'));
          if (job.result?.outputFileName) {
            console.log(chalk.cyan(`    Fichier: ${job.result.outputFileName}`));
          }
          return false;
        } else if (job.status === 'failed') {
          process.stdout.write('\n');
          console.error(chalk.red('  ✗ Job échoué :'), job.failedReason);
          return false;
        }
        
        return true;
        
      } catch (error) {
        console.error(chalk.red('✗ Erreur :'), error.message);
        return false;
      }
    };
    
    console.log(chalk.gray(`Suivi du job ${jobId}... (Ctrl+C pour arrêter)`));
    
    let running = true;
    while (running) {
      running = await checkStatus();
      if (running) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  });

jobCmd.command('download <jobId>')
  .option('-o, --output <filename>', 'Nom du fichier de sortie')
  .description('Télécharger le résultat d\'un job')
  .action(async (jobId, options) => {
    const config = loadConfig();
    
    if (!isAuthorized(config)) {
      console.error(chalk.red('✗ Non autorisé'));
      console.error(chalk.yellow('  Utilisez "ffmpeg-api auth login" pour vous connecter'));
      process.exit(1);
    }
    
    const apiUrl = getApiUrl(config);
    
    // Obtenir d\'abord le statut du job
    try {
      const statusResponse = await axios.get(`${apiUrl}/api/jobs/${jobId}`, {
        headers: getHeaders(config),
      });
      
      if (statusResponse.data.status !== 'completed') {
        console.error(chalk.red('✗ Job non terminé'));
        console.error(chalk.yellow(`  Statut: ${statusResponse.data.status}`));
        process.exit(1);
      }
      
      const outputFileName = options.output || statusResponse.data.result?.outputFileName;
      const outputPath = path.resolve(outputFileName || `${jobId}.mp4`);
      
      const spinner = ora(`Téléchargement du résultat...`).start();
      
      const response = await axios.get(`${apiUrl}/api/jobs/${jobId}/result`, {
        headers: getHeaders(config),
        responseType: 'arraybuffer',
      });
      
      fs.writeFileSync(outputPath, response.data);
      
      spinner.succeed(chalk.green('Téléchargement terminé !'));
      console.log(chalk.cyan(`  Fichier: ${outputPath}`));
      console.log(chalk.cyan(`  Taille: ${(response.headers['content-length'] / 1024 / 1024).toFixed(2)} MB`));
      
    } catch (error) {
      if (error.response?.status === 404) {
        console.error(chalk.red('✗ Job introuvable'));
      } else if (error.response?.status === 400) {
        console.error(chalk.red('✗'), error.response.data.message);
      } else {
        console.error(chalk.red('✗ Erreur :'), error.message);
      }
      process.exit(1);
    }
  });

jobCmd.command('delete <jobId>')
  .description('Annuler/supprimer un job')
  .action(async (jobId) => {
    const config = loadConfig();
    
    if (!isAuthorized(config)) {
      console.error(chalk.red('✗ Non autorisé'));
      console.error(chalk.yellow('  Utilisez "ffmpeg-api auth login" pour vous connecter'));
      process.exit(1);
    }
    
    const apiUrl = getApiUrl(config);
    
    try {
      await axios.delete(`${apiUrl}/api/jobs/${jobId}`, {
        headers: getHeaders(config),
      });
      
      console.log(chalk.green('✓ Job supprimé'));
      
    } catch (error) {
      if (error.response?.status === 404) {
        console.error(chalk.red('✗ Job introuvable'));
      } else if (error.response?.status === 403) {
        console.error(chalk.red('✗ Vous n\'avez pas accès à ce job'));
      } else {
        console.error(chalk.red('✗ Erreur :'), error.message);
      }
      process.exit(1);
    }
  });

// Commande rapide pour créer un job
program.command('run <command>')
  .requiredOption('-u, --upload-id <id>', 'ID de l\'upload')
  .option('-o, --output <filename>', 'Nom du fichier de sortie')
  .option('-w, --watch', 'Suivre la progression')
  .option('-d, --download', 'Télécharger le résultat automatiquement')
  .description('Exécuter rapidement une commande FFmpeg')
  .action(async (command, options) => {
    const config = loadConfig();
    
    if (!isAuthorized(config)) {
      console.error(chalk.red('✗ Non autorisé'));
      console.error(chalk.yellow('  Utilisez "ffmpeg-api auth login" pour vous connecter'));
      process.exit(1);
    }
    
    const apiUrl = getApiUrl(config);
    
    // Créer le job
    const spinner = ora('Création du job...').start();
    
    try {
      const response = await axios.post(`${apiUrl}/api/jobs`, {
        command,
        uploadId: options.uploadId,
        outputFileName: options.output,
      }, {
        headers: getHeaders(config),
      });
      
      spinner.succeed(chalk.green('Job créé !'));
      console.log(chalk.cyan(`  Job ID: ${response.data.jobId}`));
      
      const jobId = response.data.jobId;
      
      // Suivre la progression si demandé
      if (options.watch) {
        console.log('');
        const checkStatus = async () => {
          try {
            const resp = await axios.get(`${apiUrl}/api/jobs/${jobId}`, {
              headers: getHeaders(config),
            });
            
            const job = resp.data;
            
            if (job.status === 'processing') {
              const progressBar = `[${'█'.repeat(Math.floor(job.progress / 5))}${'░'.repeat(20 - Math.floor(job.progress / 5))}] ${job.progress}%`;
              process.stdout.write(chalk.blue(`  ${progressBar}`) + '\r');
            }
            
            return job.status === 'completed' || job.status === 'failed';
            
          } catch (error) {
            return true;
          }
        };
        
        while (!(await checkStatus())) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        process.stdout.write('\n');
      }
      
      // Obtenir le statut final
      const finalStatus = await axios.get(`${apiUrl}/api/jobs/${jobId}`, {
        headers: getHeaders(config),
      });
      
      if (finalStatus.data.status === 'completed') {
        console.log(chalk.green('  ✓ Job terminé !'));
        
        // Télécharger si demandé
        if (options.download) {
          const outputFileName = options.output || finalStatus.data.result?.outputFileName;
          const outputPath = path.resolve(outputFileName || `${jobId}.mp4`);
          
          const dlSpinner = ora('Téléchargement...').start();
          const dlResponse = await axios.get(`${apiUrl}/api/jobs/${jobId}/result`, {
            headers: getHeaders(config),
            responseType: 'arraybuffer',
          });
          
          fs.writeFileSync(outputPath, dlResponse.data);
          dlSpinner.succeed(chalk.green('Téléchargement terminé !'));
          console.log(chalk.cyan(`  Fichier: ${outputPath}`));
        }
        
      } else if (finalStatus.data.status === 'failed') {
        console.error(chalk.red('  ✗ Job échoué :'), finalStatus.data.failedReason);
        process.exit(1);
      }
      
    } catch (error) {
      spinner.fail(chalk.red('Erreur'));
      console.error(chalk.red('✗'), error.response?.data?.message || error.message);
      process.exit(1);
    }
  });

// Afficher l\'aide par défaut
if (!process.argv.slice(2).length) {
  program.help();
}

// Exécuter le programme
program.parse();
