'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { ah, validate, HttpError } = require('../utils');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Límite simple de intentos de acceso por IP + correo (memoria del proceso)
const attempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
function tooMany(key) {
  const a = attempts.get(key);
  if (!a) return false;
  if (Date.now() - a.first > WINDOW_MS) { attempts.delete(key); return false; }
  return a.count >= MAX_ATTEMPTS;
}
function fail(key) {
  const a = attempts.get(key);
  if (!a || Date.now() - a.first > WINDOW_MS) attempts.set(key, { count: 1, first: Date.now() });
  else a.count++;
}

const publicUser = (u) => ({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol });

router.post('/login', ah(async (req, res) => {
  const { email, password } = validate(req.body, {
    email: { required: true, type: 'email' },
    password: { required: true, max: 200 },
  });
  const key = `${req.ip}|${email}`;
  if (tooMany(key)) throw new HttpError(429, 'Demasiados intentos. Espera unos minutos.');

  const u = await getDb().get('SELECT * FROM usuarios WHERE email = ?', [email]);
  const ok = u && u.activo && (await bcrypt.compare(password, u.password_hash));
  if (!ok) { fail(key); throw new HttpError(401, 'Correo o contraseña incorrectos'); }
  attempts.delete(key);

  await new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
  req.session.user = publicUser(u);
  res.json({ user: req.session.user });
}));

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('sid');
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, ah(async (req, res) => {
  // Recarga desde BD por si el usuario fue desactivado o cambió de rol
  const u = await getDb().get('SELECT * FROM usuarios WHERE id = ?', [req.user.id]);
  if (!u || !u.activo) {
    req.session.destroy(() => {});
    throw new HttpError(401, 'Sesión no válida');
  }
  req.session.user = publicUser(u);
  res.json({ user: req.session.user });
}));

router.put('/password', requireAuth, ah(async (req, res) => {
  const { actual, nueva } = validate(req.body, {
    actual: { required: true, max: 200 },
    nueva: { required: true, min: 8, max: 200 },
  });
  const db = getDb();
  const u = await db.get('SELECT password_hash FROM usuarios WHERE id = ?', [req.user.id]);
  if (!u || !(await bcrypt.compare(actual, u.password_hash))) throw new HttpError(400, 'La contraseña actual no es correcta');
  await db.run('UPDATE usuarios SET password_hash = ? WHERE id = ?', [await bcrypt.hash(nueva, 10), req.user.id]);
  res.json({ ok: true });
}));

module.exports = router;
