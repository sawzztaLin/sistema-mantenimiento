'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Base de datos SQLite temporal y aislada para las pruebas
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mant-test-'));
process.env.DB_CLIENT = 'sqlite';
process.env.SQLITE_FILE = path.join(tmp, 'test.db');

const { createApp } = require('../src/app');
const { ensureSchema } = require('../src/db/init');
const { getDb } = require('../src/db');
const { today, addDays, addMonths } = require('../src/utils');

let server;
let base;

before(async () => {
  await ensureSchema({ demo: true, log: () => {} });
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  server.close();
  await getDb().close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Cliente con cookie de sesión propia. */
function client() {
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.text(), headers: res.headers };
  };
  return {
    get: (u) => call('GET', u),
    post: (u, b) => call('POST', u, b || {}),
    put: (u, b) => call('PUT', u, b || {}),
    del: (u) => call('DELETE', u, {}),
    login: (email, password) => call('POST', '/auth/login', { email, password }),
  };
}

const admin = client();
const tecnico = client();
const usuario = client();

test('login: credenciales incorrectas y correctas', async () => {
  const bad = await client().login('admin@mantenimiento.local', 'nope');
  assert.equal(bad.status, 401);
  assert.equal((await admin.login('admin@mantenimiento.local', 'admin123')).status, 200);
  assert.equal((await tecnico.login('carlos@mantenimiento.local', 'demo1234')).status, 200);
  const u = await usuario.login('maria@mantenimiento.local', 'demo1234');
  assert.equal(u.status, 200);
  assert.equal(u.body.user.rol, 'usuario');
});

test('sin sesión la API responde 401', async () => {
  assert.equal((await client().get('/equipos')).status, 401);
});

