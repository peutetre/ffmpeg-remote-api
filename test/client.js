const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { createClient } = require('redis');

const API_URL = process.env.API_URL || 'http://localhost:3000';

// Variables pour stocker les tokens
let accessToken = null;
let refreshToken = null;

// Client Redis pour les pub/sub
class RedisEventClient {
  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
    this.subscriber = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
  }

  async connect() {
    await this.client.connect();
    await this.subscriber.connect();
  }

  async subscribe(jobId) {
    await this.subscriber.subscribe(`job:${jobId}:events`);
  }

  async publish(jobId, event, data) {
    await this.client.publish(`job:${jobId}:events`, JSON.stringify({ event, data }));
  }

  on(event, callback) {
    this.subscriber.on('message', (channel, message) => {
      try {
        const { event: eventName, data } = JSON.parse(message);
        if (eventName === event) {
          callback(data);
        }
      } catch (error) {
        console.error('Erreur parsing message:', error);
      }
    });
  }

  async disconnect() {
    await this.client.quit();
    await this.subscriber.quit();
  }
}

// Client pour l'API FFmpeg
async function demo() {
  console.log('🚀 Démo: FFmpeg Remote API Client\n');

  try {
    // 1. Vérifier que l'API est disponible
    console.log('1️⃣  Vérification de l\'API...');
    const health = await axios.get(`${API_URL}/health`);
    console.log('   ✅ API disponible');
    console.log(`   📊 FFmpeg: ${health.data.ffmpeg.version}`);
    console.log(`   📊 Queue: ${health.data.queue.waiting} en attente, ${health.data.queue.active} en cours\n`);

    // 2. S'inscrire (ou se connecter si l'utilisateur existe déjà)
    console.log('2️⃣  Authentification...');
    
    try {
      // Essayer de s'inscrire
      const registerResponse = await axios.post(`${API_URL}/api/auth/register`, {
        email: 'demo@example.com',
        password: 'demopassword123',
        name: 'Démo User',
      });
      
      accessToken = registerResponse.data.accessToken;
      refreshToken = registerResponse.data.refreshToken;
      console.log('   ✅ Inscription réussie');
      
    } catch (registerError) {
      // Si l'inscription échoue (email déjà utilisé), essayer de se connecter
      if (registerError.response?.status === 409) {
        const loginResponse = await axios.post(`${API_URL}/api/auth/login`, {
          email: 'demo@example.com',
          password: 'demopassword123',
        });
        
        accessToken = loginResponse.data.accessToken;
        refreshToken = loginResponse.data.refreshToken;
        console.log('   ✅ Connexion réussie');
      } else {
        throw registerError;
      }
    }
    
    // Vérifier que nous sommes connectés
    const meResponse = await axios.get(`${API_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    console.log(`   👤 Utilisateur: ${meResponse.data.user.name} (${meResponse.data.user.email})\n`);

    // 2. Créer un fichier de test (image avec du texte)
    console.log('2️⃣  Création d\'un fichier de test...');
    const testFilePath = path.join(__dirname, 'test-video.mp4');
    
    // Créer une vidéo de test avec ffmpeg (si disponible)
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    try {
      await execAsync('ffmpeg -f lavfi -i color=c=blue:s=320x240:d=3 -vf "drawtext=text=Test:fontcolor=white:x=100:y=100" -y test/test-video.mp4 2>/dev/null');
      console.log('   ✅ Vidéo de test créée\n');
    } catch (error) {
      console.log('   ⚠️  Impossible de créer une vidéo de test');
      console.log('   📝 Assurez-vous que ffmpeg est installé localement\n');
      return;
    }

    // 3. Uploader les assets
    console.log('3️⃣  Upload des assets...');
    const formData = new FormData();
    formData.append('files', fs.createReadStream(testFilePath));
    
    const uploadResponse = await axios.post(`${API_URL}/api/upload`, formData, {
      headers: formData.getHeaders(),
    });
    
    const uploadId = uploadResponse.data.uploadId;
    console.log(`   ✅ Upload terminé`);
    console.log(`   🆔 Upload ID: ${uploadId}\n`);

    // 4. Créer un job
    console.log('4️⃣  Création d\'un job FFmpeg...');
    
    // Exemple de commande: convertir en GIF animé
    const command = 'ffmpeg -i test-video.mp4 -vf "fps=10,scale=320:-1:flags=lanczos" -y output/test-output.gif';
    
    const jobResponse = await axios.post(`${API_URL}/api/jobs`, {
      command,
      uploadId,
      outputFileName: 'test-output.gif',
    }, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    const jobId = jobResponse.data.jobId;
    console.log(`   ✅ Job créé`);
    console.log(`   🆔 Job ID: ${jobId}`);
    console.log(`   📝 Commande: ${command}\n`);

    // 5. Lister les jobs (démonstration de la pagination)
    console.log('5️⃣  Liste des jobs (pagination)...');
    const jobsResponse = await axios.get(`${API_URL}/api/jobs?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    console.log(`   📊 Total des jobs: ${jobsResponse.data.pagination.total}`);
    console.log(`   📊 Page actuelle: ${jobsResponse.data.pagination.page}/${jobsResponse.data.pagination.totalPages}\n`);

    // 6. Suivre la progression du job
    console.log('6️⃣  Suivi de la progression...\n');
    
    const checkInterval = setInterval(async () => {
      try {
        const statusResponse = await axios.get(`${API_URL}/api/jobs/${jobId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const status = statusResponse.data;
        
        if (status.status === 'pending') {
          process.stdout.write('   ⏳ En attente...\r');
        } else if (status.status === 'processing') {
          const progressBar = `   [${'█'.repeat(Math.floor(status.progress / 5))}${'░'.repeat(20 - Math.floor(status.progress / 5))}] ${status.progress}%\r`;
          process.stdout.write(progressBar);
        } else if (status.status === 'completed') {
          clearInterval(checkInterval);
          console.log(`\n   ✅ Job terminé avec succès!`);
          console.log(`   📁 Fichier de sortie: ${status.result.outputFileName}`);
          
          // 7. Télécharger le résultat
          console.log('\n7️⃣  Téléchargement du résultat...');
          
          const resultResponse = await axios.get(`${API_URL}/api/jobs/${jobId}/result`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            responseType: 'arraybuffer',
          });
          
          const outputPath = path.join(__dirname, 'output.gif');
          fs.writeFileSync(outputPath, resultResponse.data);
          
          console.log(`   ✅ Fichier téléchargé: ${outputPath}`);
          console.log(`   📊 Taille: ${(resultResponse.headers['content-length'] / 1024).toFixed(2)} KB\n`);
          
          // 8. Nettoyage
          console.log('8️⃣  Nettoyage...');
          await axios.delete(`${API_URL}/api/upload/${uploadId}`);
          console.log(`   ✅ Upload supprimé\n`);
          
          // Supprimer les fichiers de test
          fs.unlinkSync(testFilePath);
          fs.unlinkSync(outputPath);
          console.log('   ✅ Fichiers de test supprimés\n');
          
          // 9. Déconnexion
          console.log('9️⃣  Déconnexion...');
          await axios.post(`${API_URL}/api/auth/logout`, {}, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          console.log('   ✅ Déconnecté\n');
          
          console.log('🎉 Démo terminée avec succès!');
          return;
        } else if (status.status === 'failed') {
          clearInterval(checkInterval);
          console.log(`\n   ❌ Job échoué: ${status.failedReason}\n`);
          return;
        }
      } catch (error) {
        console.error('   Erreur:', error.message);
      }
    }, 500);

  } catch (error) {
    console.error('\n❌ Erreur:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
  }
}

// Lancer la démo
demo();
