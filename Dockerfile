FROM node:20-slim

# yt-dlp, ffmpeg, python3 ইনস্টল
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && pip3 install --break-system-packages --upgrade yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 10000

CMD ["node", "server.js"]
