const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const AuthConfig = require('../../src/config/auth');

// Tests du service auth (sans dépendance Redis)
describe('Auth Service - Unit Tests', () => {
  describe('JWT Token Generation', () => {
    test('should generate a valid access token', () => {
      const user = { id: 'user_123', email: 'test@example.com' };
      
      const payload = {
        userId: user.id,
        email: user.email,
        type: 'access',
      };
      
      const token = jwt.sign(payload, AuthConfig.jwtSecret, {
        expiresIn: AuthConfig.accessTokenExpiration,
        algorithm: AuthConfig.algorithm,
      });
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      
      // Vérifier que le token peut être décoder
      const decoded = jwt.verify(token, AuthConfig.jwtSecret);
      expect(decoded.userId).toBe(user.id);
      expect(decoded.email).toBe(user.email);
      expect(decoded.type).toBe('access');
    });
    
    test('should generate a valid refresh token', () => {
      const user = { id: 'user_123' };
      
      const payload = {
        userId: user.id,
        type: 'refresh',
      };
      
      const token = jwt.sign(payload, AuthConfig.jwtSecret, {
        expiresIn: AuthConfig.refreshTokenExpiration,
        algorithm: AuthConfig.algorithm,
      });
      
      expect(token).toBeDefined();
      
      const decoded = jwt.verify(token, AuthConfig.jwtSecret);
      expect(decoded.type).toBe('refresh');
    });
  });
  
  describe('Password Hashing', () => {
    test('should hash a password', async () => {
      const password = 'mySecretPassword123';
      const hash = await bcrypt.hash(password, 12);
      
      expect(hash).toBeDefined();
      expect(hash.length).toBe(60);
      expect(hash).not.toBe(password);
    });
    
    test('should verify a correct password', async () => {
      const password = 'mySecretPassword123';
      const hash = await bcrypt.hash(password, 12);
      
      const isValid = await bcrypt.compare(password, hash);
      expect(isValid).toBe(true);
    });
    
    test('should reject an incorrect password', async () => {
      const password = 'mySecretPassword123';
      const hash = await bcrypt.hash(password, 12);
      
      const isValid = await bcrypt.compare('wrongPassword', hash);
      expect(isValid).toBe(false);
    });
  });
  
  describe('JWT Verification', () => {
    test('should verify a valid token', () => {
      const token = jwt.sign(
        { userId: 'user_123', type: 'access' },
        AuthConfig.jwtSecret
      );
      
      const decoded = jwt.verify(token, AuthConfig.jwtSecret);
      expect(decoded.userId).toBe('user_123');
    });
    
    test('should reject an invalid token', () => {
      const token = 'invalid.token.here';
      
      expect(() => jwt.verify(token, AuthConfig.jwtSecret)).toThrow();
    });
    
    test('should reject a token with wrong secret', () => {
      const token = jwt.sign(
        { userId: 'user_123' },
        'wrong-secret'
      );
      
      expect(() => jwt.verify(token, AuthConfig.jwtSecret)).toThrow();
    });
  });
  
  describe('Auth Configuration', () => {
    test('should have default values', () => {
      expect(AuthConfig.jwtSecret).toBeDefined();
      expect(AuthConfig.accessTokenExpiration).toBeGreaterThan(0);
      expect(AuthConfig.refreshTokenExpiration).toBeGreaterThan(0);
      expect(AuthConfig.algorithm).toBe('HS256');
      expect(AuthConfig.authHeader).toBe('Authorization');
      expect(AuthConfig.tokenType).toBe('Bearer');
    });
    
    test('should have reasonable expiration times', () => {
      // Access token: 1 heure par défaut
      expect(AuthConfig.accessTokenExpiration).toBe(3600);
      
      // Refresh token: 7 jours par défaut
      expect(AuthConfig.refreshTokenExpiration).toBe(604800);
      
      // Refresh token > Access token
      expect(AuthConfig.refreshTokenExpiration).toBeGreaterThan(
        AuthConfig.accessTokenExpiration
      );
    });
  });
});
