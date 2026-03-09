# FFmpeg Remote API

API pour exécuter des jobs FFmpeg à distance, permettant aux clients de soumettre des tâches de traitement vidéo/audio sans avoir besoin de ressources locales.

## 🚀 Fonctionnalités

- **Authentification JWT**: Inscription, connexion, refresh token
- **Upload multi-fichiers**: Uploader vos assets (vidéo, audio, images) via multipart/form-data
- **Commandes FFmpeg flexibles**: Exécuter n'importe quelle commande FFmpeg
- **Queue de jobs**: Gestion scalable des jobs avec BullMQ et Redis
- **Progression en temps réel**: Suivre la progression des encodages
- **Pagination**: Liste paginée des jobs avec filtres et tri
- **Téléchargement des résultats**: Récupérer les fichiers encodés

## 📋 Prérequis

- Node.js >= 18
- Redis 7+
- FFmpeg

## 🛠️ Installation

### 1. Installer les dépendances

```bash
cd ffmpeg-remote-api
npm install
```

### 2. Installer FFmpeg

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

**Windows:**
Télécharger depuis https://ffmpeg.org/download.html

### 3. Démarrer Redis

```bash
docker run -d -p 6379:6379 redis:7-alpine
```

Ou avec docker-compose:
```bash
docker-compose up -d redis
```

## 🏃 Utilisation

### Démarrer le serveur

```bash
npm start
```

Le serveur démarre sur `http://localhost:3000`

### Démarrer le worker

Dans un nouveau terminal:

```bash
npm run worker
```

### Utiliser Docker Compose

```bash
# Démarrer tout (Redis, API, Worker)
docker-compose up -d

# Voir les logs
docker-compose logs -f
```

## 📚 API Documentation

### Authentification

#### Inscription

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "name": "John Doe"
  }'

