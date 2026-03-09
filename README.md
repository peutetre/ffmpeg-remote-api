# FFmpeg Remote API

API to run FFmpeg jobs remotely, allowing clients to submit video/audio processing tasks without needing local resources.

## 🚀 Features

- **JWT Authentication**: Register, login, refresh token
- **Multi-file Upload**: Upload your assets (video, audio, images) via multipart/form-data
- **Flexible FFmpeg Commands**: Run any FFmpeg command
- **Job Queue**: Scalable job management with BullMQ and Redis
- **Real-time Progress**: Track encoding progress
- **Pagination**: Paginated job listing with filters and sorting
- **Result Download**: Retrieve encoded files

## 📋 Prerequisites

- Node.js >= 18
- Redis 7+
- FFmpeg

## 🛠️ Installation

### 1. Install dependencies

```bash
cd ffmpeg-remote-api
npm install
```

### 2. Install FFmpeg

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
Download from https://ffmpeg.org/download.html

### 3. Start Redis

```bash
redis-server
```

Or install via your package manager:

```bash
# Ubuntu/Debian
sudo apt-get install redis-server

# macOS
brew install redis && brew services start redis
```

## 🏃 Usage

### Start the server

```bash
npm start
```

The server starts on `http://localhost:3000`

### Start the worker

In a new terminal:

```bash
npm run worker
```

## 📚 API Documentation

### Authentication

#### Register

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "name": "John Doe"
  }'

