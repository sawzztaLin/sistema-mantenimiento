// Utilidades de interfaz: plantillas seguras, formatos, etiquetas, modales y avisos.

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s ?? ''));

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function render(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

/** Plantilla que escapa todo lo interpolado salvo lo marcado con raw() u otra plantilla html``. */
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new Raw(out);
}

export function mount(el, tpl) { el.innerHTML = render(tpl); return el; }
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- Formatos ----------
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function fecha(s) {
  if (!s) return '—';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  return `${d}/${MESES[Number(m) - 1]}/${y}`;
}
export function mesCorto(ym) {
  const [y, m] = ym.split('-');
  return `${MESES[Number(m) - 1]} ${y.slice(2)}`;
}
const moneyFmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
export const dinero = (n) => moneyFmt.format(Number(n || 0));
export function hoy(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function sumarMeses(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1 + n, 1);
  const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  dt.setDate(Math.min(d, last));
  return hoy(dt);
}
export function diasHasta(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d) - t) / 86400000);
}

// ---------- Etiquetas ----------
export const TIPOS_EQUIPO = {
  pc: { label: 'Computadora', icon: 'fa-desktop' },
  laptop: { label: 'Laptop', icon: 'fa-laptop' },
  impresora: { label: 'Impresora', icon: 'fa-print' },
  proyector: { label: 'Proyector', icon: 'fa-video' },
  router: { label: 'Router', icon: 'fa-wifi' },
  otro: { label: 'Otro', icon: 'fa-plug' },
};
export const ESTADOS_EQUIPO = {
  operativo: { label: 'Operativo', cls: 'bg-green-100 text-green-800' },
  en_reparacion: { label: 'En reparación', cls: 'bg-amber-100 text-amber-800' },
  fuera_servicio: { label: 'Fuera de servicio', cls: 'bg-red-100 text-red-800' },
  baja: { label: 'Baja', cls: 'bg-slate-200 text-slate-700' },
};
export const ESTADOS_SOLICITUD = {
  pendiente: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-800' },
  en_proceso: { label: 'En proceso', cls: 'bg-blue-100 text-blue-800' },
  atendida: { label: 'Atendida', cls: 'bg-green-100 text-green-800' },
  rechazada: { label: 'Rechazada', cls: 'bg-slate-200 text-slate-700' },
};
export const PRIORIDADES = {
  baja: { label: 'Baja', cls: 'bg-slate-100 text-slate-700' },
  media: { label: 'Media', cls: 'bg-orange-100 text-orange-800' },
  alta: { label: 'Alta', cls: 'bg-red-100 text-red-800' },
};
export const TIPOS_MANT = {
  preventivo: { label: 'Preventivo', cls: 'bg-sky-100 text-sky-800', icon: 'fa-shield-halved' },
  correctivo: { label: 'Correctivo', cls: 'bg-rose-100 text-rose-800', icon: 'fa-screwdriver-wrench' },
};
export const ROLES = { admin: 'Administrador', tecnico: 'Técnico', usuario: 'Usuario responsable' };
export const CATEGORIAS_FALLA = { hardware: 'Hardware', software: 'Software', red: 'Red', periferico: 'Periférico', otro: 'Otro' };

export const badge = (map, key) => {
  const it = map[key] || { label: key, cls: 'bg-slate-100 text-slate-700' };
  return html`<span class="badge ${it.cls}">${it.icon ? raw(`<i class="fa-solid ${it.icon}"></i>`) : ''}${it.label}</span>`;
};
export const tipoEquipo = (t) => {
  const it = TIPOS_EQUIPO[t] || TIPOS_EQUIPO.otro;
  return html`<span class="inline-flex items-center gap-2"><i class="fa-solid ${it.icon} text-slate-400 w-4"></i>${it.label}</span>`;
};

/** Indicador de próxima revisión (vencida / próxima / al día). */
export function revision(fechaStr) {
  if (!fechaStr) return html`<span class="text-slate-400">Sin programar</span>`;
  const d = diasHasta(fechaStr);
  if (d < 0) return html`<span class="badge bg-red-100 text-red-800"><i class="fa-solid fa-triangle-exclamation"></i>${fecha(fechaStr)} · vencida hace ${-d} d</span>`;
  if (d <= 7) return html`<span class="badge bg-amber-100 text-amber-800"><i class="fa-regular fa-clock"></i>${fecha(fechaStr)} · ${d === 0 ? 'hoy' : `en ${d} d`}</span>`;
  return html`<span class="text-slate-700">${fecha(fechaStr)}</span>`;
}

export const options = (items, selected, { empty } = {}) => html`
  ${empty !== undefined ? html`<option value="">${empty}</option>` : ''}
  ${items.map(([v, l]) => html`<option value="${v}" ${String(v) === String(selected ?? '') ? raw('selected') : ''}>${l}</option>`)}`;

