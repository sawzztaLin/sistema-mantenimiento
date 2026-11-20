'use strict';
const express = require('express');
const { getDb, isUniqueError, isForeignKeyError } = require('../db');
const { ah, validate, HttpError, idParam, now, today, addDays, isDate, toCsv } = require('../utils');
const { requireRole } = require('../middleware/auth');
const { loadMantenimientos } = require('./mantenimientos');

const router = express.Router();

const TIPOS = ['pc', 'laptop', 'impresora', 'proyector', 'router', 'otro'];
const ESTADOS = ['operativo', 'en_reparacion', 'fuera_servicio', 'baja'];

const rules = {
  num_inventario: { required: true, max: 60 },
  tipo: { required: true, type: 'enum', values: TIPOS },
  marca: { required: true, max: 80 },
  modelo: { required: true, max: 80 },
  num_serie: { max: 80 },
  responsable_id: { type: 'int', min: 1 },
  ubicacion_id: { type: 'int', min: 1 },
  estado: { type: 'enum', values: ESTADOS, default: 'operativo' },
  especificaciones: { max: 2000 },
  fecha_adquisicion: { type: 'date' },
  intervalo_meses: { type: 'int', min: 1, max: 60, default: 6 },
  proxima_revision: { type: 'date' },
};
const FIELDS = Object.keys(rules);

const SELECT = `
  SELECT e.*, u.nombre AS responsable, ub.nombre AS ubicacion,
         (SELECT MAX(m.fecha) FROM mantenimientos m WHERE m.equipo_id = e.id) AS ultimo_mantenimiento
    FROM equipos e
    LEFT JOIN usuarios u ON u.id = e.responsable_id
    LEFT JOIN ubicaciones ub ON ub.id = e.ubicacion_id`;