test('peticiones que modifican datos exigen JSON (protección CSRF)', async () => {
  const res = await fetch(base + '/auth/login', { method: 'POST', body: 'email=x', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(res.status, 415);
});

test('usuario solo ve sus equipos y no puede crear equipos ni ver reportes', async () => {
  const me = (await usuario.get('/auth/me')).body.user;
  const eqs = (await usuario.get('/equipos')).body;
  assert.ok(eqs.length > 0);
  assert.ok(eqs.every((e) => e.responsable_id === me.id));
  assert.equal((await usuario.post('/equipos', { num_inventario: 'X', tipo: 'pc', marca: 'a', modelo: 'b' })).status, 403);
  assert.equal((await usuario.get('/reportes/fallas')).status, 403);
  const ajeno = (await admin.get('/equipos')).body.find((e) => e.responsable_id !== me.id);
  assert.equal((await usuario.get(`/equipos/${ajeno.id}`)).status, 403);
});

let equipoId;
test('alta de equipo con validación y número de inventario único', async () => {
  const invalid = await admin.post('/equipos', { tipo: 'tostadora' });
  assert.equal(invalid.status, 400);
  assert.ok(invalid.body.details.num_inventario);
  assert.ok(invalid.body.details.tipo);

  const ok = await tecnico.post('/equipos', {
    num_inventario: 'TEST-001', tipo: 'pc', marca: 'Dell', modelo: 'OptiPlex', intervalo_meses: 6, proxima_revision: today(),
  });
  assert.equal(ok.status, 201);
  equipoId = ok.body.id;

  const dup = await admin.post('/equipos', { num_inventario: 'TEST-001', tipo: 'pc', marca: 'x', modelo: 'y' });
  assert.equal(dup.status, 409);
});

test('registrar mantenimiento actualiza estado y próxima revisión del equipo', async () => {
  const acts = (await admin.get('/catalogos/actividades')).body;
  const fallas = (await admin.get('/catalogos/fallas')).body;
  const corr = acts.filter((a) => a.tipo === 'correctivo').map((a) => a.id);

  const sinFalla = await tecnico.post('/mantenimientos', {
    equipo_id: equipoId, tipo: 'correctivo', fecha: today(), estado_resultante: 'operativo', actividades: [corr[0]],
  });
  assert.equal(sinFalla.status, 400);
  assert.ok(sinFalla.body.details.falla_id);

  const futura = await tecnico.post('/mantenimientos', {
    equipo_id: equipoId, tipo: 'preventivo', fecha: addDays(today(), 3), estado_resultante: 'operativo', actividades: [acts[0].id],
  });
  assert.equal(futura.status, 400);

  const prox = addMonths(today(), 6);
  const r = await tecnico.post('/mantenimientos', {
    equipo_id: equipoId, tipo: 'correctivo', fecha: today(), falla_id: fallas[0].id,
    diagnostico: 'Disco con sectores dañados', estado_resultante: 'en_reparacion', proxima_revision: prox,
    costo_mano_obra: 200, actividades: [corr[0], corr[1]], piezas: [{ pieza: 'SSD 480 GB', cantidad: 1, costo: 650 }],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));

  const eq = (await admin.get(`/equipos/${equipoId}`)).body;
  assert.equal(eq.estado, 'en_reparacion');
  assert.equal(eq.proxima_revision, prox);
  assert.equal(eq.historial.length, 1);
  assert.equal(eq.historial[0].actividades.length, 2);
  assert.equal(eq.historial[0].costo_total, 850);
  assert.equal(eq.resumen.correctivos, 1);

  // Un mantenimiento anterior no sobrescribe el estado actual
  const viejo = await admin.post('/mantenimientos', {
    equipo_id: equipoId, tipo: 'preventivo', fecha: addDays(today(), -60), estado_resultante: 'operativo', actividades: [acts[0].id],
  });
  assert.equal(viejo.status, 201);
  assert.equal((await admin.get(`/equipos/${equipoId}`)).body.estado, 'en_reparacion');

  // Al borrar el más reciente, el equipo toma el estado del anterior
  assert.equal((await admin.del(`/mantenimientos/${r.body.id}`)).status, 200);
  assert.equal((await admin.get(`/equipos/${equipoId}`)).body.estado, 'operativo');

  // No se puede borrar un equipo con historial
  assert.equal((await admin.del(`/equipos/${equipoId}`)).status, 409);
});

test('técnico no puede editar mantenimientos de otro técnico', async () => {
  const ajeno = (await admin.get('/mantenimientos?limit=200')).body.find((m) => m.tecnico !== 'Carlos Méndez');
  const res = await tecnico.put(`/mantenimientos/${ajeno.id}`, {
    equipo_id: ajeno.equipo_id, tipo: ajeno.tipo, fecha: ajeno.fecha, falla_id: ajeno.falla_id,
    estado_resultante: 'operativo', actividades: ajeno.actividades.map((a) => a.id),
  });
  assert.equal(res.status, 403);
});

test('flujo de solicitud: usuario reporta, técnico atiende con mantenimiento', async () => {
  const eq = (await usuario.get('/equipos')).body[0];
  const s = await usuario.post('/solicitudes', { equipo_id: eq.id, descripcion: 'No enciende el monitor', prioridad: 'alta' });
  assert.equal(s.status, 201);

  assert.equal((await tecnico.put(`/solicitudes/${s.body.id}`, { estado: 'en_proceso' })).status, 200);
  assert.equal((await usuario.get(`/solicitudes/${s.body.id}`)).body.tecnico, 'Carlos Méndez');

  const acts = (await admin.get('/catalogos/actividades')).body;
  const fallas = (await admin.get('/catalogos/fallas')).body;
  const m = await tecnico.post('/mantenimientos', {
    equipo_id: eq.id, solicitud_id: s.body.id, tipo: 'correctivo', fecha: today(), falla_id: fallas[0].id,
    estado_resultante: 'operativo', actividades: [acts.find((a) => a.tipo === 'correctivo').id],
  });
  assert.equal(m.status, 201, JSON.stringify(m.body));
  assert.equal((await usuario.get(`/solicitudes/${s.body.id}`)).body.estado, 'atendida');
});

test('reportes y exportación CSV', async () => {
  const dash = (await admin.get('/reportes/dashboard')).body;
  assert.equal(dash.serie.length, 12);
  assert.ok(dash.kpis.equipos > 0);

  const fallas = (await admin.get('/reportes/fallas')).body;
  assert.ok(fallas.fallas.length > 0);
  assert.ok(fallas.fallas[0].total >= fallas.fallas.at(-1).total);

  const pend = (await tecnico.get('/reportes/pendientes?dias=30')).body;
  assert.ok(pend.equipos.every((e) => e.motivo.length > 0));

  const csv = await admin.get('/mantenimientos?formato=csv');
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.body, /Fecha,Inventario/);
});

test('administración de usuarios y catálogos', async () => {
  assert.equal((await tecnico.get('/usuarios')).status, 403);
  const nuevo = await admin.post('/usuarios', { nombre: 'Técnico Nuevo', email: 'nuevo@x.com', rol: 'tecnico', password: 'segura123' });
  assert.equal(nuevo.status, 201);
  assert.equal((await admin.post('/usuarios', { nombre: 'X', email: 'nuevo@x.com', rol: 'tecnico', password: 'segura123' })).status, 409);
  assert.equal((await client().login('nuevo@x.com', 'segura123')).status, 200);

  const me = (await admin.get('/auth/me')).body.user;
  const self = await admin.put(`/usuarios/${me.id}`, { nombre: 'A', email: me.email, rol: 'usuario' });
  assert.equal(self.status, 400);

  const usada = (await admin.get('/catalogos/fallas')).body[0];
  assert.equal((await admin.del(`/catalogos/fallas/${usada.id}`)).status, 409);
  const f = await admin.post('/catalogos/fallas', { nombre: 'Teclado dañado', categoria: 'periferico' });
  assert.equal(f.status, 201);
  assert.equal((await admin.del(`/catalogos/fallas/${f.body.id}`)).status, 200);
});
