'use strict';
/** Solicitudes de servicio: el usuario responsable reporta una falla de su equipo. */
const express = require('express');
const { getDb } = require('../db');
const { ah, validate, HttpError, idParam, today } = require('../utils');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
const ESTADOS = ['pendiente', 'en_proceso', 'atendida', 'rechazada'];

const SELECT = `
  SELECT s.*, e.num_inventario, e.marca, e.modelo, e.tipo AS equipo_tipo, ub.nombre AS ubicacion,
         u.nombre AS solicitante, t.nombre AS tecnico
    FROM solicitudes s
    JOIN equipos e ON e.id = s.equipo_id
    JOIN usuarios u ON u.id = s.solicitante_id
    LEFT JOIN usuarios t ON t.id = s.tecnico_id
    LEFT JOIN ubicaciones ub ON ub.id = e.ubicacion_id`;

router.get('/', ah(async (req, res) => {
  const where = [];
  const params = [];
  if (req.user.rol === 'usuario') { where.push('s.solicitante_id = ?'); params.push(req.user.id); }
  if (ESTADOS.includes(req.query.estado)) { where.push('s.estado = ?'); params.push(req.query.estado); }
  if (req.query.estado === 'abiertas') where.push("s.estado IN ('pendiente','en_proceso')");
  if (Number(req.query.equipo_id) > 0) { where.push('s.equipo_id = ?'); params.push(Number(req.query.equipo_id)); }
  const rows = await getDb().all(
    `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY CASE s.estado WHEN 'pendiente' THEN 0 WHEN 'en_proceso' THEN 1 ELSE 2 END,
              CASE s.prioridad WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, s.fecha DESC, s.id DESC`,
    params,
  );
  res.json(rows);
}));

router.get('/:id', ah(async (req, res) => {
  const s = await getDb().get(`${SELECT} WHERE s.id = ?`, [idParam(req)]);
  if (!s) throw new HttpError(404, 'Solicitud no encontrada');
  if (req.user.rol === 'usuario' && s.solicitante_id !== req.user.id) throw new HttpError(403, 'No tienes acceso a esta solicitud');
  res.json(s);
}));

router.post('/', ah(async (req, res) => {
  const d = validate(req.body, {
    equipo_id: { required: true, type: 'int', min: 1 },
    descripcion: { required: true, min: 5, max: 2000 },
    prioridad: { type: 'enum', values: ['baja', 'media', 'alta'], default: 'media' },
  });
  const db = getDb();
  const eq = await db.get('SELECT id, responsable_id FROM equipos WHERE id = ?', [d.equipo_id]);
  if (!eq) throw new HttpError(400, 'El equipo no existe', { equipo_id: 'Equipo inexistente' });
  if (req.user.rol === 'usuario' && eq.responsable_id !== req.user.id) {
    throw new HttpError(403, 'Solo puedes reportar fallas de los equipos a tu cargo');
  }
  const r = await db.run(
    "INSERT INTO solicitudes (equipo_id, solicitante_id, descripcion, prioridad, estado, fecha) VALUES (?, ?, ?, ?, 'pendiente', ?)",
    [d.equipo_id, req.user.id, d.descripcion, d.prioridad, today()],
  );
  res.status(201).json({ id: r.id });
}));

/** Técnicos y administradores asignan, cambian estado o rechazan. */
router.put('/:id', requireRole('admin', 'tecnico'), ah(async (req, res) => {
  const id = idParam(req);
  const d = validate(req.body, {
    estado: { required: true, type: 'enum', values: ESTADOS },
    tecnico_id: { type: 'int', min: 1 },
    prioridad: { type: 'enum', values: ['baja', 'media', 'alta'] },
    comentario: { max: 2000 },
  });
  const db = getDb();
  const s = await db.get('SELECT id, prioridad FROM solicitudes WHERE id = ?', [id]);
  if (!s) throw new HttpError(404, 'Solicitud no encontrada');
  if (d.estado === 'en_proceso' && !d.tecnico_id) d.tecnico_id = req.user.id;
  if (d.tecnico_id) {
    const t = await db.get("SELECT id FROM usuarios WHERE id = ? AND rol IN ('tecnico','admin') AND activo = 1", [d.tecnico_id]);
    if (!t) throw new HttpError(400, 'El técnico no es válido', { tecnico_id: 'Técnico inválido' });
  }
  await db.run(
    'UPDATE solicitudes SET estado = ?, tecnico_id = ?, prioridad = ?, comentario = ? WHERE id = ?',
    [d.estado, d.tecnico_id, d.prioridad || s.prioridad, d.comentario, id],
  );
  res.json({ ok: true });
}));

module.exports = router;