# Response:
{
  "success": true,
  "message": "User created successfully",
  "user": {
    "id": "user_1234567890_abc123",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'

# Response:
{
  "success": true,
  "message": "Login successful",
  "user": { ... },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Refresh token

```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'

# Response:
{
  "success": true,
  "user": { ... },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Get current user

```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <accessToken>"

# Response:
{
  "success": true,
  "user": {
    "id": "user_1234567890_abc123",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

#### Logout

```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer <accessToken>"
```

---

### Upload assets

```bash
# Upload files
curl -X POST http://localhost:3000/api/upload \
  -H "Authorization: Bearer <accessToken>" \
  -F "files=@video.mp4" \
  -F "files=@audio.mp3" \
  -F "files=@overlay.png"

# Response:
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

### Create a job

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessToken>" \
  -d '{
    "command": "ffmpeg -i video.mp4 -i audio.mp3 -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 output.mp4",
    "uploadId": "abc123-def456",
    "outputFileName": "output.mp4"
  }'

# Response:
{
  "success": true,
  "jobId": "job-xyz789"
}
```

### List jobs (with pagination)

```bash
# List all user jobs
curl "http://localhost:3000/api/jobs?page=1&limit=20" \
  -H "Authorization: Bearer <accessToken>"

# Filter by status
curl "http://localhost:3000/api/jobs?status=completed" \
  -H "Authorization: Bearer <accessToken>"

# Sort by creation date (ascending)
curl "http://localhost:3000/api/jobs?sortBy=createdAt&sortOrder=asc" \
  -H "Authorization: Bearer <accessToken>"

# Search in commands
curl "http://localhost:3000/api/jobs?search=ffmpeg" \
  -H "Authorization: Bearer <accessToken>"

# Response:
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

### Check job status

```bash
curl http://localhost:3000/api/jobs/job-xyz789 \
  -H "Authorization: Bearer <accessToken>"

# Response:
{
  "exists": true,
  "id": "job-xyz789",
  "status": "processing",
  "progress": 45,
  "createdAt": "2024-01-01T10:00:00.000Z"
}
```

Possible statuses:
- `pending`: Waiting in queue
- `processing`: Currently running
- `completed`: Finished successfully
- `failed`: Failed
- `canceled`: Canceled

### Download result

```bash
# Once the job is completed
curl -o output.mp4 http://localhost:3000/api/jobs/job-xyz789/result \
  -H "Authorization: Bearer <accessToken>"
```

### Queue statistics

```bash
curl http://localhost:3000/api/jobs/stats \
  -H "Authorization: Bearer <accessToken>"

# Response:
{
  "waiting": 2,
  "active": 1,
  "completed": 15,
  "failed": 0,
  "total": 3
}
```

## 🔧 Example commands

### Merge video and audio
```json
{
  "command": "ffmpeg -i video.mp4 -i audio.mp3 -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 output.mp4",
  "uploadId": "abc123",
  "outputFileName": "output.mp4"
}
```

### Add a watermark (overlay)
```json
{
  "command": "ffmpeg -i video.mp4 -i logo.png -filter_complex \"overlay=10:10\" output.mp4",
  "uploadId": "abc123",
  "outputFileName": "output.mp4"
}
```

### Convert to GIF
```json
{
  "command": "ffmpeg -i video.mp4 -vf \"fps=10,scale=320:-1:flags=lanczos\" output.gif",
  "uploadId": "abc123",
  "outputFileName": "output.gif"
}
```

### Extract audio
```json
{
  "command": "ffmpeg -i video.mp4 -vn -acodec mp3 output.mp3",
  "uploadId": "abc123",
  "outputFileName": "output.mp3"
}
```

### Create video from images
```json
{
  "command": "ffmpeg -framerate 30 -i frame-%03d.png -c:v libx264 -pix_fmt yuv420p output.mp4",
  "uploadId": "abc123",
  "outputFileName": "output.mp4"
}
```

## 🔌 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `REDIS_HOST` | localhost | Redis host |
| `REDIS_PORT` | 6379 | Redis port |
| `JWT_SECRET` | *changeme* | Secret for signing JWT tokens |
| `JWT_ACCESS_EXPIRATION` | 3600 | Access token lifetime (seconds) |
| `JWT_REFRESH_EXPIRATION` | 604800 | Refresh token lifetime (seconds) |
| `MAX_UPLOAD_SIZE_MB` | 5000 | Max upload size (MB) |
| `MAX_CONCURRENT_JOBS` | 4 | Max concurrent jobs |
| `FFPROG_TIMEOUT_HOURS` | 2 | Timeout per job (hours) |
| `TEMP_FILE_TTL_HOURS` | 24 | Temp file lifetime |

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

## 🖥️ CLI (Command Line)

The CLI allows you to interact with the API directly from the terminal.

### Installation

```bash
npm install
```

### Available commands

#### Authentication

```bash
# Register
ffmpeg-api auth register user@example.com password123 --name "John Doe"

# Login
ffmpeg-api auth login user@example.com password123

# Show current user
ffmpeg-api auth me

# Refresh token
ffmpeg-api auth refresh

# Logout
ffmpeg-api auth logout
```

#### Upload

```bash
# Upload one or more files
ffmpeg-api upload video.mp4 audio.mp3
ffmpeg-api u image.png  # short alias

# Response:
# ✓ Upload complete!
#   Upload ID: abc123-def456
#   Files: 2
#     - video.mp4 (15.23 MB)
#     - audio.mp3 (3.45 MB)
```

#### Jobs

```bash
# Create a job
ffmpeg-api job create \
  --command="ffmpeg -i video.mp4 -vf 'scale=1280:-1' output.mp4" \
  --upload-id abc123-def456 \
  --output output.mp4

# Get job status
ffmpeg-api job status job-xyz789

# List jobs (paginated)
ffmpeg-api job list --page 1 --limit 20
ffmpeg-api job list --status completed
ffmpeg-api job list --search "scale"

# Watch a job in real-time
ffmpeg-api job watch job-xyz789

# Download result
ffmpeg-api job download job-xyz789
ffmpeg-api job download job-xyz789 --output my-video.mp4

# Delete a job
ffmpeg-api job delete job-xyz789
```

#### Quick run

```bash
# Create and run a job in one command
ffmpeg-api run "ffmpeg -i video.mp4 output.mp4" \
  --upload-id abc123-def456 \
  --output output.mp4 \
  --watch \
  --download

# The job is created, tracked in real-time, and the result downloaded automatically
```

### Global options

```bash
# Use a different API URL
ffmpeg-api auth login user@example.com password --url http://my-server:3000

# The URL is saved in ~/.ffmpeg-api-config
```

### Configuration

The CLI stores its configuration in `~/.ffmpeg-api-config`:

```json
{
  "apiUrl": "http://localhost:3000",
  "email": "user@example.com",
  "accessToken": "eyJhbGci...",
  "refreshToken": "eyJhbGci..."
}
```

### Help

```bash
ffmpeg-api --help            # General help
ffmpeg-api auth --help       # Auth commands help
ffmpeg-api job --help        # Job commands help
ffmpeg-api job create --help # Help for a specific command
```

## 📄 License

MIT
