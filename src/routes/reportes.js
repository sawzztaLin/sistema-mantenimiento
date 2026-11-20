'use strict';
const express = require('express');
const { getDb } = require('../db');
const { ah, today, addDays, addMonths, isDate, toCsv } = require('../utils');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

/** Rango de fechas de la consulta; por defecto los últimos 12 meses. */
function rango(q) {
  const hasta = isDate(q.hasta) ? q.hasta : today();
  const desde = isDate(q.desde) ? q.desde : addMonths(hasta, -12);
  return { desde, hasta };
}

/** Panel principal. Para el rol "usuario" se limita a sus equipos. */
router.get('/dashboard', ah(async (req, res) => {
  const db = getDb();
  const hoy = today();
  const own = req.user.rol === 'usuario';
  const eqWhere = own ? 'AND e.responsable_id = ?' : '';
  const eqP = own ? [req.user.id] : [];

  const estados = await db.all(
    `SELECT e.estado, COUNT(*) AS total FROM equipos e WHERE e.estado <> 'baja' ${eqWhere} GROUP BY e.estado`, eqP);
  const porEstado = Object.fromEntries(estados.map((r) => [r.estado, Number(r.total)]));
  const count = async (sql, p) => Number((await db.get(sql, p)).n);

  const kpis = {
    equipos: Object.values(porEstado).reduce((a, b) => a + b, 0),
    operativos: porEstado.operativo || 0,
    en_reparacion: porEstado.en_reparacion || 0,
    fuera_servicio: porEstado.fuera_servicio || 0,
    vencidos: await count(`SELECT COUNT(*) AS n FROM equipos e WHERE e.estado <> 'baja' AND e.proxima_revision < ? ${eqWhere}`, [hoy, ...eqP]),
    proximos: await count(`SELECT COUNT(*) AS n FROM equipos e WHERE e.estado <> 'baja' AND e.proxima_revision >= ? AND e.proxima_revision <= ? ${eqWhere}`, [hoy, addDays(hoy, 7), ...eqP]),
    solicitudes_abiertas: await count(
      `SELECT COUNT(*) AS n FROM solicitudes s WHERE s.estado IN ('pendiente','en_proceso') ${own ? 'AND s.solicitante_id = ?' : ''}`, eqP),
    mantenimientos_mes: await count(
      `SELECT COUNT(*) AS n FROM mantenimientos m JOIN equipos e ON e.id = m.equipo_id WHERE m.fecha >= ? ${eqWhere}`, [hoy.slice(0, 8) + '01', ...eqP]),
  };

  const agenda = await db.all(
    `SELECT e.id, e.num_inventario, e.marca, e.modelo, e.tipo, e.proxima_revision, ub.nombre AS ubicacion
       FROM equipos e LEFT JOIN ubicaciones ub ON ub.id = e.ubicacion_id
      WHERE e.estado <> 'baja' AND e.proxima_revision IS NOT NULL AND e.proxima_revision <= ? ${eqWhere}
      ORDER BY e.proxima_revision LIMIT 10`, [addDays(hoy, 30), ...eqP]);

  const recientes = await db.all(
    `SELECT m.id, m.fecha, m.tipo, m.estado_resultante, e.id AS equipo_id, e.num_inventario, e.marca, e.modelo,
            t.nombre AS tecnico, f.nombre AS falla
       FROM mantenimientos m JOIN equipos e ON e.id = m.equipo_id JOIN usuarios t ON t.id = m.tecnico_id
       LEFT JOIN catalogo_fallas f ON f.id = m.falla_id
      WHERE 1 = 1 ${eqWhere} ORDER BY m.fecha DESC, m.id DESC LIMIT 6`, eqP);

  const desde = addMonths(hoy.slice(0, 8) + '01', -11);
  const meses = await db.all(
    `SELECT substr(m.fecha, 1, 7) AS mes,
            SUM(CASE WHEN m.tipo = 'preventivo' THEN 1 ELSE 0 END) AS preventivos,
            SUM(CASE WHEN m.tipo = 'correctivo' THEN 1 ELSE 0 END) AS correctivos
       FROM mantenimientos m JOIN equipos e ON e.id = m.equipo_id
      WHERE m.fecha >= ? ${eqWhere} GROUP BY substr(m.fecha, 1, 7) ORDER BY mes`, [desde, ...eqP]);
  // Rellena meses sin actividad para que la gráfica sea continua
  const serie = [];
  for (let i = 0; i < 12; i++) {
    const mes = addMonths(desde, i).slice(0, 7);
    const r = meses.find((x) => x.mes === mes);
    serie.push({ mes, preventivos: Number(r?.preventivos || 0), correctivos: Number(r?.correctivos || 0) });
  }

  res.json({ kpis, porEstado, agenda, recientes, serie });
}));

