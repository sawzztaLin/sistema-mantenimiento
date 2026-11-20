'use strict';
const express = require('express');
const { getDb, isForeignKeyError } = require('../db');
const { ah, validate, HttpError, idParam, now, today, isDate, toCsv } = require('../utils');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
const ESTADOS = ['operativo', 'en_reparacion', 'fuera_servicio', 'baja'];

const BASE = `
  SELECT m.*, e.num_inventario, e.marca, e.modelo, e.tipo AS equipo_tipo,
         t.nombre AS tecnico, f.nombre AS falla, f.categoria AS falla_categoria
    FROM mantenimientos m
    JOIN equipos e ON e.id = m.equipo_id
    JOIN usuarios t ON t.id = m.tecnico_id
    LEFT JOIN catalogo_fallas f ON f.id = m.falla_id`;

/** Carga mantenimientos con sus actividades y piezas (evita N+1 con dos consultas IN). */
async function loadMantenimientos(db, where = '', params = [], limit = null) {
  const lim = Number.isInteger(limit) && limit > 0 ? ` LIMIT ${limit}` : '';
  const rows = await db.all(`${BASE} ${where} ORDER BY m.fecha DESC, m.id DESC${lim}`, params);
  if (!rows.length) return rows;
  const acts = new Map();
  const piezas = new Map();
  const push = (map, k, v) => (map.get(k) || map.set(k, []).get(k)).push(v);
  const ids = rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const marks = chunk.map(() => '?').join(',');
    for (const a of await db.all(
      `SELECT ma.mantenimiento_id, a.id, a.nombre, a.tipo FROM mantenimiento_actividades ma
         JOIN catalogo_actividades a ON a.id = ma.actividad_id WHERE ma.mantenimiento_id IN (${marks}) ORDER BY a.nombre`, chunk,
    )) push(acts, a.mantenimiento_id, { id: a.id, nombre: a.nombre, tipo: a.tipo });
    for (const p of await db.all(
      `SELECT id, mantenimiento_id, pieza, cantidad, costo FROM piezas_reemplazadas WHERE mantenimiento_id IN (${marks}) ORDER BY id`, chunk,
    )) push(piezas, p.mantenimiento_id, { id: p.id, pieza: p.pieza, cantidad: p.cantidad, costo: Number(p.costo) });
  }
  for (const r of rows) {
    r.actividades = acts.get(r.id) || [];
    r.piezas = piezas.get(r.id) || [];
    r.costo_mano_obra = Number(r.costo_mano_obra);
    r.costo_piezas = r.piezas.reduce((s, p) => s + p.costo * p.cantidad, 0);
    r.costo_total = r.costo_mano_obra + r.costo_piezas;
  }
  return rows;
}

/** El estado y la próxima revisión del equipo se toman de su mantenimiento más reciente. */
async function syncEquipo(t, equipoId) {
  const last = await t.get(
    'SELECT estado_resultante, proxima_revision FROM mantenimientos WHERE equipo_id = ? ORDER BY fecha DESC, id DESC LIMIT 1',
    [equipoId],
  );
  if (last) {
    await t.run('UPDATE equipos SET estado = ?, proxima_revision = ? WHERE id = ?', [last.estado_resultante, last.proxima_revision, equipoId]);
  }
}

