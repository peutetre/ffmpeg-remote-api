const jwt = require('jsonwebtoken');
const { redisClient } = require('../config/redis');
const AuthConfig = require('../config/auth');
const { getUserByEmail, getUserById, getUserByEmailWithPassword, createUser, verifyPassword } = require('./user');

const SESSIONS_KEY = 'sessions:';

// Générer un token d'accès
function generateAccessToken(user) {
  const payload = {
    userId: user.id,
    email: user.email,
    type: 'access',
  };
  
  return jwt.sign(payload, AuthConfig.jwtSecret, {
    expiresIn: AuthConfig.accessTokenExpiration,
    algorithm: AuthConfig.algorithm,
  });
}

// Générer un token de rafraîchissement
function generateRefreshToken(user) {
  const payload = {
    userId: user.id,
    type: 'refresh',
  };
  
  return jwt.sign(payload, AuthConfig.jwtSecret, {
    expiresIn: AuthConfig.refreshTokenExpiration,
    algorithm: AuthConfig.algorithm,
  });
}

// Vérifier et décoder un token
function verifyToken(token) {
  try {
    return jwt.verify(token, AuthConfig.jwtSecret, {
      algorithms: [AuthConfig.algorithm],
    });
  } catch (error) {
    throw new Error('Token invalide ou expiré');
  }
}

// Connexion utilisateur
async function login(email, password) {
  // Trouver l'utilisateur (avec le mot de passe)
  const user = await getUserByEmailWithPassword(email);
  
  if (!user) {
    throw new Error('Email ou mot de passe incorrect');
  }
  
  // Vérifier le mot de passe
  const isValidPassword = await verifyPassword(password, user.password);
  
  if (!isValidPassword) {
    throw new Error('Email ou mot de passe incorrect');
  }
  
  // Supprimer le mot de passe de l'objet
  const { password: _, ...userWithoutPassword } = user;
  
  // Générer les tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  
  // Stocker le refresh token dans Redis
  const sessionKey = `${SESSIONS_KEY}${user.id}:${generateSessionId()}`;
  await redisClient.setex(
    sessionKey,
    AuthConfig.refreshTokenExpiration,
    JSON.stringify({
      userId: user.id,
      refreshToken,
      createdAt: new Date().toISOString(),
    })
  );
  
  return {
    user: userWithoutPassword,
    accessToken,
    refreshToken,
  };
}

// Inscription utilisateur
async function register(userData) {
  const { email, password, name } = userData;
  
  // Validation
  if (!email || !password) {
    throw new Error('Email et mot de passe sont requis');
  }
  
  if (password.length < 6) {
    throw new Error('Le mot de passe doit contenir au moins 6 caractères');
  }
  
  // Vérifier si l'email existe déjà
  const existingUser = await getUserByEmail(email);
  if (existingUser) {
    throw new Error('Cet email est déjà utilisé');
  }
  
  // Créer l'utilisateur
  const user = await createUser({ email, password, name });
  
  // Générer les tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  
  // Stocker le refresh token
  const sessionKey = `${SESSIONS_KEY}${user.id}:${generateSessionId()}`;
  await redisClient.setex(
    sessionKey,
    AuthConfig.refreshTokenExpiration,
    JSON.stringify({
      userId: user.id,
      refreshToken,
      createdAt: new Date().toISOString(),
    })
  );
  
  return {
    user,
    accessToken,
    refreshToken,
  };
}

// Rafraîchir le token d'accès
async function refreshAccessToken(refreshToken) {
  try {
    // Vérifier le token
    const decoded = verifyToken(refreshToken);
    
    if (decoded.type !== 'refresh') {
      throw new Error('Token invalide');
    }
    
    // Récupérer l'utilisateur
    const user = await getUserById(decoded.userId);
    
    if (!user) {
      throw new Error('Utilisateur introuvable');
    }
    
    // Supprimer le mot de passe
    const { password: _, ...userWithoutPassword } = user;
    
    // Générer un nouveau token d'accès
    const newAccessToken = generateAccessToken(user);
    
    return {
      user: userWithoutPassword,
      accessToken: newAccessToken,
    };
    
  } catch (error) {
    throw new Error('Token de rafraîchissement invalide ou expiré');
  }
}

// Déconnexion (supprimer toutes les sessions)
async function logout(userId) {
  const sessions = await redisClient.keys(`${SESSIONS_KEY}${userId}:*`);
  
  if (sessions.length > 0) {
    await redisClient.del(...sessions);
  }
  
  return true;
}

// Déconnexion spécifique (supprimer une session)
async function logoutSession(sessionId) {
  const sessionKey = `${SESSIONS_KEY}${sessionId}`;
  await redisClient.del(sessionKey);
  return true;
}

// Obtenir les sessions actives d'un utilisateur
async function getActiveSessions(userId) {
  const keys = await redisClient.keys(`${SESSIONS_KEY}${userId}:*`);
  
  const sessions = [];
  for (const key of keys) {
    const sessionData = await redisClient.get(key);
    if (sessionData) {
      sessions.push({
        id: key.split(':').pop(),
        ...JSON.parse(sessionData),
      });
    }
  }
  
  return sessions;
}

// Générer un ID de session unique
function generateSessionId() {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = {
  login,
  register,
  refreshAccessToken,
  logout,
  logoutSession,
  getActiveSessions,
  verifyToken,
  generateAccessToken,
  generateRefreshToken,
};
