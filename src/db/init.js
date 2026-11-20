'use strict';
/**
 * Crea las tablas y carga datos iniciales.
 *   node src/db/init.js            -> crea lo que falte
 *   node src/db/init.js --reset    -> borra todo y vuelve a crear
 *   node src/db/init.js --demo     -> además carga datos de ejemplo
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { getDb } = require('./index');
const { now, today, addDays, addMonths } = require('../utils');

const TABLES = [
  'piezas_reemplazadas', 'mantenimiento_actividades', 'mantenimientos', 'solicitudes',
  'catalogo_fallas', 'catalogo_actividades', 'equipos', 'usuarios', 'ubicaciones',
];

// Actividades tomadas de "Tipos de mantenimiento" del documento del proyecto
const ACTIVIDADES = [
  ['Limpieza interna y externa', 'preventivo'],
  ['Limpieza de ventiladores', 'preventivo'],
  ['Revisión de cables y conexiones', 'preventivo'],
  ['Actualización del sistema operativo', 'preventivo'],
  ['Actualización de programas', 'preventivo'],
  ['Eliminación de archivos innecesarios', 'preventivo'],
  ['Revisión de seguridad y antivirus', 'preventivo'],
  ['Comprobación del funcionamiento de componentes', 'preventivo'],
  ['Reemplazo de disco duro / unidad de almacenamiento', 'correctivo'],
  ['Cambio de memoria RAM', 'correctivo'],
  ['Reparación del sistema operativo', 'correctivo'],
  ['Eliminación de virus o software malicioso', 'correctivo'],
  ['Solución de problemas de conexión', 'correctivo'],
  ['Sustitución de cables o componentes', 'correctivo'],
];

const FALLAS = [
  ['Lentitud del sistema', 'software'],
  ['Sobrecalentamiento', 'hardware'],
  ['Acumulación de polvo', 'hardware'],
  ['Errores del sistema operativo', 'software'],
  ['Virus o malware', 'software'],
  ['Falla de disco duro', 'hardware'],
  ['Memoria RAM defectuosa', 'hardware'],
  ['Sin conexión a red', 'red'],
  ['Pantalla azul / reinicios', 'software'],
  ['Atasco de papel', 'periferico'],
  ['Lámpara de proyector fundida', 'periferico'],
  ['Fuente de poder dañada', 'hardware'],
];

async function tableExists(db) {
  try { await db.get('SELECT 1 FROM usuarios LIMIT 1'); return true; } catch { return false; }
}

async function createSchema(db) {
  const file = db.client === 'mysql' ? 'schema.mysql.sql' : 'schema.sqlite.sql';
  await db.exec(fs.readFileSync(path.join(__dirname, file), 'utf8'));
}

async function dropAll(db) {
  if (db.client === 'mysql') await db.exec('SET FOREIGN_KEY_CHECKS = 0');
  else await db.exec('PRAGMA foreign_keys = OFF');
  for (const t of TABLES) await db.exec(`DROP TABLE IF EXISTS ${t}`);
  if (db.client === 'mysql') await db.exec('SET FOREIGN_KEY_CHECKS = 1');
  else await db.exec('PRAGMA foreign_keys = ON');
}

async function seedBase(db) {
  const ts = now();
  for (const [nombre, tipo] of ACTIVIDADES) {
    await db.run('INSERT INTO catalogo_actividades (nombre, tipo, activo) VALUES (?, ?, 1)', [nombre, tipo]);
  }
  for (const [nombre, cat] of FALLAS) {
    await db.run('INSERT INTO catalogo_fallas (nombre, categoria, activo) VALUES (?, ?, 1)', [nombre, cat]);
  }
  const email = (process.env.ADMIN_EMAIL || 'admin@mantenimiento.local').toLowerCase();
  const pass = process.env.ADMIN_PASSWORD || 'admin123';
  await db.run(
    'INSERT INTO usuarios (nombre, email, password_hash, rol, activo, creado_en) VALUES (?, ?, ?, ?, 1, ?)',
    ['Administrador', email, bcrypt.hashSync(pass, 10), 'admin', ts],
  );
  return { email, pass };
}

// Generador pseudoaleatorio con semilla para que la demo sea reproducible
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

async function seedDemo(db) {
  const rand = rng(42);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const ts = now();
  const hoy = today();
  const pass = bcrypt.hashSync('demo1234', 10);

  const ubic = {};
  for (const [n, d] of [
    ['Laboratorio de Cómputo 1', 'Edificio K, planta baja'],
    ['Laboratorio de Cómputo 2', 'Edificio K, planta alta'],
    ['Dirección', 'Edificio administrativo'],
    ['Servicios Escolares', 'Edificio administrativo'],
    ['Sala de Maestros', 'Edificio B'],
    ['Biblioteca', 'Centro de información'],
  ]) ubic[n] = (await db.run('INSERT INTO ubicaciones (nombre, descripcion) VALUES (?, ?)', [n, d])).id;

  const tecnicos = [];
  for (const [n, e, tel, esp] of [
    ['Carlos Méndez', 'carlos@mantenimiento.local', '241 100 2001', 'Hardware y redes'],
    ['Ana López', 'ana@mantenimiento.local', '241 100 2002', 'Software y sistemas operativos'],
  ]) tecnicos.push((await db.run(
    'INSERT INTO usuarios (nombre, email, password_hash, rol, telefono, especialidad, activo, creado_en) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
    [n, e, pass, 'tecnico', tel, esp, ts],
  )).id);

  const usuarios = [];
  for (const [n, e] of [
    ['María Hernández', 'maria@mantenimiento.local'],
    ['Jorge Ramírez', 'jorge@mantenimiento.local'],
    ['Lucía Torres', 'lucia@mantenimiento.local'],
  ]) usuarios.push((await db.run(
    'INSERT INTO usuarios (nombre, email, password_hash, rol, activo, creado_en) VALUES (?, ?, ?, ?, 1, ?)',
    [n, e, pass, 'usuario', ts],
  )).id);

  const acts = await db.all('SELECT id, nombre, tipo FROM catalogo_actividades');
  const prev = acts.filter((a) => a.tipo === 'preventivo').map((a) => a.id);
  const corr = acts.filter((a) => a.tipo === 'correctivo').map((a) => a.id);
  // Periféricos: solo actividades físicas y de conexión
  const aid = Object.fromEntries(acts.map((a) => [a.nombre, a.id]));
  const prevPeriferico = ['Limpieza interna y externa', 'Limpieza de ventiladores', 'Revisión de cables y conexiones',
    'Comprobación del funcionamiento de componentes'].map((n) => aid[n]);
  const corrPeriferico = ['Solución de problemas de conexión', 'Sustitución de cables o componentes'].map((n) => aid[n]);
  // Fallas coherentes con cada tipo de equipo (las repetidas pesan más)
  const fid = Object.fromEntries((await db.all('SELECT id, nombre FROM catalogo_fallas')).map((f) => [f.nombre, f.id]));
  const F = (...n) => n.map((x) => fid[x]);
  const computo = F('Lentitud del sistema', 'Lentitud del sistema', 'Sobrecalentamiento', 'Acumulación de polvo', 'Acumulación de polvo',
    'Errores del sistema operativo', 'Errores del sistema operativo', 'Virus o malware', 'Falla de disco duro', 'Memoria RAM defectuosa',
    'Sin conexión a red', 'Pantalla azul / reinicios', 'Fuente de poder dañada');
  const fallasPorTipo = {
    pc: computo,
    laptop: computo,
    impresora: F('Atasco de papel', 'Atasco de papel', 'Acumulación de polvo', 'Sin conexión a red'),
    proyector: F('Lámpara de proyector fundida', 'Sobrecalentamiento', 'Acumulación de polvo'),
    router: F('Sin conexión a red', 'Sin conexión a red', 'Sobrecalentamiento', 'Fuente de poder dañada'),
  };
  const fallasPrev = F('Acumulación de polvo', 'Lentitud del sistema');

  const modelos = {
    pc: [['Dell', 'OptiPlex 3080'], ['HP', 'ProDesk 400 G7'], ['Lenovo', 'ThinkCentre M70s']],
    laptop: [['Lenovo', 'ThinkPad E14'], ['HP', 'ProBook 450 G8']],
    impresora: [['HP', 'LaserJet Pro M404'], ['Epson', 'EcoTank L3250']],
    proyector: [['Epson', 'PowerLite X49']],
    router: [['TP-Link', 'Archer C6']],
  };
  const plan = [
    ['Laboratorio de Cómputo 1', 'pc', 10], ['Laboratorio de Cómputo 2', 'pc', 8],
    ['Dirección', 'laptop', 2], ['Servicios Escolares', 'pc', 3], ['Sala de Maestros', 'pc', 2],
    ['Biblioteca', 'pc', 2], ['Servicios Escolares', 'impresora', 1], ['Sala de Maestros', 'impresora', 1],
    ['Laboratorio de Cómputo 1', 'proyector', 1], ['Laboratorio de Cómputo 2', 'proyector', 1],
    ['Biblioteca', 'router', 1], ['Dirección', 'router', 1],
  ];

  let n = 1;
  const equipos = [];
  for (const [u, tipo, cant] of plan) {
    for (let i = 0; i < cant; i++) {
      const [marca, modelo] = pick(modelos[tipo]);
      const inv = `ITA-${String(n).padStart(4, '0')}`;
      const serie = `${marca.slice(0, 2).toUpperCase()}${Math.floor(rand() * 9e7 + 1e7)}`;
      const adq = addMonths(hoy, -Math.floor(12 + rand() * 48));
      const intervalo = tipo === 'pc' || tipo === 'laptop' ? 6 : 12;
      const resp = u.startsWith('Laboratorio') ? null : pick(usuarios);
      const espec = tipo === 'pc' || tipo === 'laptop'
        ? `${pick(['Intel Core i5', 'Intel Core i3', 'AMD Ryzen 5'])}, ${pick(['8', '16'])} GB RAM, ${pick(['SSD 256 GB', 'SSD 512 GB', 'HDD 1 TB'])}`
        : null;
      const id = (await db.run(
        `INSERT INTO equipos (num_inventario, tipo, marca, modelo, num_serie, responsable_id, ubicacion_id, estado,
          especificaciones, fecha_adquisicion, intervalo_meses, proxima_revision, creado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'operativo', ?, ?, ?, NULL, ?)`,
        [inv, tipo, marca, modelo, serie, resp, ubic[u], espec, adq, intervalo, ts],
      )).id;
      equipos.push({ id, intervalo, tipo });
      n++;
    }
  }

  // Historial de mantenimientos de los últimos ~14 meses
  for (const eq of equipos) {
    let fecha = addDays(hoy, -Math.floor(380 + rand() * 60));
    let ultimaProx = null;
    let estado = 'operativo';
    while (true) {
      fecha = addDays(fecha, Math.floor(eq.intervalo * 30 * (0.7 + rand() * 0.5)));
      if (fecha > hoy) break;
      const esCorr = rand() < 0.35;
      const tipo = esCorr ? 'correctivo' : 'preventivo';
      const tec = pick(tecnicos);
      const falla = esCorr ? pick(fallasPorTipo[eq.tipo]) : (rand() < 0.3 ? (eq.tipo === 'pc' || eq.tipo === 'laptop' ? pick(fallasPrev) : fid['Acumulación de polvo']) : null);
      ultimaProx = addMonths(fecha, eq.intervalo);
      estado = 'operativo';
      const mid = (await db.run(
        `INSERT INTO mantenimientos (equipo_id, tecnico_id, solicitud_id, tipo, fecha, falla_id, diagnostico, observaciones,
          costo_mano_obra, estado_resultante, proxima_revision, creado_en)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [eq.id, tec, tipo, fecha, falla,
          esCorr ? 'Se revisó el equipo y se identificó la causa de la falla.' : 'Mantenimiento preventivo programado.',
          rand() < 0.3 ? 'Se recomienda vigilar el comportamiento en las próximas semanas.' : null,
          esCorr ? Math.round(150 + rand() * 350) : 0, estado, ultimaProx, `${fecha} 10:00:00`],
      )).id;
      const set = new Set();
      const computo = eq.tipo === 'pc' || eq.tipo === 'laptop';
      const base = esCorr ? (computo ? corr : corrPeriferico) : (computo ? prev : prevPeriferico);
      const k = esCorr ? 1 + Math.floor(rand() * 2) : 3 + Math.floor(rand() * 4);
      while (set.size < Math.min(k, base.length)) set.add(pick(base));
      for (const a of set) await db.run('INSERT INTO mantenimiento_actividades (mantenimiento_id, actividad_id) VALUES (?, ?)', [mid, a]);
      if (esCorr && rand() < 0.5) {
        const piezasPorTipo = {
          impresora: [['Rodillo de alimentación', 240], ['Cable USB', 90]],
          proyector: [['Lámpara de proyector', 1450], ['Cable HDMI', 150]],
          router: [['Eliminador 12 V', 180], ['Cable de red Cat6', 60]],
        };
        const [pz, c] = pick(piezasPorTipo[eq.tipo] || [['Memoria RAM 8 GB DDR4', 520], ['SSD 480 GB', 680], ['Ventilador de CPU', 180], ['Fuente de poder 500 W', 750], ['Cable de red Cat6', 60]]);
        await db.run('INSERT INTO piezas_reemplazadas (mantenimiento_id, pieza, cantidad, costo) VALUES (?, ?, 1, ?)', [mid, pz, c]);
      }
    }
    await db.run('UPDATE equipos SET proxima_revision = ?, estado = ? WHERE id = ?', [ultimaProx || addDays(hoy, Math.floor(rand() * 40) - 10), estado, eq.id]);
  }

  // Algunos equipos con problemas actuales y revisiones vencidas o próximas
  // Equipos con problemas actuales: su último mantenimiento refleja ese estado (sin próxima revisión preventiva)
  for (const [i, est] of [[3, 'en_reparacion'], [15, 'en_reparacion'], [27, 'fuera_servicio']]) {
    const last = await db.get('SELECT id FROM mantenimientos WHERE equipo_id = ? ORDER BY fecha DESC, id DESC LIMIT 1', [equipos[i].id]);
    if (!last) continue;
    await db.run(
      `UPDATE mantenimientos SET tipo = 'correctivo', estado_resultante = ?, proxima_revision = NULL,
         diagnostico = ?, falla_id = COALESCE(falla_id, ?) WHERE id = ?`,
      [est, est === 'en_reparacion' ? 'Se requiere una pieza de reemplazo; el equipo queda en espera.' : 'Daño mayor; se evalúa su reemplazo.',
        pick(fallasPorTipo[equipos[i].tipo]), last.id],
    );
    await db.run('UPDATE equipos SET estado = ?, proxima_revision = NULL WHERE id = ?', [est, equipos[i].id]);
  }
  for (const [i, d] of [[1, -12], [6, -3], [9, -30], [12, 2], [20, 5], [24, 6]]) {
    await db.run('UPDATE equipos SET proxima_revision = ? WHERE id = ?', [addDays(hoy, d), equipos[i].id]);
  }

  // Solicitudes de los usuarios responsables
  const conResp = await db.all('SELECT id, responsable_id FROM equipos WHERE responsable_id IS NOT NULL');
  const sol = [
    ['La computadora tarda mucho en encender y se congela al abrir el navegador.', 'media', 'pendiente', 0, null],
    ['Pantalla azul al encender el equipo.', 'alta', 'pendiente', -1, null],
    ['La impresora atasca el papel constantemente.', 'baja', 'en_proceso', -3, tecnicos[0]],
    ['No hay conexión a internet desde esta computadora.', 'alta', 'atendida', -10, tecnicos[1]],
  ];
  for (let i = 0; i < sol.length; i++) {
    const e = conResp[i % conResp.length];
    const [d, p, est, off, tec] = sol[i];
    await db.run(
      'INSERT INTO solicitudes (equipo_id, solicitante_id, tecnico_id, descripcion, prioridad, estado, fecha, comentario) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [e.id, e.responsable_id, tec, d, p, est, addDays(hoy, off), est === 'atendida' ? 'Se reconfiguró el adaptador de red.' : null],
    );
  }
}

/** Crea el esquema si no existe. Devuelve true si se creó. */
async function ensureSchema({ demo = false, log = console.log } = {}) {
  const db = getDb();
  if (await tableExists(db)) return false;
  await createSchema(db);
  const admin = await seedBase(db);
  if (demo) await seedDemo(db);
  log(`Base de datos inicializada (${db.client}).`);
  log(`  Administrador: ${admin.email} / ${process.env.ADMIN_PASSWORD ? '(ADMIN_PASSWORD)' : admin.pass}`);
  if (demo) log('  Datos de ejemplo cargados. Usuarios demo con contraseña "demo1234".');
  return true;
}

module.exports = { ensureSchema, dropAll };

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const db = getDb();
    if (args.includes('--reset')) { await dropAll(db); console.log('Tablas eliminadas.'); }
    const created = await ensureSchema({ demo: args.includes('--demo') });
    if (!created) console.log('La base de datos ya existe; usa --reset para recrearla.');
    await db.close();
  })().catch((e) => { console.error(e); process.exit(1); });
}
