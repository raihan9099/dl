'use strict';
const express = require('express');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.post('/api/download', (req, res) => {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL দিন' });
    }

    if (!/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: 'সঠিক URL দিন' });
    }

    const id = Date.now().toString(36);
    const outDir = '/tmp/dl';
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const template = path.join(outDir, `${id}.%(ext)s`);

    // yt-dlp কে বলছি best quality নিতে
    const args = [
        '--no-playlist',
        '--no-warnings',
        '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '-o', template,
        url
    ];

    execFile('yt-dlp', args, { timeout: 180000 }, (err, stdout, stderr) => {
        if (err) {
            console.error('yt-dlp error:', stderr || err.message);
            return res.status(500).json({
                error: 'ডাউনলোড ব্যর্থ',
                details: (stderr || err.message).slice(0, 300)
            });
        }

        const files = fs.readdirSync(outDir).filter(f => f.startsWith(id));
        if (!files.length) {
            return res.status(500).json({ error: 'ফাইল পাওয়া যায়নি' });
        }

        const filePath = path.join(outDir, files[0]);
        const stat = fs.statSync(filePath);

        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Disposition', `attachment; filename="video-${id}.mp4"`);

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
        stream.on('close', () => fs.unlink(filePath, () => {}));
    });
});

app.listen(PORT, HOST, () => {
    console.log(`🚀 Server on http://${HOST}:${PORT}`);
});
