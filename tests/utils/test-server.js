const { spawn } = require('child_process');
const axios = require('axios');

// Port pour les tests
const TEST_PORT = 3001;
const TEST_BASE_URL = `http://localhost:${TEST_PORT}`;

let serverProcess = null;
let serverStarted = false;

// Démarrer le serveur de test
async function startTestServer() {
  if (serverStarted) {
    return TEST_PORT;
  }

  return new Promise((resolve, reject) => {
    console.log(`\n🔄 Starting test server on port ${TEST_PORT}...`);
    
    // Démarrer le serveur comme processus enfant
    serverProcess = spawn('node', ['src/server.js'], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: TEST_PORT.toString(),
        JWT_SECRET: 'test-secret-key-for-testing-only',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Attendre que le serveur soit prêt
    let serverReady = false;
    const checkInterval = setInterval(() => {
      axios.get(`${TEST_BASE_URL}/health`) 
        .then(() => {
          serverReady = true;
          clearInterval(checkInterval);
          clearTimeout(serverTimeout);
          console.log(`✅ Test server ready on ${TEST_BASE_URL}`);
          serverStarted = true;
          resolve(TEST_PORT);
        })
        .catch(() => {
          // Server not ready yet, keep checking
        });
    }, 200);

    // Timeout après 10 secondes
    const serverTimeout = setTimeout(() => {
      clearInterval(checkInterval);
      if (serverProcess) {
        serverProcess.kill();
      }
      console.error(`❌ Test server failed to start on port ${TEST_PORT}`);
      reject(new Error(`Test server failed to start on port ${TEST_PORT}`));
    }, 10000);

    // Gérer les erreurs du serveur
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      // Ne pas afficher les logs du serveur pendant les tests sauf erreurs
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

// Arrêter le serveur de test
async function stopTestServer() {
  if (!serverStarted || !serverProcess) {
    return;
  }

  return new Promise((resolve) => {
    console.log('🔄 Stopping test server...');
    
    serverProcess.on('close', (code) => {
      console.log(`✅ Test server stopped (code ${code})`);
      serverProcess = null;
      serverStarted = false;
      resolve();
    });

    // Envoyer SIGTERM pour arrêter proprement
    serverProcess.kill('SIGTERM');

    // Force kill après 2 secondes
    setTimeout(() => {
      if (serverProcess) {
        serverProcess.kill('SIGKILL');
      }
      serverProcess = null;
      serverStarted = false;
      resolve();
    }, 2000);
  });
}

module.exports = {
  startTestServer,
  stopTestServer,
  TEST_BASE_URL,
};