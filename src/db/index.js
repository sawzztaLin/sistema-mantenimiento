'use strict';
/**
 * Capa de acceso a datos con la misma interfaz para SQLite y MySQL/MariaDB.
 *
 *   await db.all(sql, params)  -> filas
 *   await db.get(sql, params)  -> primera fila o undefined
 *   await db.run(sql, params)  -> { id, changes }
 *   await db.tx(async (t) => { ...t.all/t.get/t.run... })
 *
 * Todo el SQL de la aplicación usa placeholders `?` y funciones comunes a
 * ambos motores; las fechas se calculan en JS y se pasan como 'YYYY-MM-DD'.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');

function createSqlite() {
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(path.dirname(config.db.sqliteFile), { recursive: true });
  const conn = new DatabaseSync(config.db.sqliteFile);
  conn.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');

  // node:sqlite es síncrono; un candado evita que otra petición ejecute
  // consultas mientras hay una transacción abierta entre dos `await`.
  let lock = Promise.resolve();

  const norm = (params = []) => params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));
  const plain = (row) => (row ? { ...row } : row);
  const ops = {
    all: (sql, p) => conn.prepare(sql).all(...norm(p)).map(plain),
    get: (sql, p) => plain(conn.prepare(sql).get(...norm(p))),
    run: (sql, p) => {
      const r = conn.prepare(sql).run(...norm(p));
      return { id: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
  };

  const guarded = (fn) => async (sql, p) => { await lock; return fn(sql, p); };

  return {
    client: 'sqlite',
    all: guarded(ops.all),
    get: guarded(ops.get),
    run: guarded(ops.run),
    exec: async (sql) => { await lock; conn.exec(sql); },
    async tx(fn) {
      const prev = lock;
      let release;
      lock = new Promise((r) => (release = r));
      await prev;
      const t = {
        all: async (s, p) => ops.all(s, p),
        get: async (s, p) => ops.get(s, p),
        run: async (s, p) => ops.run(s, p),
      };
      try {
        conn.exec('BEGIN');
        const out = await fn(t);
        conn.exec('COMMIT');
        return out;
      } catch (e) {
        try { conn.exec('ROLLBACK'); } catch { /* ya cerrada */ }
        throw e;
      } finally {
        release();
      }
    },
    async close() { conn.close(); },
  };
}

function createMysql() {
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({
    ...config.db.mysql,
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true,       // DATE -> 'YYYY-MM-DD' (igual que SQLite)
    decimalNumbers: true,    // DECIMAL -> number
    multipleStatements: true, // solo para cargar el esquema
    charset: 'utf8mb4',
  });

  const wrap = (q) => ({
    all: async (sql, p = []) => (await q.execute(sql, p.map((v) => (v === undefined ? null : v))))[0],
    get: async (sql, p = []) => (await q.execute(sql, p.map((v) => (v === undefined ? null : v))))[0][0],
    run: async (sql, p = []) => {
      const [r] = await q.execute(sql, p.map((v) => (v === undefined ? null : v)));
      return { id: r.insertId, changes: r.affectedRows };
    },
  });

  return {
    client: 'mysql',
    ...wrap(pool),
    exec: async (sql) => { await pool.query(sql); },
    async tx(fn) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const out = await fn(wrap(conn));
        await conn.commit();
        return out;
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    },
    async close() { await pool.end(); },
  };
}

let instance;
function getDb() {
  if (!instance) {
    if (config.db.client === 'mysql') instance = createMysql();
    else if (config.db.client === 'sqlite') instance = createSqlite();
    else throw new Error(`DB_CLIENT no soportado: ${config.db.client}`);
  }
  return instance;
}

/** Detecta violaciones de UNIQUE en ambos motores. */
function isUniqueError(e) {
  return e && (e.code === 'ER_DUP_ENTRY' || /UNIQUE constraint failed/i.test(e.message || ''));
}
/** Detecta violaciones de llave foránea en ambos motores. */
function isForeignKeyError(e) {
  return e && (/ER_ROW_IS_REFERENCED|ER_NO_REFERENCED_ROW/.test(e.code || '') || /FOREIGN KEY constraint failed/i.test(e.message || ''));
}

module.exports = { getDb, isUniqueError, isForeignKeyError };
