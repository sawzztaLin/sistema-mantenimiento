'use strict';

/** Fecha local 'YYYY-MM-DD'. */
function today(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Marca de tiempo local 'YYYY-MM-DD HH:MM:SS' (válida en SQLite y MySQL). */
function now(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${today(d)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(dateStr, days) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return today(d);
}

function addMonths(dateStr, months) {
  const d = parseDate(dateStr);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return today(d);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = parseDate(s);
  return today(d) === s;
}

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/**
 * Validador mínimo de cuerpos de petición.
 * rules: { campo: { required, type: 'string'|'int'|'number'|'date'|'enum'|'bool', values, max, min } }
 * Devuelve un objeto solo con los campos declarados y normalizados.
 */
function validate(body, rules, { partial = false } = {}) {
  const out = {};
  const errors = {};
  body = body || {};
  for (const [key, r] of Object.entries(rules)) {
    let v = body[key];
    if (typeof v === 'string') v = v.trim();
    const empty = v === undefined || v === null || v === '';
    if (empty) {
      if (r.required && !(partial && v === undefined)) errors[key] = 'Campo obligatorio';
      else if (!(partial && v === undefined)) out[key] = r.default !== undefined ? r.default : null;
      continue;
    }
    switch (r.type) {
      case 'int': {
        const n = Number(v);
        if (!Number.isInteger(n)) { errors[key] = 'Debe ser un número entero'; continue; }
        if (r.min !== undefined && n < r.min) { errors[key] = `Mínimo ${r.min}`; continue; }
        if (r.max !== undefined && n > r.max) { errors[key] = `Máximo ${r.max}`; continue; }
        out[key] = n; break;
      }
      case 'number': {
        const n = Number(v);
        if (!Number.isFinite(n)) { errors[key] = 'Debe ser un número'; continue; }
        if (r.min !== undefined && n < r.min) { errors[key] = `Mínimo ${r.min}`; continue; }
        out[key] = Math.round(n * 100) / 100; break;
      }
      case 'date':
        if (!isDate(v)) { errors[key] = 'Fecha inválida (AAAA-MM-DD)'; continue; }
        out[key] = v; break;
      case 'enum':
        if (!r.values.includes(v)) { errors[key] = 'Valor no permitido'; continue; }
        out[key] = v; break;
      case 'bool':
        out[key] = v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0; break;
      case 'email':
        if (typeof v !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > 160) { errors[key] = 'Correo inválido'; continue; }
        out[key] = v.toLowerCase(); break;
      default:
        if (typeof v !== 'string') v = String(v);
        if (r.max && v.length > r.max) { errors[key] = `Máximo ${r.max} caracteres`; continue; }
        if (r.min && v.length < r.min) { errors[key] = `Mínimo ${r.min} caracteres`; continue; }
        out[key] = v;
    }
  }
  if (Object.keys(errors).length) throw new HttpError(400, 'Datos inválidos', errors);
  return out;
}

/** Convierte filas a CSV (con BOM para que Excel respete los acentos). */
function toCsv(rows, columns) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // evita inyección de fórmulas en hojas de cálculo
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(','));
  return '﻿' + [head, ...body].join('\r\n');
}

/** Envuelve handlers async para que los errores lleguen al middleware de errores. */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const idParam = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identificador inválido');
  return id;
};

module.exports = { today, now, addDays, addMonths, isDate, validate, toCsv, HttpError, ah, idParam };
