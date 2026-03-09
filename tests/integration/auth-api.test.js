const { BASE_URL, cleanupRedis, testAxios } = require('../utils/test-helpers');

describe('Auth API - Integration Tests', () => {
  afterAll(async () => {
    await cleanupRedis();
  });
  
  describe('POST /api/auth/register', () => {
    test('should register a new user', async () => {
      const testEmail = `test-${Date.now()}@example.com`;
      const password = 'testPassword123';
      const name = 'Test User';
      
      const response = await testAxios.post(`${BASE_URL}/api/auth/register`, {
        email: testEmail,
        password,
        name,
      });
      
      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.user).toBeDefined();
      expect(response.data.user.email).toBe(testEmail);
      expect(response.data.user.name).toBe(name);
      expect(response.data.user.id).toBeDefined();
      expect(response.data.accessToken).toBeDefined();
      expect(response.data.refreshToken).toBeDefined();
    });
    
    test('should reject registration with existing email', async () => {
      const testEmail = `existing-${Date.now()}@example.com`;
      const password = 'testPassword123';
      
      // First, register the user then try again
      await testAxios.post(`${BASE_URL}/api/auth/register`, {
        email: testEmail,
        password,
        name: 'Existing User',
      });
      
      const response = await testAxios.post(`${BASE_URL}/api/auth/register`, {
        email: testEmail,
        password: 'anotherPassword',
      });
      
      expect(response.status).toBe(409);
      expect(response.data.error).toBe('Conflit');
    });
    
    test('should reject registration without email', async () => {
      const response = await testAxios.post(`${BASE_URL}/api/auth/register`, {
        password: 'testPassword123',
      });
      
      expect(response.status).toBe(400);
    });
    
    test('should reject registration with short password', async () => {
      const response = await testAxios.post(`${BASE_URL}/api/auth/register`, {
        email: `short-${Date.now()}@example.com`,
        password: '123',
      });
      
      expect(response.status).toBe(400);
    });
  });
  
  describe('POST /api/auth/login', () => {
    test('should login with correct credentials', async () => {
      const testEmail = `login-${Date.now()}@example.com`;
      const password = 'testPassword123';
      
      // Register first
      await testAxios.post(`${BASE_URL}/api/auth/register`, {
        email: testEmail,
        password,
        name: 'Login Test User',
      });
      
      const response = await testAxios.post(`${BASE_URL}/api/auth/login`, {
        email: testEmail,
        password,
      });
      
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.user.email).toBe(testEmail);
      expect(response.data.accessToken).toBeDefined();
    });
    
    test('should reject login with wrong password', async () => {
      const testEmail = `wrongpass-${Date.now()}@example.com`;
      const password = 'testPassword123';
      
      await testAxios.post(`${BASE_URL}/api/auth/register`, {
        email: testEmail,
        password,
        name: 'Wrong Password Test User',
      });
      
      const response = await testAxios.post(`${BASE_URL}/api/auth/login`, {
        email: testEmail,
        password: 'wrongPassword',
      });
      
      expect(response.status).toBe(401);
    });
    
    test('should reject login with non-existent email', async () => {
      const response = await testAxios.post(`${BASE_URL}/api/auth/login`, {
        email: 'nonexistent@example.com',
        password: 'testPassword123',
      });
      
      expect(response.status).toBe(401);
    });
  });
  
  describe('GET /api/auth/me', () => {
    test('should return current user with valid token', async () => {
      const testEmail = `me-${Date.now()}@example.com`;
      const password = 'testPassword123';
      
      // Create user and login
      await testAxios.post(`${BASE_URL}/api/auth/register`, {
        email: testEmail,
        password,
        name: 'Me Test User',
      });
      
      const loginResponse = await testAxios.post(`${BASE_URL}/api/auth/login`, {
        email: testEmail,
        password,
      });
      
      expect(loginResponse.status).toBe(200);
      const accessToken = loginResponse.data.accessToken;
      
      const response = await testAxios.get(`${BASE_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.user.email).toBe(testEmail);
    });
    
    test('should reject without token', async () => {
      const response = await testAxios.get(`${BASE_URL}/api/auth/me`);
      
      expect(response.status).toBe(401);
    });
    
    test('should reject with invalid token', async () => {
      const response = await testAxios.get(`${BASE_URL}/api/auth/me`, {
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      });
      
      expect(response.status).toBe(401);
    });
  });
  
  describe('POST /api/auth/refresh', () => {
    test('should refresh access token', async () => {
      const testEmail = `refresh-${Date.now()}@example.com`;
      const password = 'testPassword123';
      
      const response = await testAxios.post(`${BASE_URL}/api/auth/register`, {
        email: testEmail,
        password,
        name: 'Refresh Test User',
      });
      
      expect(response.status).toBe(201);
      const refreshToken = response.data.refreshToken;
      
      const refreshResponse = await testAxios.post(`${BASE_URL}/api/auth/refresh`, {
        refreshToken,
      });
      
      expect(refreshResponse.status).toBe(200);
      expect(refreshResponse.data.success).toBe(true);
      expect(refreshResponse.data.accessToken).toBeDefined();
    });
    
    test('should reject with invalid refresh token', async () => {
      const response = await testAxios.post(`${BASE_URL}/api/auth/refresh`, {
        refreshToken: 'invalid-refresh-token',
      });
      
      expect(response.status).toBe(401);
    });
  });
  
  describe('POST /api/auth/logout', () => {
    test('should logout successfully', async () => {
      const testEmail = `logout-${Date.now()}@example.com`;
      const password = 'testPassword123';
      
      await testAxios.post(`${BASE_URL}/api/auth/register`, {
        email: testEmail,
        password,
        name: 'Logout Test User',
      });
      
      const loginResponse = await testAxios.post(`${BASE_URL}/api/auth/login`, {
        email: testEmail,
        password,
      });
      
      expect(loginResponse.status).toBe(200);
      const accessToken = loginResponse.data.accessToken;
      
      const response = await testAxios.post(`${BASE_URL}/api/auth/logout`, {}, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });
  });
  
  describe('PUT /api/auth/me', () => {
    test('should update user profile', async () => {
      const testEmail = `update-${Date.now()}@example.com`;
      const password = 'testPassword123';
      
      await testAxios.post(`${BASE_URL}/api/auth/register`, {
        email: testEmail,
        password,
        name: 'Update Test User',
      });
      
      const loginResponse = await testAxios.post(`${BASE_URL}/api/auth/login`, {
        email: testEmail,
        password,
      });
      
      expect(loginResponse.status).toBe(200);
      const accessToken = loginResponse.data.accessToken;
      
      const response = await testAxios.put(`${BASE_URL}/api/auth/me`, {
        name: 'Updated Name',
      }, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.user.name).toBe('Updated Name');
    });
  });
});
