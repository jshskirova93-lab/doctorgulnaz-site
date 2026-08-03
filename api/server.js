'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const nodemailer = require('nodemailer');

const PORT = Number(process.env.PORT || 3000);
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGIN || 'https://doctorgulnaz.ru')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

const GMAIL_USER = process.env.GMAIL_USER || '';
const GMAIL_APP_PASSWORD = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
const GMAIL_TO = process.env.GMAIL_TO || GMAIL_USER;
const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || process.env.TOKEN || '';
const TELEGRAM_ADMIN_CHAT_ID =
  process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.ADMIN_CHAT_ID || '';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;
const requestsByIp = new Map();

const transporter = GMAIL_USER && GMAIL_APP_PASSWORD
  ? nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    })
  : null;

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(payload));
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket.remoteAddress || '')
    .split(',')[0]
    .trim();
}

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (requestsByIp.get(ip) || []).filter((time) => now - time < WINDOW_MS);
  recent.push(now);
  requestsByIp.set(ip, recent);
  return recent.length > MAX_REQUESTS_PER_WINDOW;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 16_384) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function clean(value, maxLength) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

function validateApplication(data) {
  const application = {
    name: clean(data.name, 100),
    phone: clean(data.phone, 30),
    service: clean(data.service, 200),
    message: clean(data.message, 1000),
    website: clean(data.website, 200),
  };

  if (application.website) return { spam: true };
  if (application.name.length < 2) return { error: 'Укажите имя.' };
  if (application.phone.length < 5 || !/[0-9]/.test(application.phone)) {
    return { error: 'Укажите номер телефона.' };
  }
  if (!application.service) return { error: 'Выберите вид консультации.' };
  return { application };
}

function formatApplication(application, requestId) {
  return [
    'Новая заявка с сайта doctorgulnaz.ru',
    '',
    `Номер заявки: ${requestId}`,
    `Имя: ${application.name}`,
    `Телефон: ${application.phone}`,
    `Услуга: ${application.service}`,
    `Вопрос: ${application.message || 'не указан'}`,
    `Время: ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК)`,
  ].join('\n');
}

async function sendEmail(text, requestId) {
  if (!transporter || !GMAIL_TO) throw new Error('EMAIL_NOT_CONFIGURED');
  await transporter.sendMail({
    from: `Сайт доктора Гузаировой <${GMAIL_USER}>`,
    to: GMAIL_TO,
    subject: `Новая заявка с сайта — ${requestId}`,
    text,
  });
}

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_ADMIN_CHAT_ID) {
    throw new Error('TELEGRAM_NOT_CONFIGURED');
  }
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_ADMIN_CHAT_ID,
      text,
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`TELEGRAM_${response.status}`);
}

async function handleApplication(req, res) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return sendJson(res, 403, { ok: false, message: 'Недопустимый источник запроса.' });
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return sendJson(res, 429, { ok: false, message: 'Слишком много попыток. Повторите позже.' });
  }

  let data;
  try {
    data = await readJson(req);
  } catch {
    return sendJson(res, 400, { ok: false, message: 'Некорректные данные.' });
  }

  const validation = validateApplication(data);
  if (validation.spam) return sendJson(res, 200, { ok: true });
  if (validation.error) return sendJson(res, 400, { ok: false, message: validation.error });

  const requestId = crypto.randomUUID().split('-')[0].toUpperCase();
  const text = formatApplication(validation.application, requestId);
  const [email, telegram] = await Promise.allSettled([
    sendEmail(text, requestId),
    sendTelegram(text),
  ]);

  const delivered = {
    email: email.status === 'fulfilled',
    telegram: telegram.status === 'fulfilled',
  };
  if (!delivered.email) console.error('Email delivery failed:', email.reason?.message || 'unknown');
  if (!delivered.telegram) {
    console.error('Telegram delivery failed:', telegram.reason?.message || 'unknown');
  }

  if (!delivered.email && !delivered.telegram) {
    return sendJson(res, 502, {
      ok: false,
      message: 'Не удалось передать заявку. Позвоните администратору.',
    });
  }

  return sendJson(res, 200, { ok: true, requestId, delivered });
}

const server = http.createServer(async (req, res) => {
  setCors(req, res);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, {
      ok: true,
      configured: {
        email: Boolean(transporter && GMAIL_TO),
        telegram: Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_ADMIN_CHAT_ID),
      },
    });
  }
  if (req.method === 'POST' && url.pathname === '/request') {
    return handleApplication(req, res);
  }
  return sendJson(res, 404, { ok: false, message: 'Не найдено.' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Form API listening on port ${PORT}`);
});