export const emptyState = (icon, text, action = '') => html`
  <div class="py-14 text-center text-slate-500">
    <i class="fa-solid ${icon} text-4xl text-slate-300 mb-3"></i>
    <p>${text}</p>${action ? html`<div class="mt-4">${action}</div>` : ''}
  </div>`;

export const loading = () => html`<div class="py-16 text-center text-slate-400"><i class="fa-solid fa-circle-notch fa-spin text-2xl"></i></div>`;

export const pageHeader = (title, subtitle, actions = '') => html`
  <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div><h1>${title}</h1>${subtitle ? html`<p class="mt-1 text-sm text-slate-500">${subtitle}</p>` : ''}</div>
    <div class="flex flex-wrap gap-2 no-print">${actions}</div>
  </div>`;

// ---------- Avisos ----------
export function toast(msg, type = 'ok') {
  let box = $('#toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.className = 'fixed top-4 right-4 left-4 sm:left-auto z-50 flex flex-col gap-2 items-end';
    box.setAttribute('aria-live', 'polite');
    document.body.append(box);
  }
  const el = document.createElement('div');
  const cls = type === 'error' ? 'bg-red-600' : 'bg-slate-900';
  const icon = type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check';
  mount(el, html`<div class="${cls} text-white text-sm rounded-lg shadow-lg px-4 py-3 flex items-center gap-2 max-w-sm"><i class="fa-solid ${icon}"></i><span>${msg}</span></div>`);
  box.append(el);
  setTimeout(() => el.remove(), 4000);
}

// ---------- Modal ----------
/**
 * Abre un modal. `body` es una plantilla html``. Devuelve { el, close }.
 * onSubmit(form, close) se llama si el contenido tiene un <form>.
 */
export function modal({ title, body, size = 'max-w-lg', onSubmit, onOpen }) {
  const wrap = document.createElement('div');
  wrap.className = 'fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8';
  mount(wrap, html`
    <div class="card w-full ${size} my-auto" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <h2>${title}</h2>
        <button type="button" class="btn-ghost" data-close aria-label="Cerrar"><i class="fa-solid fa-xmark text-lg"></i></button>
      </div>
      <div class="p-5">${body}</div>
    </div>`);
  const prevFocus = document.activeElement;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); prevFocus?.focus?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  document.body.append(wrap);
  const form = $('form', wrap);
  if (form && onSubmit) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('[type=submit]', form);
      if (btn) btn.disabled = true;
      try { await onSubmit(form, close); } finally { if (btn) btn.disabled = false; }
    });
  }
  ($('[autofocus]', wrap) || $('input,select,textarea,button', wrap))?.focus();
  onOpen?.(wrap);
  return { el: wrap, close };
}

export function confirmDialog(message, { title = 'Confirmar', ok = 'Aceptar', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title,
      body: html`
        <p class="text-slate-600">${message}</p>
        <div class="mt-6 flex justify-end gap-2">
          <button type="button" class="btn-secondary" data-close>Cancelar</button>
          <button type="button" class="${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${ok}</button>
        </div>`,
    });
    $('[data-ok]', m.el).addEventListener('click', () => { done = true; m.close(); resolve(true); });
    new MutationObserver((_, obs) => { if (!m.el.isConnected) { obs.disconnect(); if (!done) resolve(false); } })
      .observe(document.body, { childList: true });
  });
}

// ---------- Formularios ----------
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') {
      if (el.dataset.multi !== undefined) { (out[el.name] ||= []); if (el.checked) out[el.name].push(el.value); } else out[el.name] = el.checked;
    } else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else out[el.name] = el.value;
  }
  return out;
}

/** Muestra errores de validación del servidor junto a cada campo. */
export function showErrors(form, err) {
  $$('.field-error', form).forEach((e) => e.remove());
  $$('.is-invalid', form).forEach((e) => e.classList.remove('is-invalid'));
  const details = err?.details || {};
  let first;
  for (const [name, msg] of Object.entries(details)) {
    // Un contenedor marcado con data-error-for (p. ej. grupo de casillas) tiene prioridad
    const group = $(`[data-error-for="${name}"]`, form);
    const field = form.elements[name];
    const el = field instanceof RadioNodeList ? field[0] : field;
    const anchor = group || el;
    if (!anchor) continue;
    if (!group && el && el.classList) el.classList.add('is-invalid');
    const p = document.createElement('p');
    p.className = 'field-error';
    p.textContent = msg;
    if (group) group.after(p);
    else (anchor.closest('[data-field]') || anchor.parentElement).append(p);
    first ||= el;
  }
  first?.focus?.();
  toast(err?.message || 'Ocurrió un error', 'error');
}

/** Debounce para búsquedas. */
export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
