'use strict';
const express = require('express');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000; // Render-এর ডিফল্ট পোর্ট
const HOST = '0.0.0.0'; // Render-এর জন্য বাধ্যতামূলক

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// হেলথ চেক (Render-এর জন্য জরুরি)
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ডাউনলোড API
app.post('/api/download', (req, res) => {
    const { url, cookies } = req.body;

    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL প্রয়োজন' });
    }

    if (!/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: 'সঠিক URL দিন' });
    }

    const id = crypto.randomBytes(8).toString('hex');
    const outDir = '/tmp/dl'; // Render-এর writable ফোল্ডার
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const template = path.join(outDir, `${id}.%(ext)s`);
    let cookieArgs = [];

    // কুকিজ ফাইল তৈরি (লকড কন্টেন্টের জন্য)
    if (cookies && typeof cookies === 'string' && cookies.trim()) {
        const cookiePath = path.join(outDir, `${id}.cookies.txt`);
        fs.writeFileSync(cookiePath, cookies);
        cookieArgs = ['--cookies', cookiePath];
    }

    // yt-dlp কমান্ড: বেস্ট ভিডিও + অডিও একসাথে নামাবে এবং ffmpeg দিয়ে merge করবে
    const args = [
        '--no-playlist',
        '--no-warnings',
        '--geo-bypass', // জিও-ব্লক বাইপাস
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', // Facebook-এর জন্য
        '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        ...cookieArgs,
        '-o', template,
        url
    ];

    console.log(`[${id}] ডাউনলোড শুরু: ${url}`);

    execFile('yt-dlp', args, { timeout: 300000, maxBuffer: 1024 * 1024 * 50 }, (err, stdout, stderr) => {
        // কুকিজ ফাইল মুছুন
        if (cookieArgs.length) {
            const cookiePath = path.join(outDir, `${id}.cookies.txt`);
            if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
        }

        if (err) {
            console.error(`[${id}] yt-dlp error:`, stderr || err.message);
            return res.status(500).json({
                error: 'ডাউনলোড ব্যর্থ',
                details: (stderr || err.message).slice(0, 500)
            });
        }

        // ডাউনলোড হওয়া .mp4 ফাইল খুঁজুন
        const files = fs.readdirSync(outDir).filter(f => f.startsWith(id) && f.endsWith('.mp4'));
        if (!files.length) {
            return res.status(500).json({ error: 'ভিডিও ফাইল পাওয়া যায়নি' });
        }

        const filePath = path.join(outDir, files[0]);
        const stat = fs.statSync(filePath);

        console.log(`[${id}] ডাউনলোড সফল: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);

        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Disposition', `attachment; filename="video-${id}.mp4"`);

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
        stream.on('close', () => fs.unlink(filePath, () => {}));
    });
});

app.listen(PORT, HOST, () => {
    console.log(`🚀 Server running on http://${HOST}:${PORT}`);
});
