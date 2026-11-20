'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb, isUniqueError } = require('../db');
const { ah, validate, HttpError, idParam, now } = require('../utils');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
const ROLES = ['admin', 'tecnico', 'usuario'];
const COLS = 'id, nombre, email, rol, telefono, especialidad, activo, creado_en';

const rules = {
  nombre: { required: true, max: 120 },
  email: { required: true, type: 'email' },
  rol: { required: true, type: 'enum', values: ROLES },
  telefono: { max: 30 },
  especialidad: { max: 120 },
  activo: { type: 'bool', default: 1 },
};

/** Lista ligera para selectores (responsables, técnicos). Disponible para técnicos y admin. */
router.get('/opciones', requireRole('admin', 'tecnico'), ah(async (req, res) => {
  const params = [];
  let where = 'WHERE activo = 1';
  if (req.query.rol && ROLES.includes(req.query.rol)) { where += ' AND rol = ?'; params.push(req.query.rol); }
  res.json(await getDb().all(`SELECT id, nombre, rol FROM usuarios ${where} ORDER BY nombre`, params));
}));

/** Técnicos con su carga de trabajo (módulo de técnicos). */
router.get('/tecnicos', requireRole('admin', 'tecnico'), ah(async (_req, res) => {
  const rows = await getDb().all(`
    SELECT u.id, u.nombre, u.email, u.telefono, u.especialidad, u.activo,
           COUNT(m.id) AS total_mantenimientos,
           SUM(CASE WHEN m.tipo = 'preventivo' THEN 1 ELSE 0 END) AS preventivos,
           SUM(CASE WHEN m.tipo = 'correctivo' THEN 1 ELSE 0 END) AS correctivos,
           MAX(m.fecha) AS ultimo_mantenimiento,
           (SELECT COUNT(*) FROM solicitudes s WHERE s.tecnico_id = u.id AND s.estado = 'en_proceso') AS solicitudes_en_proceso
      FROM usuarios u
      LEFT JOIN mantenimientos m ON m.tecnico_id = u.id
     WHERE u.rol = 'tecnico'
     GROUP BY u.id, u.nombre, u.email, u.telefono, u.especialidad, u.activo
     ORDER BY u.activo DESC, u.nombre`);
  res.json(rows.map((r) => ({ ...r, preventivos: Number(r.preventivos || 0), correctivos: Number(r.correctivos || 0) })));
}));

router.use(requireRole('admin'));

router.get('/', ah(async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.rol && ROLES.includes(req.query.rol)) { where.push('rol = ?'); params.push(req.query.rol); }
  if (req.query.q) { where.push('(nombre LIKE ? OR email LIKE ?)'); params.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  const sql = `SELECT ${COLS} FROM usuarios ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY activo DESC, nombre`;
  res.json(await getDb().all(sql, params));
}));

router.get('/:id', ah(async (req, res) => {
  const u = await getDb().get(`SELECT ${COLS} FROM usuarios WHERE id = ?`, [idParam(req)]);
  if (!u) throw new HttpError(404, 'Usuario no encontrado');
  res.json(u);
}));

router.post('/', ah(async (req, res) => {
  const data = validate(req.body, { ...rules, password: { required: true, min: 8, max: 200 } });
  try {
    const r = await getDb().run(
      'INSERT INTO usuarios (nombre, email, password_hash, rol, telefono, especialidad, activo, creado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [data.nombre, data.email, await bcrypt.hash(data.password, 10), data.rol, data.telefono, data.especialidad, data.activo, now()],
    );
    res.status(201).json({ id: r.id });
  } catch (e) {
    if (isUniqueError(e)) throw new HttpError(409, 'Ya existe un usuario con ese correo', { email: 'Correo ya registrado' });
    throw e;
  }
}));

router.put('/:id', ah(async (req, res) => {
  const id = idParam(req);
  const data = validate(req.body, { ...rules, password: { min: 8, max: 200 } });
  if (id === req.user.id && (data.rol !== 'admin' || !data.activo)) {
    throw new HttpError(400, 'No puedes quitarte el rol de administrador ni desactivar tu propia cuenta');
  }
  const db = getDb();
  try {
    const r = await db.run(
      'UPDATE usuarios SET nombre = ?, email = ?, rol = ?, telefono = ?, especialidad = ?, activo = ? WHERE id = ?',
      [data.nombre, data.email, data.rol, data.telefono, data.especialidad, data.activo, id],
    );
    if (!r.changes) throw new HttpError(404, 'Usuario no encontrado');
  } catch (e) {
    if (isUniqueError(e)) throw new HttpError(409, 'Ya existe un usuario con ese correo', { email: 'Correo ya registrado' });
    throw e;
  }
  if (data.password) await db.run('UPDATE usuarios SET password_hash = ? WHERE id = ?', [await bcrypt.hash(data.password, 10), id]);
  res.json({ ok: true });
}));

module.exports = router;
