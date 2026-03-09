// Configuration de l'authentification JWT

let _jwtSecret = null;

const AuthConfig = {
  // Secret pour signer les tokens (lazy loading)
  get jwtSecret() {
    if (_jwtSecret === null) {
      _jwtSecret = process.env.JWT_SECRET || 'test-secret-key-for-testing-only';
    }
    return _jwtSecret;
  },
  
  // Durée de vie du token d'accès (en secondes)
  accessTokenExpiration: 3600, // 1 heure
  
  // Durée de vie du token de rafraîchissement (en secondes)
  refreshTokenExpiration: 604800, // 7 jours
  
  // Algorithme de signature
  algorithm: 'HS256',
  
  // Nom du header pour le token
  authHeader: 'Authorization',
  
  // Type de token
  tokenType: 'Bearer',
};

module.exports = AuthConfig;
