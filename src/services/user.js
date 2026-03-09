const bcrypt = require('bcryptjs');
const { redisClient } = require('../config/redis');

const USERS_KEY = 'users:';
const SESSIONS_KEY = 'sessions:';

// Hasher un mot de passe
async function hashPassword(password) {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

// Vérifier un mot de passe
async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// Créer un nouvel utilisateur
async function createUser(userData) {
  const { email, password, name } = userData;
  
  // Vérifier si l'email existe déjà
  const existingUser = await getUserByEmail(email);
  if (existingUser) {
    throw new Error('Cet email est déjà utilisé');
  }
  
  // Hasher le mot de passe
  const hashedPassword = await hashPassword(password);
  
  // Créer l'objet utilisateur
  const user = {
    id: generateUserId(),
    email,
    password: hashedPassword,
    name: name || email.split('@')[0],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  // Sauvegarder dans Redis
  const userKey = `${USERS_KEY}${user.id}`;
  await redisClient.set(userKey, JSON.stringify(user));
  
  // Indexer par email pour la recherche
  await redisClient.set(`users:email:${email.toLowerCase()}`, user.id);
  
  // Retourner l'utilisateur sans le mot de passe
  return getUserById(user.id);
}

// Obtenir un utilisateur par ID
async function getUserById(userId) {
  const userKey = `${USERS_KEY}${userId}`;
  const userData = await redisClient.get(userKey);
  
  if (!userData) {
    return null;
  }
  
  const user = JSON.parse(userData);
  // Ne pas retourner le mot de passe
  delete user.password;
  
  return user;
}

// Obtenir un utilisateur par email (sans le mot de passe)
async function getUserByEmail(email) {
  const userId = await redisClient.get(`users:email:${email.toLowerCase()}`);
  
  if (!userId) {
    return null;
  }
  
  return getUserById(userId);
}

// Obtenir un utilisateur par email (avec le mot de passe - pour la connexion)
async function getUserByEmailWithPassword(email) {
  const userId = await redisClient.get(`users:email:${email.toLowerCase()}`);
  
  if (!userId) {
    return null;
  }
  
  const userKey = `${USERS_KEY}${userId}`;
  const userData = await redisClient.get(userKey);
  
  if (!userData) {
    return null;
  }
  
  return JSON.parse(userData);
}

// Mettre à jour un utilisateur
async function updateUser(userId, updates) {
  const userKey = `${USERS_KEY}${userId}`;
  const userData = await redisClient.get(userKey);
  
  if (!userData) {
    throw new Error('Utilisateur introuvable');
  }
  
  const user = JSON.parse(userData);
  
  // Mettre à jour les champs autorisés
  if (updates.name) user.name = updates.name;
  if (updates.email) {
    // Supprimer l'ancien index email
    await redisClient.del(`users:email:${user.email.toLowerCase()}`);
    user.email = updates.email;
    // Créer le nouvel index email
    await redisClient.set(`users:email:${user.email.toLowerCase()}`, userId);
  }
  if (updates.password) {
    user.password = await hashPassword(updates.password);
  }
  
  user.updatedAt = new Date().toISOString();
  
  // Sauvegarder
  await redisClient.set(userKey, JSON.stringify(user));
  
  return getUserById(userId);
}

// Supprimer un utilisateur
async function deleteUser(userId) {
  const userKey = `${USERS_KEY}${userId}`;
  const userData = await redisClient.get(userKey);
  
  if (!userData) {
    throw new Error('Utilisateur introuvable');
  }
  
  const user = JSON.parse(userData);
  
  // Supprimer les sessions associées
  const sessions = await redisClient.keys(`${SESSIONS_KEY}${userId}:*`);
  if (sessions.length > 0) {
    await redisClient.del(...sessions);
  }
  
  // Supprimer l'index email
  await redisClient.del(`users:email:${user.email.toLowerCase()}`);
  
  // Supprimer l'utilisateur
  await redisClient.del(userKey);
  
  return true;
}

// Lister tous les utilisateurs (pour admin)
async function listUsers({ page = 1, limit = 10, search = '' } = {}) {
  // Récupérer toutes les clés utilisateurs
  const keys = await redisClient.keys(`${USERS_KEY}*`);
  
  // Filtrer et mapper
  let users = [];
  for (const key of keys) {
    const userData = await redisClient.get(key);
    if (userData) {
      const user = JSON.parse(userData);
      delete user.password;
      
      // Appliquer la recherche
      if (search) {
        const searchLower = search.toLowerCase();
        if (
          user.name.toLowerCase().includes(searchLower) ||
          user.email.toLowerCase().includes(searchLower)
        ) {
          users.push(user);
        }
      } else {
        users.push(user);
      }
    }
  }
  
  // Pagination
  const total = users.length;
  const startIndex = (page - 1) * limit;
  const paginatedUsers = users.slice(startIndex, startIndex + limit);
  
  return {
    users: paginatedUsers,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// Générer un ID unique pour utilisateur
function generateUserId() {
  return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = {
  createUser,
  getUserById,
  getUserByEmail,
  getUserByEmailWithPassword,
  updateUser,
  deleteUser,
  listUsers,
  hashPassword,
  verifyPassword,
};
