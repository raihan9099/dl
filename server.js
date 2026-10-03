'use strict';

const express = require('express');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Render-এর জন্য অবশ্যই 0.0.0.0 তে bind করতে হবে [citation:13]
const HOST = '0.0.0.0';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check (Render-এর জন্য জরুরি)
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// মূল ডাউনলোড endpoint
app.post('/api/download', async (req, res) => {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL প্রয়োজন' });
    }

    // নিরাপত্তা: শুধু http/https allow
    if (!/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: 'সঠিক URL দিন (http/https)' });
    }

    const id = crypto.randomBytes(8).toString('hex');
    const outputDir = path.join('/tmp', 'downloads');
    const outputTemplate = path.join(outputDir, `${id}.%(ext)s`);

    // /tmp ফোল্ডার বানান (Render-এ writable)
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // yt-dlp দিয়ে ডাউনলোড
    const args = [
        '--no-playlist',
        '--no-warnings',
        '-f', 'best[ext=mp4]/best',
        '-o', outputTemplate,
        url
    ];

    execFile('yt-dlp', args, { timeout: 120000 }, (error, stdout, stderr) => {
        if (error) {
            console.error('yt-dlp error:', stderr || error.message);
            return res.status(500).json({
                error: 'ডাউনলোড ব্যর্থ',
                details: (stderr || error.message).slice(0, 300)
            });
        }

        // ডাউনলোড হওয়া ফাইল খুঁজুন
        const files = fs.readdirSync(outputDir).filter(f => f.startsWith(id));
        if (files.length === 0) {
            return res.status(500).json({ error: 'ফাইল পাওয়া যায়নি' });
        }

        const filePath = path.join(outputDir, files[0]);
        const stat = fs.statSync(filePath);

        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Disposition', `attachment; filename="video-${id}.mp4"`);

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);

        // ডাউনলোড শেষে ফাইল মুছুন
        stream.on('close', () => {
            fs.unlink(filePath, () => {});
        });
    });
});

app.listen(PORT, HOST, () => {
    console.log(`🚀 Server running on http://${HOST}:${PORT}`);
});