router.use(requireRole('admin', 'tecnico'));

/** Equipos que necesitan mantenimiento: revisión vencida o dentro de N días, o equipos con falla. */
router.get('/pendientes', ah(async (req, res) => {
  const dias = Math.min(Math.max(Number(req.query.dias) || 30, 1), 365);
  const hoy = today();
  const rows = await getDb().all(
    `SELECT e.id, e.num_inventario, e.tipo, e.marca, e.modelo, e.estado, e.proxima_revision,
            ub.nombre AS ubicacion, u.nombre AS responsable,
            (SELECT MAX(m.fecha) FROM mantenimientos m WHERE m.equipo_id = e.id) AS ultimo_mantenimiento,
            (SELECT COUNT(*) FROM solicitudes s WHERE s.equipo_id = e.id AND s.estado IN ('pendiente','en_proceso')) AS solicitudes_abiertas
       FROM equipos e
       LEFT JOIN ubicaciones ub ON ub.id = e.ubicacion_id
       LEFT JOIN usuarios u ON u.id = e.responsable_id
      WHERE e.estado <> 'baja'
        AND (e.proxima_revision IS NULL OR e.proxima_revision <= ? OR e.estado IN ('en_reparacion','fuera_servicio')
             OR EXISTS (SELECT 1 FROM solicitudes s WHERE s.equipo_id = e.id AND s.estado IN ('pendiente','en_proceso')))
      ORDER BY CASE WHEN e.proxima_revision IS NULL THEN 1 ELSE 0 END, e.proxima_revision`,
    [addDays(hoy, dias)],
  );
  for (const r of rows) {
    r.motivo = [];
    if (r.estado === 'en_reparacion') r.motivo.push('En reparación');
    if (r.estado === 'fuera_servicio') r.motivo.push('Fuera de servicio');
    if (Number(r.solicitudes_abiertas) > 0) r.motivo.push('Solicitud abierta');
    if (!r.proxima_revision) r.motivo.push('Sin revisión programada');
    else if (r.proxima_revision < hoy) r.motivo.push('Revisión vencida');
    else if (r.proxima_revision <= addDays(hoy, dias)) r.motivo.push('Revisión próxima');
    r.dias_restantes = r.proxima_revision
      ? Math.round((new Date(r.proxima_revision) - new Date(hoy)) / 86400000)
      : null;
  }
  if (req.query.formato === 'csv') {
    res.type('text/csv').attachment(`equipos-pendientes-${hoy}.csv`);
    return res.send(toCsv(rows, [
      { key: 'num_inventario', label: 'Inventario' }, { label: 'Equipo', value: (r) => `${r.marca} ${r.modelo}` },
      { key: 'tipo', label: 'Tipo' }, { key: 'ubicacion', label: 'Ubicación' }, { key: 'responsable', label: 'Responsable' },
      { key: 'estado', label: 'Estado' }, { key: 'ultimo_mantenimiento', label: 'Último mantenimiento' },
      { key: 'proxima_revision', label: 'Próxima revisión' }, { key: 'dias_restantes', label: 'Días restantes' },
      { label: 'Motivo', value: (r) => r.motivo.join(', ') },
    ]));
  }
  res.json({ dias, equipos: rows });
}));

