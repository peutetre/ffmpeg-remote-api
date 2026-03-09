const axios = require('axios');
const request = require('supertest');
const { redisClient } = require('../../src/config/redis');

// Base URL pour les tests API
// Utilise le port 3001 pour les tests d'intégration (serveur de test)
// Utilise le port 3000 pour les tests manuels ou e2e
const isIntegrationTest = process.argv.some(arg => arg.includes('integration'));
const BASE_URL = process.env.TEST_API_URL || (isIntegrationTest ? 'http://localhost:3001' : 'http://localhost:3000');

// Instance axios dédiée aux tests - ne jette pas d'erreurs pour les status codes non-2xx
const testAxios = axios.create({
  validateStatus: (status) => status >= 200 && status < 600,
});

// Utilisateur de test par défaut
const TEST_USER = {
  email: 'test@example.com',
  password: 'testpassword123',
  name: 'Test User',
};

// Nettoyer Redis avant/après les tests
async function cleanupRedis() {
  try {
    // Supprimer toutes les clés de test
    const keys = await redisClient.keys('*');
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
  } catch (error) {
    // Ignorer les erreurs de nettoyage
  }
}

// Créer un fake upload dans Redis pour les tests
async function createFakeUpload(uploadId, filename = 'test.mp4', size = 1024) {
  try {
    const uploadKey = `upload:${uploadId}`;
    await redisClient.setex(uploadKey, 86400, JSON.stringify({
      id: uploadId,
      filename,
      size,
      createdAt: new Date().toISOString(),
    }));
    return true;
  } catch (error) {
    console.warn('Could not create fake upload:', error.message);
    return false;
  }
}

// Enregistrer un utilisateur de test
async function registerTestUser(customData = {}) {
  const userData = { ...TEST_USER, ...customData };
  
  try {
    const response = await axios.post(`${BASE_URL}/api/auth/register`, userData);
    return response.data;
  } catch (error) {
    // Si l'utilisateur existe déjà, se connecter
    if (error.response?.status === 409) {
      const response = await axios.post(`${BASE_URL}/api/auth/login`, {
        email: userData.email,
        password: userData.password,
      });
      return response.data;
    }
    throw error;
  }
}

// Se connecter avec l'utilisateur de test
async function loginTestUser(customData = {}) {
  const userData = { ...TEST_USER, ...customData };
  
  const response = await axios.post(`${BASE_URL}/api/auth/login`, {
    email: userData.email,
    password: userData.password,
  });
  
  return response.data;
}

// Créer un fichier de test temporaire
function createTestFile(content = 'test content', extension = '.txt') {
  const fs = require('fs');
  const path = require('path');
  const tmpDir = require('os').tmpdir();
  const filename = `test-file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}${extension}`;
  const filepath = path.join(tmpDir, filename);
  
  fs.writeFileSync(filepath, content);
  
  return {
    path: filepath,
    cleanup: () => {
      try {
        fs.unlinkSync(filepath);
      } catch (e) {}
    },
  };
}

module.exports = {
  BASE_URL,
  TEST_USER,
  cleanupRedis,
  createFakeUpload,
  registerTestUser,
  loginTestUser,
  createTestFile,
  request,
  axios,
  testAxios, // Instance axios pour les tests (ne jette pas d'erreurs)
};