function buildFilters(req) {
  const where = [];
  const params = [];
  const q = req.query;
  if (req.user.rol === 'usuario') { where.push('e.responsable_id = ?'); params.push(req.user.id); }
  for (const k of ['equipo_id', 'tecnico_id', 'falla_id']) {
    if (Number(q[k]) > 0) { where.push(`m.${k} = ?`); params.push(Number(q[k])); }
  }
  if (['preventivo', 'correctivo'].includes(q.tipo)) { where.push('m.tipo = ?'); params.push(q.tipo); }
  if (isDate(q.desde)) { where.push('m.fecha >= ?'); params.push(q.desde); }
  if (isDate(q.hasta)) { where.push('m.fecha <= ?'); params.push(q.hasta); }
  if (q.q) {
    where.push('(e.num_inventario LIKE ? OR e.marca LIKE ? OR e.modelo LIKE ? OR m.diagnostico LIKE ?)');
    params.push(...Array(4).fill(`%${q.q}%`));
  }
  return { where: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

router.get('/', ah(async (req, res) => {
  const { where, params } = buildFilters(req);
  const limit = req.query.formato === 'csv' ? null : Math.min(Number(req.query.limit) || 500, 2000);
  const rows = await loadMantenimientos(getDb(), where, params, limit);
  if (req.query.formato === 'csv') {
    res.type('text/csv').attachment(`mantenimientos-${today()}.csv`);
    return res.send(toCsv(rows, [
      { key: 'fecha', label: 'Fecha' }, { key: 'num_inventario', label: 'Inventario' },
      { label: 'Equipo', value: (r) => `${r.marca} ${r.modelo}` }, { key: 'tipo', label: 'Tipo' },
      { key: 'tecnico', label: 'Técnico' }, { key: 'falla', label: 'Falla' },
      { label: 'Actividades', value: (r) => r.actividades.map((a) => a.nombre).join(' | ') },
      { label: 'Piezas', value: (r) => r.piezas.map((p) => `${p.cantidad}x ${p.pieza}`).join(' | ') },
      { key: 'diagnostico', label: 'Diagnóstico' }, { key: 'costo_total', label: 'Costo total' },
      { key: 'estado_resultante', label: 'Estado resultante' }, { key: 'proxima_revision', label: 'Próxima revisión' },
    ]));
  }
  res.json(rows);
}));

router.get('/:id', ah(async (req, res) => {
  const [m] = await loadMantenimientos(getDb(), 'WHERE m.id = ?', [idParam(req)]);
  if (!m) throw new HttpError(404, 'Mantenimiento no encontrado');
  if (req.user.rol === 'usuario') {
    const e = await getDb().get('SELECT responsable_id FROM equipos WHERE id = ?', [m.equipo_id]);
    if (!e || e.responsable_id !== req.user.id) throw new HttpError(403, 'No tienes acceso a este registro');
  }
  res.json(m);
}));

const rules = {
  equipo_id: { required: true, type: 'int', min: 1 },
  tecnico_id: { type: 'int', min: 1 },
  solicitud_id: { type: 'int', min: 1 },
  tipo: { required: true, type: 'enum', values: ['preventivo', 'correctivo'] },
  fecha: { required: true, type: 'date' },
  falla_id: { type: 'int', min: 1 },
  diagnostico: { max: 4000 },
  observaciones: { max: 4000 },
  costo_mano_obra: { type: 'number', min: 0, default: 0 },
  estado_resultante: { required: true, type: 'enum', values: ESTADOS },
  proxima_revision: { type: 'date' },
};

function parseBody(req) {
  const d = validate(req.body, rules);
  const errors = {};
  if (d.fecha > today()) errors.fecha = 'La fecha no puede ser futura';
  if (d.proxima_revision && d.proxima_revision <= d.fecha) errors.proxima_revision = 'Debe ser posterior a la fecha del mantenimiento';
  if (d.tipo === 'correctivo' && !d.falla_id) errors.falla_id = 'Indica la falla atendida';

  const actividades = Array.isArray(req.body.actividades) ? [...new Set(req.body.actividades.map(Number))] : [];
  if (actividades.some((a) => !Number.isInteger(a) || a <= 0)) errors.actividades = 'Actividades inválidas';
  if (!actividades.length) errors.actividades = 'Selecciona al menos una actividad realizada';

  const piezas = [];
  for (const p of Array.isArray(req.body.piezas) ? req.body.piezas : []) {
    const nombre = String(p.pieza || '').trim();
    if (!nombre) continue;
    const cantidad = Number(p.cantidad || 1);
    const costo = Number(p.costo || 0);
    if (nombre.length > 120 || !Number.isInteger(cantidad) || cantidad < 1 || !Number.isFinite(costo) || costo < 0) {
      errors.piezas = 'Revisa las piezas: nombre, cantidad (entero ≥ 1) y costo (≥ 0)';
      break;
    }
    piezas.push({ pieza: nombre, cantidad, costo: Math.round(costo * 100) / 100 });
  }
  if (Object.keys(errors).length) throw new HttpError(400, 'Datos inválidos', errors);

  // Un técnico siempre registra a su nombre; el administrador puede asignar a otro técnico
  if (req.user.rol === 'tecnico' || !d.tecnico_id) d.tecnico_id = req.user.id;
  return { d, actividades, piezas };
}

async function writeDetails(t, id, actividades, piezas) {
  const marks = actividades.map(() => '?').join(',');
  const found = await t.all(`SELECT id FROM catalogo_actividades WHERE id IN (${marks})`, actividades);
  if (found.length !== actividades.length) throw new HttpError(400, 'Alguna actividad no existe', { actividades: 'Actividad inexistente' });
  for (const a of actividades) await t.run('INSERT INTO mantenimiento_actividades (mantenimiento_id, actividad_id) VALUES (?, ?)', [id, a]);
  for (const p of piezas) {
    await t.run('INSERT INTO piezas_reemplazadas (mantenimiento_id, pieza, cantidad, costo) VALUES (?, ?, ?, ?)', [id, p.pieza, p.cantidad, p.costo]);
  }
}

async function checkRefs(t, d) {
  const eq = await t.get('SELECT id FROM equipos WHERE id = ?', [d.equipo_id]);
  if (!eq) throw new HttpError(400, 'El equipo no existe', { equipo_id: 'Equipo inexistente' });
  const tec = await t.get("SELECT id FROM usuarios WHERE id = ? AND rol IN ('tecnico','admin') AND activo = 1", [d.tecnico_id]);
  if (!tec) throw new HttpError(400, 'El técnico no es válido', { tecnico_id: 'Técnico inválido' });
  if (d.solicitud_id) {
    const s = await t.get('SELECT equipo_id FROM solicitudes WHERE id = ?', [d.solicitud_id]);
    if (!s || s.equipo_id !== d.equipo_id) throw new HttpError(400, 'La solicitud no corresponde a este equipo');
  }
}

async function updateSolicitud(t, d) {
  if (!d.solicitud_id) return;
  const estado = d.estado_resultante === 'operativo' ? 'atendida' : 'en_proceso';
  await t.run("UPDATE solicitudes SET estado = ?, tecnico_id = ? WHERE id = ? AND estado <> 'rechazada'", [estado, d.tecnico_id, d.solicitud_id]);
}

router.post('/', requireRole('admin', 'tecnico'), ah(async (req, res) => {
  const { d, actividades, piezas } = parseBody(req);
  try {
    const id = await getDb().tx(async (t) => {
      await checkRefs(t, d);
      const r = await t.run(
        `INSERT INTO mantenimientos (equipo_id, tecnico_id, solicitud_id, tipo, fecha, falla_id, diagnostico, observaciones,
           costo_mano_obra, estado_resultante, proxima_revision, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [d.equipo_id, d.tecnico_id, d.solicitud_id, d.tipo, d.fecha, d.falla_id, d.diagnostico, d.observaciones,
          d.costo_mano_obra, d.estado_resultante, d.proxima_revision, now()],
      );
      await writeDetails(t, r.id, actividades, piezas);
      await updateSolicitud(t, d);
      await syncEquipo(t, d.equipo_id);
      return r.id;
    });
    res.status(201).json({ id });
  } catch (e) {
    if (isForeignKeyError(e)) throw new HttpError(400, 'Alguna referencia (falla, solicitud) no existe');
    throw e;
  }
}));

router.put('/:id', requireRole('admin', 'tecnico'), ah(async (req, res) => {
  const id = idParam(req);
  const db = getDb();
  const prev = await db.get('SELECT equipo_id, tecnico_id FROM mantenimientos WHERE id = ?', [id]);
  if (!prev) throw new HttpError(404, 'Mantenimiento no encontrado');
  if (req.user.rol === 'tecnico' && prev.tecnico_id !== req.user.id) throw new HttpError(403, 'Solo puedes editar tus propios registros');
  const { d, actividades, piezas } = parseBody(req);
  if (req.user.rol === 'tecnico') d.tecnico_id = prev.tecnico_id;
  try {
    await db.tx(async (t) => {
      await checkRefs(t, d);
      await t.run(
        `UPDATE mantenimientos SET equipo_id = ?, tecnico_id = ?, solicitud_id = ?, tipo = ?, fecha = ?, falla_id = ?, diagnostico = ?,
           observaciones = ?, costo_mano_obra = ?, estado_resultante = ?, proxima_revision = ? WHERE id = ?`,
        [d.equipo_id, d.tecnico_id, d.solicitud_id, d.tipo, d.fecha, d.falla_id, d.diagnostico, d.observaciones,
          d.costo_mano_obra, d.estado_resultante, d.proxima_revision, id],
      );
      await t.run('DELETE FROM mantenimiento_actividades WHERE mantenimiento_id = ?', [id]);
      await t.run('DELETE FROM piezas_reemplazadas WHERE mantenimiento_id = ?', [id]);
      await writeDetails(t, id, actividades, piezas);
      await updateSolicitud(t, d);
      await syncEquipo(t, d.equipo_id);
      if (prev.equipo_id !== d.equipo_id) await syncEquipo(t, prev.equipo_id);
    });
    res.json({ id });
  } catch (e) {
    if (isForeignKeyError(e)) throw new HttpError(400, 'Alguna referencia (falla, solicitud) no existe');
    throw e;
  }
}));

router.delete('/:id', requireRole('admin'), ah(async (req, res) => {
  const id = idParam(req);
  await getDb().tx(async (t) => {
    const prev = await t.get('SELECT equipo_id FROM mantenimientos WHERE id = ?', [id]);
    if (!prev) throw new HttpError(404, 'Mantenimiento no encontrado');
    await t.run('DELETE FROM mantenimientos WHERE id = ?', [id]);
    await syncEquipo(t, prev.equipo_id);
  });
  res.json({ ok: true });
}));

module.exports = router;
module.exports.loadMantenimientos = loadMantenimientos;
