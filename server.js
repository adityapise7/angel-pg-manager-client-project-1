// ============================================================
// ANGEL'S PG MANAGEMENT — LOCAL SERVER & VERIFICATION GATEWAY
// Serves static files and provides mobile verification OTP helper
// Zero external dependencies (uses native Node.js http/https/crypto)
// ============================================================

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001;
const PUBLIC_DIR = __dirname;

// In-memory OTP storage (keyed by phone number)
// Structure: phone -> { otp: string, expiresAt: number }
const otpStore = new Map();

// Helper to make external HTTPS requests
function makeHttpsRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });

    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── API: GENERATE OTP FOR MOBILE VERIFICATION ──────────────
  if (req.url === '/api/verify/generate-otp' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const phone = (payload.phone || '').trim();

        if (!phone) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Phone number is required' }));
          return;
        }

        // Generate 6-digit random OTP
        const otp = crypto.randomInt(100000, 1000000).toString();
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes validity

        otpStore.set(phone, { otp, expiresAt });
        console.log(`[Mobile Verification] OTP generated for ${phone}: ${otp} (expires in 5m)`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'OTP generated' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  // ── API: CHECK OTP FOR MOBILE VERIFICATION ─────────────────
  if (req.url === '/api/verify/check-otp' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const phone = (payload.phone || '').trim();
        const otp = (payload.otp || '').trim();

        if (!phone || !otp) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Phone and OTP are required' }));
          return;
        }

        const record = otpStore.get(phone);
        if (!record) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'OTP not found or expired' }));
          return;
        }

        if (Date.now() > record.expiresAt) {
          otpStore.delete(phone);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'OTP has expired' }));
          return;
        }

        if (record.otp === otp) {
          otpStore.delete(phone); // Invalidate once verified
          console.log(`[Mobile Verification] OTP successfully verified for ${phone}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'OTP verified successfully' }));
        } else {
          console.log(`[Mobile Verification] Invalid OTP attempt for ${phone}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Invalid OTP' }));
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  // ── STATIC FILE SERVING ────────────────────────────────────
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, reqPath);

  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`
============================================================
  ANGEL'S PG MANAGEMENT — LIVE SERVER ACTIVE
  Running at: http://localhost:${PORT}
  Mobile Verification Service: ACTIVE
============================================================
  `);
});
