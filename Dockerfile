FROM node:20-alpine

# Installer ffmpeg et autres dépendances
RUN apk add --no-cache \
    ffmpeg \
    ffprobe \
    && apk add --no-cache --virtual build-dependencies \
    g++ \
    make \
    g++ \
    python3 \
    && npm config set scripts-prepend-node-path auto \
    && rm -rf /var/cache/apk/*

# Créer le dossier de l'application
WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances
RUN npm ci --only=production && npm cache clean --force

# Copier le code source
COPY src ./src

# Créer les dossiers nécessaires
RUN mkdir -p uploads output logs

# Exposer le port
EXPOSE 3000

# Commander par défaut
CMD ["npm", "start"]
