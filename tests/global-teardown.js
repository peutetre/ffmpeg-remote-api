const fs = require('fs');
const { redisClient } = require('../src/config/redis');

const PID_FILE = '/tmp/ffmpeg-api-test-server.pid';

module.exports = async () => {
  console.log('\n🧹 Cleaning up integration test environment...');
  
  try {
    // Arrêter le serveur si le PID file existe
    if (fs.existsSync(PID_FILE)) {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim());
      if (pid) {
        console.log(`🔄 Stopping test server (PID: ${pid})...`);
        try {
          process.kill(pid, 'SIGTERM');
          // Attendre que le processus se termine
          await new Promise(resolve => setTimeout(resolve, 1000));
          // Force kill si toujours en cours
          try {
            process.kill(pid, 'SIGKILL');
          } catch (e) {
            // Processus déjà terminé
          }
          console.log(`✅ Test server stopped`);
        } catch (e) {
          // Processus déjà terminé
        }
        fs.unlinkSync(PID_FILE);
      }
    }
    
    // Nettoyer Redis
    await cleanupRedis();
    
  } catch (error) {
    console.warn('⚠️  Error during cleanup:', error);
  }
};

async function cleanupRedis() {
  try {
    const keys = await redisClient.keys('*');
    if (keys.length > 0) {
      await redisClient.del(...keys);
      console.log(`🗑️  Cleaned ${keys.length} keys from Redis`);
    }
  } catch (error) {
    // Ignorer les erreurs de nettoyage
  }
}