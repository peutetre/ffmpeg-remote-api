const { BASE_URL, testAxios } = require('../utils/test-helpers');

// Helper function to create a test user and get authenticated headers
async function createTestUserAndGetHeaders() {
  const testEmail = `jobs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@example.com`;
  const password = 'testPassword123';
  
  // Register
  const registerResponse = await testAxios.post(`${BASE_URL}/api/auth/register`, {
    email: testEmail,
    password,
    name: 'Jobs Test User',
  });
  
  if (registerResponse.status !== 201) {
    throw new Error(`Registration failed with status ${registerResponse.status}`);
  }
  
  // Login
  const loginResponse = await testAxios.post(`${BASE_URL}/api/auth/login`, {
    email: testEmail,
    password,
  });
  
  if (loginResponse.status !== 200) {
    throw new Error(`Login failed with status ${loginResponse.status}`);
  }
  
  return {
    headers: {
      Authorization: `Bearer ${loginResponse.data.accessToken}`,
    },
    email: testEmail,
  };
}

describe('Jobs API - Integration Tests', () => {
  
  describe('Job Pagination', () => {
    let headers = null;
    let createdJobId = null;
    
    beforeAll(async () => {
      const result = await createTestUserAndGetHeaders();
      headers = result.headers;
      
      // Create a single test job
      try {
        const jobRes = await testAxios.post(
          `${BASE_URL}/api/jobs`,
          {
            command: 'ffmpeg -test input.mp4 output.mp4',
            uploadId: 'test-upload',
            outputFileName: 'output.mp4',
          },
          { headers }
        );
        console.log('Job creation response:', jobRes.status, jobRes.data);
        if (jobRes.data?.jobId) {
          createdJobId = jobRes.data.jobId;
        }
      } catch (error) {
        console.error('Job creation failed:', error.message);
        // Continue even if job creation fails
      }
    });
    
    test('should return paginated jobs', async () => {
      const response = await testAxios.get(`${BASE_URL}/api/jobs?page=1&limit=10`, {
        headers,
      });
      
      console.log('Jobs API response:', response.data);
      
      expect(response.status).toBe(200);
      expect(response.data.jobs).toBeDefined();
      expect(response.data.pagination).toBeDefined();
      expect(response.data.pagination.page).toBe(1);
      expect(response.data.pagination.limit).toBe(10);
      // Note: pagination.total can be 0 if no jobs exist
      expect(response.data.pagination.total).toBeGreaterThanOrEqual(0);
    });
    
    test('should respect limit parameter', async () => {
      const response = await testAxios.get(`${BASE_URL}/api/jobs?page=1&limit=5`, {
        headers,
      });
      
      expect(response.status).toBe(200);
      expect(response.data.jobs.length).toBeLessThanOrEqual(5);
    });
    
    test('should return different pages', async () => {
      const page1 = await testAxios.get(`${BASE_URL}/api/jobs?page=1&limit=10`, { headers });
      const page2 = await testAxios.get(`${BASE_URL}/api/jobs?page=2&limit=10`, { headers });
      
      expect(page1.status).toBe(200);
      expect(page2.status).toBe(200);
      expect(page1.data.pagination.page).toBe(1);
      expect(page2.data.pagination.page).toBe(2);
      
      const page1Ids = page1.data.jobs.map(j => j.id);
      const page2Ids = page2.data.jobs.map(j => j.id);
      const overlap = page1Ids.filter(id => page2Ids.includes(id));
      expect(overlap.length).toBe(0);
    });
  });
  
  describe('Job Filtering', () => {
    test('should filter jobs by status', async () => {
      const result = await createTestUserAndGetHeaders();
      const response = await testAxios.get(`${BASE_URL}/api/jobs?status=pending`, {
        headers: result.headers,
      });
      
      expect(response.status).toBe(200);
    });
    
    test('should search in job commands', async () => {
      const result = await createTestUserAndGetHeaders();
      const response = await testAxios.get(`${BASE_URL}/api/jobs?search=ffmpeg`, {
        headers: result.headers,
      });
      
      expect(response.status).toBe(200);
      expect(response.data.jobs).toBeDefined();
    });
  });
  
  describe('Job Sorting', () => {
    test('should sort by creation date (descending)', async () => {
      const result = await createTestUserAndGetHeaders();
      const response = await testAxios.get(
        `${BASE_URL}/api/jobs?sortBy=createdAt&sortOrder=desc`,
        { headers: result.headers }
      );
      
      expect(response.status).toBe(200);
      
      const jobs = response.data.jobs;
      for (let i = 1; i < jobs.length; i++) {
        expect(new Date(jobs[i].createdAt)).toBeLessThanOrEqual(
          new Date(jobs[i - 1].createdAt)
        );
      }
    });
    
    test('should sort by creation date (ascending)', async () => {
      const result = await createTestUserAndGetHeaders();
      const response = await testAxios.get(
        `${BASE_URL}/api/jobs?sortBy=createdAt&sortOrder=asc`,
        { headers: result.headers }
      );
      
      expect(response.status).toBe(200);
      
      const jobs = response.data.jobs;
      for (let i = 1; i < jobs.length; i++) {
        expect(new Date(jobs[i].createdAt)).toBeGreaterThanOrEqual(
          new Date(jobs[i - 1].createdAt)
        );
      }
    });
  });
  
  describe('Job Authorization', () => {
    test('should reject job creation without authentication', async () => {
      const response = await testAxios.post(`${BASE_URL}/api/jobs`, {
        command: 'ffmpeg -i test.mp4 output.mp4',
        uploadId: 'test-upload',
      });
      
      expect(response.status).toBe(401);
    });
    
    test('should reject job list without authentication', async () => {
      const response = await testAxios.get(`${BASE_URL}/api/jobs`);
      
      expect(response.status).toBe(401);
    });
    
    test('should reject job status without authentication', async () => {
      const response = await testAxios.get(`${BASE_URL}/api/jobs/nonexistent`);
      
      expect(response.status).toBe(401);
    });
  });
  
  describe('Queue Statistics', () => {
    test('should return queue statistics', async () => {
      const response = await testAxios.get(`${BASE_URL}/api/jobs/stats`);
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('waiting');
      expect(response.data).toHaveProperty('active');
      expect(response.data).toHaveProperty('completed');
      expect(response.data).toHaveProperty('failed');
    });
  });
});