/** Fallas más comunes en el periodo. */
router.get('/fallas', ah(async (req, res) => {
  const { desde, hasta } = rango(req.query);
  const db = getDb();
  const fallas = await db.all(
    `SELECT f.id, f.nombre, f.categoria, COUNT(*) AS total, COUNT(DISTINCT m.equipo_id) AS equipos_afectados, MAX(m.fecha) AS ultima
       FROM mantenimientos m JOIN catalogo_fallas f ON f.id = m.falla_id
      WHERE m.fecha >= ? AND m.fecha <= ?
      GROUP BY f.id, f.nombre, f.categoria ORDER BY total DESC, f.nombre`, [desde, hasta]);
  const porCategoria = await db.all(
    `SELECT f.categoria, COUNT(*) AS total FROM mantenimientos m JOIN catalogo_fallas f ON f.id = m.falla_id
      WHERE m.fecha >= ? AND m.fecha <= ? GROUP BY f.categoria ORDER BY total DESC`, [desde, hasta]);
  const porTipoEquipo = await db.all(
    `SELECT e.tipo, COUNT(*) AS total FROM mantenimientos m JOIN equipos e ON e.id = m.equipo_id
      WHERE m.falla_id IS NOT NULL AND m.fecha >= ? AND m.fecha <= ? GROUP BY e.tipo ORDER BY total DESC`, [desde, hasta]);
  const reincidentes = await db.all(
    `SELECT e.id, e.num_inventario, e.marca, e.modelo, COUNT(*) AS fallas
       FROM mantenimientos m JOIN equipos e ON e.id = m.equipo_id
      WHERE m.falla_id IS NOT NULL AND m.fecha >= ? AND m.fecha <= ?
      GROUP BY e.id, e.num_inventario, e.marca, e.modelo HAVING COUNT(*) >= 2 ORDER BY fallas DESC, e.num_inventario`, [desde, hasta]);
  const total = fallas.reduce((s, f) => s + Number(f.total), 0);
  for (const f of fallas) { f.total = Number(f.total); f.porcentaje = total ? Math.round((f.total / total) * 1000) / 10 : 0; }

  if (req.query.formato === 'csv') {
    res.type('text/csv').attachment(`fallas-${desde}_${hasta}.csv`);
    return res.send(toCsv(fallas, [
      { key: 'nombre', label: 'Falla' }, { key: 'categoria', label: 'Categoría' }, { key: 'total', label: 'Ocurrencias' },
      { key: 'porcentaje', label: '%' }, { key: 'equipos_afectados', label: 'Equipos afectados' }, { key: 'ultima', label: 'Última vez' },
    ]));
  }
  res.json({ desde, hasta, total, fallas, porCategoria, porTipoEquipo, reincidentes });
}));

/** Resumen de trabajos realizados en el periodo (el detalle viene de /api/mantenimientos). */
router.get('/trabajos', ah(async (req, res) => {
  const { desde, hasta } = rango(req.query);
  const db = getDb();
  const p = [desde, hasta];
  const resumen = await db.get(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN tipo = 'preventivo' THEN 1 ELSE 0 END) AS preventivos,
            SUM(CASE WHEN tipo = 'correctivo' THEN 1 ELSE 0 END) AS correctivos,
            COUNT(DISTINCT equipo_id) AS equipos_atendidos,
            SUM(costo_mano_obra) AS mano_obra
       FROM mantenimientos WHERE fecha >= ? AND fecha <= ?`, p);
  const piezas = await db.get(
    `SELECT COALESCE(SUM(pr.costo * pr.cantidad), 0) AS costo, COALESCE(SUM(pr.cantidad), 0) AS cantidad
       FROM piezas_reemplazadas pr JOIN mantenimientos m ON m.id = pr.mantenimiento_id
      WHERE m.fecha >= ? AND m.fecha <= ?`, p);
  const porTecnico = await db.all(
    `SELECT t.id, t.nombre, COUNT(*) AS total,
            SUM(CASE WHEN m.tipo = 'preventivo' THEN 1 ELSE 0 END) AS preventivos,
            SUM(CASE WHEN m.tipo = 'correctivo' THEN 1 ELSE 0 END) AS correctivos
       FROM mantenimientos m JOIN usuarios t ON t.id = m.tecnico_id
      WHERE m.fecha >= ? AND m.fecha <= ? GROUP BY t.id, t.nombre ORDER BY total DESC`, p);
  const actividades = await db.all(
    `SELECT a.nombre, a.tipo, COUNT(*) AS total
       FROM mantenimiento_actividades ma JOIN catalogo_actividades a ON a.id = ma.actividad_id
       JOIN mantenimientos m ON m.id = ma.mantenimiento_id
      WHERE m.fecha >= ? AND m.fecha <= ? GROUP BY a.id, a.nombre, a.tipo ORDER BY total DESC LIMIT 10`, p);
  const num = (v) => Number(v || 0);
  res.json({
    desde, hasta,
    resumen: {
      total: num(resumen.total), preventivos: num(resumen.preventivos), correctivos: num(resumen.correctivos),
      equipos_atendidos: num(resumen.equipos_atendidos), costo_mano_obra: num(resumen.mano_obra),
      costo_piezas: num(piezas.costo), piezas: num(piezas.cantidad),
      costo_total: num(resumen.mano_obra) + num(piezas.costo),
    },
    porTecnico: porTecnico.map((r) => ({ ...r, total: num(r.total), preventivos: num(r.preventivos), correctivos: num(r.correctivos) })),
    actividades: actividades.map((r) => ({ ...r, total: num(r.total) })),
  });
}));

module.exports = router;
