'use strict';
const path = require('path');

const env = process.env;
const isProd = env.NODE_ENV === 'production';

const config = {
  isProd,
  port: Number(env.PORT) || 3000,
  sessionSecret: env.SESSION_SECRET || 'dev-secret-cambiar-en-produccion',
  db: {
    client: (env.DB_CLIENT || 'sqlite').toLowerCase(), // 'sqlite' | 'mysql'
    sqliteFile: env.SQLITE_FILE || path.join(__dirname, '..', 'data', 'mantenimiento.db'),
    mysql: {
      host: env.DB_HOST || 'localhost',
      port: Number(env.DB_PORT) || 3306,
      user: env.DB_USER || 'root',
      password: env.DB_PASSWORD || '',
      database: env.DB_NAME || 'mantenimiento',
    },
  },
  // Datos de ejemplo al crear la BD por primera vez (útil para la demo)
  seedDemo: env.SEED_DEMO !== 'false',
};

if (isProd && !env.SESSION_SECRET) {
  console.error('ERROR: define SESSION_SECRET en producción.');
  process.exit(1);
}

module.exports = config;
