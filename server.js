const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const crypto = require('node:crypto');
const path = require('node:path');
const { run, get, all, initialize } = require('./database');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET;
if (isProduction && (!sessionSecret || sessionSecret.length < 32)) {
  throw new Error('Production ortamında en az 32 karakterlik SESSION_SECRET ayarlayın.');
}
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(session({
  name: 'thafl.sid',
  secret: sessionSecret || crypto.randomBytes(48).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: isProduction, maxAge: 1000 * 60 * 60 * 8 }
}));
app.use(express.static(path.join(__dirname, 'public')));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { success: false, message: 'Çok fazla deneme yaptınız. Lütfen 15 dakika sonra tekrar deneyin.' } });
const csrf = (req, res, next) => {
  const supplied = req.get('x-csrf-token');
  if (!supplied || !req.session.csrfToken || supplied !== req.session.csrfToken) {
    return res.status(403).json({ success: false, message: 'İstek doğrulanamadı. Sayfayı yenileyip tekrar deneyin.' });
  }
  next();
};
const requireRole = (role) => (req, res, next) => {
  if (!req.session.user || req.session.user.rol !== role) {
    return res.status(403).json({ success: false, message: 'Bu işlem için yetkiniz yok.' });
  }
  next();
};
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const publicUser = (user) => ({ id: user.id, ad: user.ad, rol: user.rol, sube: user.sube, no: user.okul_no });
const errorResponse = (res, err, message) => {
  console.error(err);
  if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ success: false, message: 'Bu T.C. kimlik veya okul numarası zaten kayıtlı.' });
  }
  return res.status(500).json({ success: false, message });
};

app.get('/api/csrf', (req, res) => {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.json({ token: req.session.csrfToken });
});

app.post('/api/kayit/ogrenci', authLimiter, csrf, async (req, res) => {
  const ad = text(req.body.ad, 80);
  const tc = text(req.body.tc, 11);
  const no = text(req.body.no, 20) || null;
  const sube = text(req.body.sube, 4);
  const sifre = typeof req.body.sifre === 'string' ? req.body.sifre : '';
  if (ad.length < 2 || !/^\d{11}$/.test(tc) || sifre.length < 8 || sifre.length > 72 || !/^(9|10|11|12)\/[ABC]$/.test(sube)) {
    return res.status(400).json({ success: false, message: 'Ad, 11 haneli T.C. kimlik no, geçerli şube ve en az 8 karakterli şifre girin.' });
  }
  try {
    const hash = await bcrypt.hash(sifre, 12);
    await run(`INSERT INTO users (tc, okul_no, ad, sube, sifre, rol) VALUES (?, ?, ?, ?, ?, 'Ogrenci')`, [tc, no, ad, sube, hash]);
    res.status(201).json({ success: true, message: 'Öğrenci kaydı oluşturuldu. Giriş yapabilirsiniz.' });
  } catch (err) { errorResponse(res, err, 'Kayıt sırasında sunucu hatası oluştu.'); }
});

app.post('/api/giris', authLimiter, csrf, async (req, res) => {
  const identifier = text(req.body.tcVeyaSicil, 30);
  const sifre = typeof req.body.sifre === 'string' ? req.body.sifre : '';
  const role = req.body.rolSecimi;
  if (!identifier || !sifre || !['Ogrenci', 'Ogretmen'].includes(role)) {
    return res.status(400).json({ success: false, message: 'Giriş bilgilerini kontrol edin.' });
  }
  try {
    const user = role === 'Ogrenci'
      ? await get("SELECT * FROM users WHERE (tc = ? OR okul_no = ?) AND rol = 'Ogrenci'", [identifier, identifier])
      : await get("SELECT * FROM users WHERE tc = ? AND rol = 'Ogretmen'", [identifier]);
    if (!user || !(await bcrypt.compare(sifre, user.sifre))) {
      return res.status(401).json({ success: false, message: 'Kullanıcı bilgileri veya şifre hatalı.' });
    }
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ success: false, message: 'Oturum başlatılamadı.' });
      req.session.user = publicUser(user);
      req.session.csrfToken = crypto.randomBytes(32).toString('hex');
      req.session.save((saveErr) => {
        if (saveErr) return res.status(500).json({ success: false, message: 'Oturum kaydedilemedi.' });
        res.json({ success: true, user: req.session.user, csrfToken: req.session.csrfToken });
      });
    });
  } catch (err) { errorResponse(res, err, 'Giriş sırasında sunucu hatası oluştu.'); }
});

app.get('/api/oturum', (req, res) => res.json({ loggedIn: Boolean(req.session.user), user: req.session.user || null }));
app.post('/api/cikis', csrf, (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ success: false, message: 'Oturum kapatılamadı.' });
    res.clearCookie('thafl.sid', { httpOnly: true, sameSite: 'lax', secure: isProduction });
    res.json({ success: true });
  });
});

app.post('/api/bilet', csrf, requireRole('Ogrenci'), async (req, res) => {
  const konu = text(req.body.konu, 120);
  const detay = text(req.body.detay, 2000);
  if (konu.length < 3 || detay.length < 5) {
    return res.status(400).json({ success: false, message: 'Konu en az 3, açıklama en az 5 karakter olmalı.' });
  }
  try {
    await run('INSERT INTO biletler (ogrenci_id, konu, detay) VALUES (?, ?, ?)', [req.session.user.id, konu, detay]);
    res.status(201).json({ success: true, message: 'Destek talebiniz öğretmenlere iletildi.' });
  } catch (err) { errorResponse(res, err, 'Bilet oluşturulamadı.'); }
});

app.get('/api/biletlerim', requireRole('Ogrenci'), async (req, res) => {
  try {
    const tickets = await all('SELECT id, konu, detay, durum, tarih FROM biletler WHERE ogrenci_id = ? ORDER BY id DESC', [req.session.user.id]);
    res.json({ success: true, biletler: tickets });
  } catch (err) { errorResponse(res, err, 'Biletler alınamadı.'); }
});

app.get('/api/biletler', requireRole('Ogretmen'), async (req, res) => {
  try {
    const tickets = await all(`SELECT b.id, b.konu, b.detay, b.durum, b.tarih, u.ad, u.sube
      FROM biletler b JOIN users u ON u.id = b.ogrenci_id ORDER BY b.id DESC`);
    res.json({ success: true, biletler: tickets });
  } catch (err) { errorResponse(res, err, 'Biletler alınamadı.'); }
});

app.delete('/api/bilet/:id', csrf, requireRole('Ogretmen'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ success: false, message: 'Geçersiz bilet numarası.' });
  try {
    const result = await run("UPDATE biletler SET durum = 'Kapali' WHERE id = ? AND durum = 'Acik'", [id]);
    if (!result.changes) return res.status(404).json({ success: false, message: 'Açık bilet bulunamadı.' });
    res.json({ success: true, message: 'Bilet kapatıldı.' });
  } catch (err) { errorResponse(res, err, 'Bilet kapatılamadı.'); }
});

app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'API adresi bulunamadı.' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ success: false, message: 'Geçersiz istek verisi.' });
});

initialize().then(() => {
  app.listen(PORT, () => console.log(`THAFL Portal hazır: http://localhost:${PORT}`));
}).catch((err) => {
  console.error('Veritabanı başlatılamadı:', err);
  process.exit(1);
});
