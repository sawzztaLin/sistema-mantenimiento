'use strict';
/** Ubicaciones, catálogo de actividades y catálogo de fallas. */
const express = require('express');
const { getDb, isUniqueError, isForeignKeyError } = require('../db');
const { ah, validate, HttpError, idParam } = require('../utils');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const CATALOGOS = {
  ubicaciones: {
    table: 'ubicaciones',
    cols: 'id, nombre, descripcion',
    order: 'nombre',
    inUse: 'SELECT COUNT(*) AS n FROM equipos WHERE ubicacion_id = ?',
    rules: { nombre: { required: true, max: 120 }, descripcion: { max: 255 } },
  },
  actividades: {
    table: 'catalogo_actividades',
    cols: 'id, nombre, tipo, activo',
    order: 'tipo DESC, nombre',
    inUse: 'SELECT COUNT(*) AS n FROM mantenimiento_actividades WHERE actividad_id = ?',
    rules: {
      nombre: { required: true, max: 120 },
      tipo: { required: true, type: 'enum', values: ['preventivo', 'correctivo'] },
      activo: { type: 'bool', default: 1 },
    },
  },
  fallas: {
    table: 'catalogo_fallas',
    cols: 'id, nombre, categoria, activo',
    order: 'nombre',
    inUse: 'SELECT COUNT(*) AS n FROM mantenimientos WHERE falla_id = ?',
    rules: {
      nombre: { required: true, max: 120 },
      categoria: { required: true, type: 'enum', values: ['hardware', 'software', 'red', 'periferico', 'otro'] },
      activo: { type: 'bool', default: 1 },
    },
  },
};

for (const [name, c] of Object.entries(CATALOGOS)) {
  const base = `/${name}`;
  const fields = Object.keys(c.rules);

  router.get(base, ah(async (_req, res) => {
    res.json(await getDb().all(`SELECT ${c.cols} FROM ${c.table} ORDER BY ${c.order}`));
  }));

  router.post(base, requireRole('admin'), ah(async (req, res) => {
    const d = validate(req.body, c.rules);
    try {
      const r = await getDb().run(
        `INSERT INTO ${c.table} (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
        fields.map((f) => d[f]),
      );
      res.status(201).json({ id: r.id });
    } catch (e) {
      if (isUniqueError(e)) throw new HttpError(409, 'Ya existe un registro con ese nombre', { nombre: 'Nombre repetido' });
      throw e;
    }
  }));

  router.put(`${base}/:id`, requireRole('admin'), ah(async (req, res) => {
    const d = validate(req.body, c.rules);
    try {
      const r = await getDb().run(
        `UPDATE ${c.table} SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
        [...fields.map((f) => d[f]), idParam(req)],
      );
      if (!r.changes) throw new HttpError(404, 'Registro no encontrado');
      res.json({ ok: true });
    } catch (e) {
      if (isUniqueError(e)) throw new HttpError(409, 'Ya existe un registro con ese nombre', { nombre: 'Nombre repetido' });
      throw e;
    }
  }));

  router.delete(`${base}/:id`, requireRole('admin'), ah(async (req, res) => {
    const id = idParam(req);
    const used = await getDb().get(c.inUse, [id]);
    if (Number(used.n) > 0) throw new HttpError(409, 'El registro está en uso; desactívalo o edítalo en lugar de eliminarlo');
    try {
      const r = await getDb().run(`DELETE FROM ${c.table} WHERE id = ?`, [id]);
      if (!r.changes) throw new HttpError(404, 'Registro no encontrado');
      res.json({ ok: true });
    } catch (e) {
      if (isForeignKeyError(e)) throw new HttpError(409, 'El registro está en uso; desactívalo en lugar de eliminarlo');
      throw e;
    }
  }));
}

module.exports = router;
