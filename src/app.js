'use strict';
const path = require('path');
const express = require('express');
const session = require('express-session');
const config = require('./config');
const { HttpError } = require('./utils');
const { requireAuth, csrfGuard } = require('./middleware/auth');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.isProd) app.set('trust proxy', 1);

  // Cabeceras de seguridad básicas
  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    });
    next();
  });

  app.use(express.json({ limit: '200kb' }));
  app.use(session({
    name: 'sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure: config.isProd && process.env.COOKIE_SECURE !== 'false', maxAge: 8 * 60 * 60 * 1000 },
  }));

  // API
  const api = express.Router();
  api.use(csrfGuard);
  api.use('/auth', require('./routes/auth'));
  api.use(requireAuth);
  api.use('/usuarios', require('./routes/usuarios'));
  api.use('/catalogos', require('./routes/catalogos'));
  api.use('/equipos', require('./routes/equipos'));
  api.use('/mantenimientos', require('./routes/mantenimientos'));
  api.use('/solicitudes', require('./routes/solicitudes'));
  api.use('/reportes', require('./routes/reportes'));
  api.use((_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada')));
  app.use('/api', api);

  // Archivos estáticos (frontend + librerías servidas localmente, sin CDN: funciona en intranet)
  const nm = path.join(__dirname, '..', 'node_modules');
  app.use('/vendor/chart.js', express.static(path.join(nm, 'chart.js', 'dist'), { maxAge: '7d' }));
  app.use('/vendor/fontawesome', express.static(path.join(nm, '@fortawesome', 'fontawesome-free'), { maxAge: '7d' }));
  app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: config.isProd ? '1h' : 0 }));

  // Manejo de errores
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') err = new HttpError(400, 'JSON inválido');
    if (err.type === 'entity.too.large') err = new HttpError(413, 'Petición demasiado grande');
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Error interno del servidor' : err.message, details: err.details });
  });

  return app;
}

module.exports = { createApp };