/** Filtros compartidos entre el listado y la exportación CSV. */
function buildFilters(req) {
  const where = [];
  const params = [];
  const q = req.query;
  if (req.user.rol === 'usuario') { where.push('e.responsable_id = ?'); params.push(req.user.id); }
  if (q.q) {
    where.push('(e.num_inventario LIKE ? OR e.marca LIKE ? OR e.modelo LIKE ? OR e.num_serie LIKE ? OR u.nombre LIKE ?)');
    params.push(...Array(5).fill(`%${q.q}%`));
  }
  if (TIPOS.includes(q.tipo)) { where.push('e.tipo = ?'); params.push(q.tipo); }
  if (ESTADOS.includes(q.estado)) { where.push('e.estado = ?'); params.push(q.estado); }
  else if (q.estado !== 'todos') where.push("e.estado <> 'baja'"); // por defecto ocultar equipos dados de baja
  if (Number(q.ubicacion_id) > 0) { where.push('e.ubicacion_id = ?'); params.push(Number(q.ubicacion_id)); }
  if (Number(q.responsable_id) > 0) { where.push('e.responsable_id = ?'); params.push(Number(q.responsable_id)); }
  const hoy = today();
  if (q.revision === 'vencida') { where.push('e.proxima_revision < ?'); params.push(hoy); }
  if (q.revision === 'proxima') { where.push('e.proxima_revision >= ? AND e.proxima_revision <= ?'); params.push(hoy, addDays(hoy, 7)); }
  if (q.revision === 'sin') where.push('e.proxima_revision IS NULL');
  if (isDate(q.desde) && isDate(q.hasta)) { where.push('e.proxima_revision >= ? AND e.proxima_revision <= ?'); params.push(q.desde, q.hasta); }
  return { where: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

router.get('/', ah(async (req, res) => {
  const { where, params } = buildFilters(req);
  const rows = await getDb().all(`${SELECT} ${where} ORDER BY e.num_inventario`, params);
  if (req.query.formato === 'csv') {
    res.type('text/csv').attachment(`equipos-${today()}.csv`);
    return res.send(toCsv(rows, [
      { key: 'num_inventario', label: 'Inventario' }, { key: 'tipo', label: 'Tipo' },
      { key: 'marca', label: 'Marca' }, { key: 'modelo', label: 'Modelo' }, { key: 'num_serie', label: 'Serie' },
      { key: 'ubicacion', label: 'Ubicación' }, { key: 'responsable', label: 'Responsable' },
      { key: 'estado', label: 'Estado' }, { key: 'ultimo_mantenimiento', label: 'Último mantenimiento' },
      { key: 'proxima_revision', label: 'Próxima revisión' },
    ]));
  }
  res.json(rows);
}));

router.get('/:id', ah(async (req, res) => {
  const id = idParam(req);
  const db = getDb();
  const equipo = await db.get(`${SELECT} WHERE e.id = ?`, [id]);
  if (!equipo) throw new HttpError(404, 'Equipo no encontrado');
  if (req.user.rol === 'usuario' && equipo.responsable_id !== req.user.id) throw new HttpError(403, 'No tienes acceso a este equipo');

  const historial = await loadMantenimientos(db, 'WHERE m.equipo_id = ?', [id]);
  const solicitudes = await db.all(
    `SELECT s.*, u.nombre AS solicitante, t.nombre AS tecnico FROM solicitudes s
       JOIN usuarios u ON u.id = s.solicitante_id LEFT JOIN usuarios t ON t.id = s.tecnico_id
      WHERE s.equipo_id = ? ORDER BY s.fecha DESC, s.id DESC`, [id]);
  const fallas = await db.all(
    `SELECT f.nombre, COUNT(*) AS total FROM mantenimientos m JOIN catalogo_fallas f ON f.id = m.falla_id
      WHERE m.equipo_id = ? GROUP BY f.id, f.nombre ORDER BY total DESC`, [id]);
  const resumen = {
    total: historial.length,
    preventivos: historial.filter((m) => m.tipo === 'preventivo').length,
    correctivos: historial.filter((m) => m.tipo === 'correctivo').length,
    costo_total: historial.reduce((s, m) => s + m.costo_total, 0),
  };
  res.json({ ...equipo, historial, solicitudes, fallas, resumen });
}));

async function save(req, id) {
  const d = validate(req.body, rules);
  const db = getDb();
  try {
    if (id) {
      const r = await db.run(`UPDATE equipos SET ${FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...FIELDS.map((f) => d[f]), id]);
      if (!r.changes) throw new HttpError(404, 'Equipo no encontrado');
      return id;
    }
    const r = await db.run(
      `INSERT INTO equipos (${FIELDS.join(', ')}, creado_en) VALUES (${FIELDS.map(() => '?').join(', ')}, ?)`,
      [...FIELDS.map((f) => d[f]), now()],
    );
    return r.id;
  } catch (e) {
    if (isUniqueError(e)) throw new HttpError(409, 'Ya existe un equipo con ese número de inventario', { num_inventario: 'Número de inventario repetido' });
    if (isForeignKeyError(e)) throw new HttpError(400, 'El responsable o la ubicación no existen');
    throw e;
  }
}

router.post('/', requireRole('admin', 'tecnico'), ah(async (req, res) => {
  res.status(201).json({ id: await save(req) });
}));

router.put('/:id', requireRole('admin', 'tecnico'), ah(async (req, res) => {
  res.json({ id: await save(req, idParam(req)) });
}));

router.delete('/:id', requireRole('admin'), ah(async (req, res) => {
  const id = idParam(req);
  const db = getDb();
  const n = await db.get('SELECT COUNT(*) AS n FROM mantenimientos WHERE equipo_id = ?', [id]);
  if (Number(n.n) > 0) throw new HttpError(409, 'El equipo tiene historial de mantenimiento. Cámbialo a estado "Baja" para conservar su historial.');
  const r = await db.run('DELETE FROM equipos WHERE id = ?', [id]);
  if (!r.changes) throw new HttpError(404, 'Equipo no encontrado');
  res.json({ ok: true });
}));

module.exports = router;
