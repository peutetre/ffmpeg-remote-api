const { spawn } = require('child_process');
const axios = require('axios');
const fs = require('fs');
const { redisClient } = require('../src/config/redis');

const TEST_PORT = 3001;
const TEST_BASE_URL = `http://localhost:${TEST_PORT}`;
const PID_FILE = '/tmp/ffmpeg-api-test-server.pid';

// Vérifier si on exécute des tests d'intégration
function isIntegrationTest() {
  return process.argv.some(arg => arg.includes('integration') || arg.includes('tests/integration'));
}

async function startServer() {
  return new Promise((resolve, reject) => {
    console.log(`\n🔄 Starting test server on port ${TEST_PORT}...`);
    
    const serverProcess = spawn('node', ['src/server.js'], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: TEST_PORT.toString(),
        JWT_SECRET: 'test-secret-key-for-testing-only',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Écrire le PID dans un fichier pour global-teardown.js
    fs.writeFileSync(PID_FILE, serverProcess.pid.toString());

    let serverReady = false;
    const checkInterval = setInterval(() => {
      axios.get(`${TEST_BASE_URL}/health`) 
        .then(() => {
          serverReady = true;
          clearInterval(checkInterval);
          clearTimeout(serverTimeout);
          console.log(`✅ Test server ready on ${TEST_BASE_URL}`);
          resolve(TEST_PORT);
        })
        .catch(() => {});
    }, 200);

    const serverTimeout = setTimeout(() => {
      clearInterval(checkInterval);
      if (serverProcess) {
        serverProcess.kill();
      }
      console.error(`❌ Test server failed to start on port ${TEST_PORT}`);
      reject(new Error(`Test server failed to start on port ${TEST_PORT}`));
    }, 10000);

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Error') || output.includes('error')) {
        console.error('Server error:', output);
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('Server stderr:', data.toString());
    });

    serverProcess.on('error', (error) => {
      console.error('Failed to start test server process:', error);
      reject(error);
    });
  });
}

async function cleanupRedis() {
  try {
    const keys = await redisClient.keys('*');
    if (keys.length > 0) {
      await redisClient.del(...keys);
      console.log(`🗑️  Cleaned ${keys.length} keys from Redis`);
    }
  } catch (error) {
    console.warn('⚠️  Could not clean Redis:', error.message);
  }
}

module.exports = async () => {
  // Ne démarrer le serveur que pour les tests d'intégration
  if (!isIntegrationTest()) {
    console.log('⏭️  Skipping server startup (not running integration tests)');
    return;
  }

  console.log('\n🧪 Setting up integration test environment...');
  
  try {
    await startServer();
    await cleanupRedis();
    await new Promise(resolve => setTimeout(resolve, 500));
  } catch (error) {
    console.error('❌ Failed to set up test environment:', error);
    throw error;
  }
};