# Réponse:
{
  "success": true,
  "message": "Utilisateur créé avec succès",
  "user": {
    "id": "user_1234567890_abc123",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Connexion

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'

# Réponse:
{
  "success": true,
  "message": "Connexion réussie",
  "user": { ... },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Rafraîchir le token

```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'

# Réponse:
{
  "success": true,
  "user": { ... },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Obtenir l'utilisateur courant

```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <accessToken>"

# Réponse:
{
  "success": true,
  "user": {
    "id": "user_1234567890_abc123",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

#### Déconnexion

```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer <accessToken>"
```

---

### Uploader des assets

```bash
# Uploader des fichiers
curl -X POST http://localhost:3000/api/upload \
  -F "files=@video.mp4" \
  -F "files=@audio.mp3" \
  -F "files=@overlay.png"

# Réponse:
{
  "success": true,
  "uploadId": "abc123-def456",
  "files": [
    {"name": "video.mp4", "size": 12345678, "mimetype": "video/mp4"},
    {"name": "audio.mp3", "size": 3456789, "mimetype": "audio/mpeg"},
    {"name": "overlay.png", "size": 123456, "mimetype": "image/png"}
  ]
}
```

### Créer un job

```bash
# Créer un job avec une commande FFmpeg
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "command": "ffmpeg -i video.mp4 -i audio.mp3 -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 output.mp4",
    "uploadId": "abc123-def456",
    "outputFileName": "output.mp4"
  }'

# Réponse:
{
  "success": true,
  "jobId": "job-xyz789"
}
```

### Lister les jobs (avec pagination)

```bash
# Lister tous les jobs de l'utilisateur
curl "http://localhost:3000/api/jobs?page=1&limit=20" \
  -H "Authorization: Bearer <accessToken>"

# Filtrer par statut
curl "http://localhost:3000/api/jobs?status=completed" \
  -H "Authorization: Bearer <accessToken>"

# Trier par date de création (croissant)
curl "http://localhost:3000/api/jobs?sortBy=createdAt&sortOrder=asc" \
  -H "Authorization: Bearer <accessToken>"

# Rechercher dans les commandes
curl "http://localhost:3000/api/jobs?search=ffmpeg" \
  -H "Authorization: Bearer <accessToken>"

# Réponse:
{
  "jobs": [
    {
      "id": "job-xyz789",
      "command": "ffmpeg -i video.mp4 output.mp4",
      "status": "completed",
      "progress": 100,
      "outputFileName": "output.mp4",
      "createdAt": "2024-01-01T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### Vérifier le statut d'un job

```bash
curl http://localhost:3000/api/jobs/job-xyz789 \
  -H "Authorization: Bearer <accessToken>"

# Réponse:
{
  "exists": true,
  "id": "job-xyz789",
  "status": "processing",
  "progress": 45,
  "createdAt": "2024-01-01T10:00:00.000Z"
}
```

Statuts possibles:
- `pending`: En attente dans la queue
- `processing`: En cours d'exécution
- `completed`: Terminé avec succès
- `failed`: Échoué
- `canceled`: Annulé

### Télécharger le résultat

```bash
# Une fois le job terminé
curl -o output.mp4 http://localhost:3000/api/jobs/job-xyz789/result \
  -H "Authorization: Bearer <accessToken>"
```

### Statistiques de la queue

```bash
curl http://localhost:3000/api/jobs/stats

# Réponse:
{
  "waiting": 2,
  "active": 1,
  "completed": 15,
  "failed": 0,
  "total": 3
}
```

## 🔧 Exemples de commandes

### Fusionner vidéo et audio
```json
{
  "command": "ffmpeg -i video.mp4 -i audio.mp3 -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 output.mp4",
  "uploadId": "abc123",
  "outputFileName": "output.mp4"
}
```

### Ajouter un filigrane (overlay)
```json
{
  "command": "ffmpeg -i video.mp4 -i logo.png -filter_complex \"overlay=10:10\" output.mp4",
  "uploadId": "abc123",
  "outputFileName": "output.mp4"
}
```

### Convertir en GIF
```json
{
  "command": "ffmpeg -i video.mp4 -vf \"fps=10,scale=320:-1:flags=lanczos\" output.gif",
  "uploadId": "abc123",
  "outputFileName": "output.gif"
}
```

### Extraire l'audio
```json
{
  "command": "ffmpeg -i video.mp4 -vn -acodec mp3 output.mp3",
  "uploadId": "abc123",
  "outputFileName": "output.mp3"
}
```

### Créer une vidéo à partir d'images
```json
{
  "command": "ffmpeg -framerate 30 -i frame-%03d.png -c:v libx264 -pix_fmt yuv420p output.mp4",
  "uploadId": "abc123",
  "outputFileName": "output.mp4"
}
```

## 🔌 Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `PORT` | 3000 | Port du serveur |
| `REDIS_HOST` | localhost | Hôte Redis |
| `REDIS_PORT` | 6379 | Port Redis |
| `JWT_SECRET` | *changeme* | Secret pour signer les tokens JWT |
| `JWT_ACCESS_EXPIRATION` | 3600 | Durée de vie du token d'accès (secondes) |
| `JWT_REFRESH_EXPIRATION` | 604800 | Durée de vie du token de rafraîchissement (secondes) |
| `MAX_UPLOAD_SIZE_MB` | 5000 | Taille max d'upload (Mo) |
| `MAX_CONCURRENT_JOBS` | 4 | Jobs simultanés max |
| `FFPROG_TIMEOUT_HOURS` | 2 | Timeout par job (heures) |
| `TEMP_FILE_TTL_HOURS` | 24 | Durée de vie des fichiers temporaires |

## 📊 Architecture

```
┌──────────┐     Upload      ┌─────────────┐
│  Client  │ ───────────────►│   API       │
│          │ ◄──────────────│  (Express)  │
└──────────┘  Download      └──────┬──────┘
                                  │
                                  ▼
                           ┌───────────┐
                           │  Redis    │
                           │  (Queue)  │
                           └─────┬─────┘
                                 │
                                 ▼
                           ┌───────────┐
                           │  Worker   │
                           │  (FFmpeg) │
                           └───────────┘
```

## 🖥️ CLI (Ligne de commande)

Le CLI permet d'interagir avec l'API directement depuis le terminal.

### Installation

```bash
npm install
```

### Commandes disponibles

#### Authentification

```bash
# S'inscrire
ffmpeg-api auth register user@example.com password123 --name "John Doe"

# Se connecter
ffmpeg-api auth login user@example.com password123

# Afficher l'utilisateur courant
ffmpeg-api auth me

# Rafraîchir le token
ffmpeg-api auth refresh

# Se déconnecter
ffmpeg-api auth logout
```

#### Upload

```bash
# Uploader un ou plusieurs fichiers
ffmpeg-api upload video.mp4 audio.mp3
ffmpeg-api u image.png  # alias court

# Réponse:
# ✓ Upload terminé !
#   Upload ID: abc123-def456
#   Fichiers: 2
#     - video.mp4 (15.23 MB)
#     - audio.mp3 (3.45 MB)
```

#### Jobs

```bash
# Créer un job
ffmpeg-api job create \
  --command="ffmpeg -i video.mp4 -vf 'scale=1280:-1' output.mp4" \
  --upload-id abc123-def456 \
  --output output.mp4

# Obtenir le statut d'un job
ffmpeg-api job status job-xyz789

# Lister les jobs (paginé)
ffmpeg-api job list --page 1 --limit 20
ffmpeg-api job list --status completed
ffmpeg-api job list --search "scale"

# Suivre un job en temps réel
ffmpeg-api job watch job-xyz789

# Télécharger le résultat
ffmpeg-api job download job-xyz789
ffmpeg-api job download job-xyz789 --output mon-video.mp4

# Supprimer un job
ffmpeg-api job delete job-xyz789
```

#### Exécution rapide

```bash
# Créer et exécuter un job en une commande
ffmpeg-api run "ffmpeg -i video.mp4 output.mp4" \
  --upload-id abc123-def456 \
  --output output.mp4 \
  --watch \
  --download

# Le job est créé, suivi en temps réel, et le résultat téléchargé automatiquement
```

### Options globales

```bash
# Utiliser une autre URL d'API
ffmpeg-api auth login user@example.com password --url http://mon-serveau:3000

# L'URL est sauvegardée dans ~/.ffmpeg-api-config
```

### Configuration

Le CLI stocke sa configuration dans `~/.ffmpeg-api-config` :

```json
{
  "apiUrl": "http://localhost:3000",
  "email": "user@example.com",
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci..."
}
```

### Aide

```bash
ffmpeg-api --help           # Aide générale
ffmpeg-api auth --help      # Aide commandes auth
ffmpeg-api job --help       # Aide commandes job
ffmpeg-api job create --help # Aide pour une commande spécifique
```

## 🐳 Docker

```bash
# Build et run
docker-compose up -d --build

# Logs
docker-compose logs -f api
docker-compose logs -f worker

# Stop
docker-compose down
```

## 📄 License

MIT
