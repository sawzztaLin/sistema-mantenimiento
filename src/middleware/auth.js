'use strict';
const { HttpError } = require('../utils');

function requireAuth(req, _res, next) {
  if (!req.session || !req.session.user) return next(new HttpError(401, 'Sesión no iniciada'));
  req.user = req.session.user;
  next();
}

/** Restringe la ruta a ciertos roles: requireRole('admin', 'tecnico') */
function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) return next(new HttpError(403, 'No tienes permiso para esta acción'));
    next();
  };
}

/**
 * Protección CSRF sencilla: las peticiones que modifican datos deben ser JSON
 * y venir del mismo origen (además la cookie es SameSite=Lax).
 */
function csrfGuard(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!req.is('application/json')) return next(new HttpError(415, 'Se esperaba JSON'));
  const origin = req.get('origin');
  if (origin) {
    const host = req.get('host');
    try {
      if (new URL(origin).host !== host) return next(new HttpError(403, 'Origen no permitido'));
    } catch {
      return next(new HttpError(403, 'Origen no permitido'));
    }
  }
  next();
}

module.exports = { requireAuth, requireRole, csrfGuard };
