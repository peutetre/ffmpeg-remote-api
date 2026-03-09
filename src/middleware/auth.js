const jwt = require('jsonwebtoken');
const AuthConfig = require('../config/auth');
const { getUserById } = require('../services/user');

// Middleware d'authentification
async function authenticate(req, res, next) {
  try {
    // Obtenir le token du header Authorization (case-insensitive)
    const authHeader = req.headers.authorization || req.headers.Authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        error: 'Non autorisé',
        message: 'Aucun token fourni',
      });
    }
    
    // Extraire le token (format: "Bearer <token>")
    const parts = authHeader.split(' ');
    
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        error: 'Non autorisé',
        message: 'Format du token invalide',
      });
    }
    
    const token = parts[1];
    
    // Vérifier et décoder le token
    const decoded = jwt.verify(token, AuthConfig.jwtSecret, {
      algorithms: [AuthConfig.algorithm],
    });
    
    // Vérifier que c'est un token d'accès
    if (decoded.type !== 'access') {
      return res.status(401).json({
        error: 'Non autorisé',
        message: 'Token invalide',
      });
    }
    
    // Récupérer l'utilisateur
    const user = await getUserById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({
        error: 'Non autorisé',
        message: 'Utilisateur introuvable',
      });
    }
    
    // Ajouter l'utilisateur à la requête
    req.user = user;
    req.userId = user.id;
    
    next();
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Non autorisé',
        message: 'Token invalide',
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Non autorisé',
        message: 'Token expiré',
      });
    }
    
    console.error('Erreur d\'authentification:', error.code || error.message);
    return res.status(500).json({
      error: 'Erreur interne',
      message: 'Une erreur est survenue lors de l\'authentification',
    });
  }
}

// Middleware d'autorisation (rôle admin)
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Non autorisé',
        message: 'Authentification requise',
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Interdit',
        message: 'Vous n\'avez pas les permissions requises',
      });
    }
    
    next();
  };
}

// Middleware pour vérifier que l'appartient à l'utilisateur
function ownResource(resourceType = 'jobs') {
  return async (req, res, next) => {
    const resourceId = req.params.id;
    const userId = req.userId;
    
    // Récupérer la ressource
    let resource;
    
    if (resourceType === 'jobs') {
      const { getJobStatus } = require('../services/jobQueue');
      const jobStatus = await getJobStatus(resourceId);
      
      if (!jobStatus.exists) {
        return res.status(404).json({ error: 'Ressource introuvable' });
      }
      
      resource = jobStatus;
    }
    
    // Vérifier la propriété
    if (resource.userId !== userId) {
      return res.status(403).json({
        error: 'Interdit',
        message: 'Vous n\'avez pas accès à cette ressource',
      });
    }
    
    next();
  };
}

module.exports = {
  authenticate,
  authorize,
  ownResource,
};
