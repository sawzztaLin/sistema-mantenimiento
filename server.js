'use strict';
const config = require('./src/config');
const { createApp } = require('./src/app');
const { ensureSchema } = require('./src/db/init');
const { getDb } = require('./src/db');

(async () => {
  await ensureSchema({ demo: config.seedDemo });
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`Sistema de Mantenimiento en http://localhost:${config.port}  (BD: ${config.db.client})`);
  });
  const shutdown = () => server.close(async () => { await getDb().close(); process.exit(0); });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})().catch((e) => {
  console.error('No se pudo iniciar:', e.message);
  process.exit(1);
});
