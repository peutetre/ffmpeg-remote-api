const express = require('express');
const { register, login, refreshAccessToken, logout, getActiveSessions } = require('../services/auth');
const { createUser, getUserById, updateUser, deleteUser, listUsers } = require('../services/user');
const { authenticate } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();

// POST /api/auth/register - Inscription
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    // Validation
    if (!email || !password) {
      return res.status(400).json({
        error: 'Données invalides',
        message: 'Email et mot de passe sont requis',
      });
    }
    
    const result = await register({ email, password, name });
    logger.info('User registered', { email });
    
    res.status(201).json({
      success: true,
      message: 'Utilisateur créé avec succès',
      ...result,
    });
    
  } catch (error) {
    logger.error('Register failed', { email: req.body?.email, error: error.message });
    
    if (error.message.includes('email')) {
      return res.status(409).json({
        error: 'Conflit',
        message: error.message,
      });
    }
    
    if (error.message.includes('caractères')) {
      return res.status(400).json({
        error: 'Données invalides',
        message: error.message,
      });
    }
    
    res.status(500).json({
      error: 'Erreur interne',
      message: 'Une erreur est survenue lors de l\'inscription',
    });
  }
});

// POST /api/auth/login - Connexion
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validation
    if (!email || !password) {
      return res.status(400).json({
        error: 'Données invalides',
        message: 'Email et mot de passe sont requis',
      });
    }
    
    const result = await login(email, password);
    logger.info('User logged in', { email });
    
    res.json({
      success: true,
      message: 'Connexion réussie',
      ...result,
    });
    
  } catch (error) {
    logger.warn('Login failed', { email: req.body?.email });
    
    res.status(401).json({
      error: 'Identifiants invalides',
      message: 'Email ou mot de passe incorrect',
    });
  }
});

// POST /api/auth/refresh - Rafraîchir le token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        error: 'Données invalides',
        message: 'Token de rafraîchissement requis',
      });
    }
    
    const result = await refreshAccessToken(refreshToken);
    
    res.json({
      success: true,
      ...result,
    });
    
  } catch (error) {
    logger.error('Refresh token failed', { error: error.message });
    
    res.status(401).json({
      error: 'Token invalide',
      message: 'Token de rafraîchissement invalide ou expiré',
    });
  }
});

// POST /api/auth/logout - Déconnexion
router.post('/logout', authenticate, async (req, res) => {
  try {
    await logout(req.userId);
    logger.info('User logged out', { userId: req.userId });
    
    res.json({
      success: true,
      message: 'Déconnexion réussie',
    });
    
  } catch (error) {
    logger.error('Logout failed', { userId: req.userId, error: error.message });
    res.status(500).json({
      error: 'Erreur interne',
      message: 'Une erreur est survenue lors de la déconnexion',
    });
  }
});

// GET /api/auth/me - Obtenir l'utilisateur courant
router.get('/me', authenticate, async (req, res) => {
  try {
    res.json({
      success: true,
      user: req.user,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Erreur interne',
      message: 'Une erreur est survenue',
    });
  }
});

// GET /api/auth/sessions - Obtenir les sessions actives
router.get('/sessions', authenticate, async (req, res) => {
  try {
    const sessions = await getActiveSessions(req.userId);
    
    res.json({
      success: true,
      sessions,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Erreur interne',
      message: 'Une erreur est survenue',
    });
  }
});

// PUT /api/auth/me - Mettre à jour le profil
router.put('/me', authenticate, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    const updates = {};
    if (name) updates.name = name;
    if (email) updates.email = email;
    if (password) updates.password = password;
    
    const user = await updateUser(req.userId, updates);
    
    res.json({
      success: true,
      user,
    });
  } catch (error) {
    logger.error('Profile update failed', { userId: req.userId, error: error.message });
    res.status(400).json({
      error: 'Données invalides',
      message: error.message,
    });
  }
});

// DELETE /api/auth/me - Supprimer le compte
router.delete('/me', authenticate, async (req, res) => {
  try {
    await deleteUser(req.userId);
    
    res.json({
      success: true,
      message: 'Compte supprimé avec succès',
    });
  } catch (error) {
    logger.error('Account deletion failed', { userId: req.userId, error: error.message });
    res.status(500).json({
      error: 'Erreur interne',
      message: 'Une erreur est survenue lors de la suppression',
    });
  }
});

// Route Admin - Liste des utilisateurs
router.get('/users', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    
    const result = await listUsers({
      page: parseInt(page),
      limit: parseInt(limit),
      search,
    });
    
    res.json(result);
  } catch (error) {
    logger.error('List users failed', { userId: req.userId, error: error.message });
    res.status(500).json({
      error: 'Erreur interne',
      message: 'Une erreur est survenue',
    });
  }
});

module.exports = router;
