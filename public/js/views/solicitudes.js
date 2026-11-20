import { api, qs } from '../api.js';
import {
  html, raw, mount, $, $$, loading, pageHeader, fecha, badge, options, emptyState, toast, formData, showErrors, modal,
  ESTADOS_SOLICITUD, PRIORIDADES, tipoEquipo,
} from '../ui.js';

const FILTROS = [['abiertas', 'Abiertas'], ['atendida', 'Atendidas'], ['rechazada', 'Rechazadas'], ['', 'Todas']];

/** Modal para reportar una falla (usuario responsable, también disponible para el personal). */
export function nuevaSolicitudModal({ equipos, equipoId, onDone }) {
  modal({
    title: 'Reportar una falla',
    body: html`
      <form class="space-y-4" novalidate>
        <div data-field>
          <label for="s-equipo">Equipo *</label>
          <select id="s-equipo" name="equipo_id" class="input" ${equipoId ? '' : raw('autofocus')}>
            ${options(equipos.map((e) => [e.id, `${e.num_inventario} · ${e.marca} ${e.modelo}${e.ubicacion ? ` — ${e.ubicacion}` : ''}`]), equipoId, { empty: 'Selecciona el equipo…' })}
          </select>
        </div>
        <div data-field>
          <label for="s-desc">¿Qué problema presenta? *</label>
          <textarea id="s-desc" name="descripcion" rows="4" class="input" maxlength="2000" placeholder="Describe la falla: qué pasa, desde cuándo, mensajes de error…" ${equipoId ? raw('autofocus') : ''}></textarea>
        </div>
        <div data-field>
          <span class="mb-1 block text-sm font-medium text-slate-700">Prioridad</span>
          <div class="flex gap-4">
            ${Object.entries(PRIORIDADES).map(([k, p]) => html`
              <label class="m-0 flex items-center gap-2 font-normal"><input type="radio" name="prioridad" value="${k}" ${k === 'media' ? raw('checked') : ''}>${p.label}</label>`)}
          </div>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" class="btn-secondary" data-close>Cancelar</button>
          <button type="submit" class="btn-primary"><i class="fa-solid fa-paper-plane"></i>Enviar solicitud</button>
        </div>
      </form>`,
    onSubmit: async (form, close) => {
      try {
        await api.post('/solicitudes', formData(form));
        close();
        toast('Solicitud enviada. Un técnico la atenderá pronto.');
        onDone?.();
      } catch (err) { showErrors(form, err); }
    },
  });
}

export async function render(main, { query, user, isCurrent }) {
  const staff = user.rol !== 'usuario';
  let filtro = query.estado ?? 'abiertas';
  const [equipos, tecnicos] = await Promise.all([
    api.get('/equipos'),
    user.rol === 'admin' ? api.get('/usuarios/opciones?rol=tecnico') : Promise.resolve([]),
  ]);
  if (!isCurrent()) return;

  mount(main, html`
    ${pageHeader('Solicitudes de servicio', staff ? 'Fallas reportadas por los usuarios responsables de los equipos.' : 'Reporta fallas de tus equipos y da seguimiento.',
      html`<button id="nueva" class="btn-primary"><i class="fa-solid fa-bullhorn"></i>Reportar falla</button>`)}
    <div class="mb-4 flex flex-wrap gap-2" role="tablist">
      ${FILTROS.map(([k, l]) => html`<button class="btn-sm btn ${k === filtro ? 'bg-blue-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}" data-filtro="${k}" role="tab" aria-selected="${k === filtro}">${l}</button>`)}
    </div>
    <div id="lista">${loading()}</div>`);

  const load = async () => {
    history.replaceState(null, '', `#/solicitudes${qs({ estado: filtro })}`);
    $$('[data-filtro]', main).forEach((b) => {
      const on = b.dataset.filtro === filtro;
      b.className = `btn-sm btn ${on ? 'bg-blue-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`;
      b.setAttribute('aria-selected', on);
    });
    const rows = await api.get(`/solicitudes${qs({ estado: filtro })}`);
    if (!isCurrent()) return;
    mount($('#lista', main), rows.length ? html`
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        ${rows.map((s) => html`
          <article class="card card-body flex flex-col">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-2">${badge(ESTADOS_SOLICITUD, s.estado)}${badge(PRIORIDADES, s.prioridad)}</div>
              <span class="text-xs text-slate-500">#${s.id} · ${fecha(s.fecha)}</span>
            </div>
            <a href="#/equipos/${s.equipo_id}" class="mt-3 font-semibold text-blue-800 hover:underline">${s.num_inventario} · ${s.marca} ${s.modelo}</a>
            <div class="text-xs text-slate-500">${tipoEquipo(s.equipo_tipo)}${s.ubicacion ? ` · ${s.ubicacion}` : ''}</div>
            <p class="mt-3 flex-1 text-sm text-slate-700">${s.descripcion}</p>
            <p class="mt-3 text-xs text-slate-500">Reportó <strong>${s.solicitante}</strong>${s.tecnico ? html` · Técnico: <strong>${s.tecnico}</strong>` : ''}</p>
            ${s.comentario ? html`<p class="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600"><i class="fa-regular fa-comment"></i> ${s.comentario}</p>` : ''}
            ${staff && ['pendiente', 'en_proceso'].includes(s.estado) ? html`
              <div class="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <a href="#/mantenimientos/nuevo?equipo=${s.equipo_id}&solicitud=${s.id}" class="btn-primary btn-sm"><i class="fa-solid fa-screwdriver-wrench"></i>Registrar mantenimiento</a>
                ${s.estado === 'pendiente' ? html`<button class="btn-secondary btn-sm" data-tomar="${s.id}"><i class="fa-solid fa-hand"></i>Tomar</button>` : ''}
                ${user.rol === 'admin' ? html`<button class="btn-secondary btn-sm" data-asignar="${s.id}"><i class="fa-solid fa-user-plus"></i>Asignar</button>` : ''}
                <button class="btn-ghost btn-sm text-red-600" data-rechazar="${s.id}">Rechazar</button>
              </div>` : ''}
          </article>`)}
      </div>`
      : html`<div class="card">${emptyState('fa-inbox', 'No hay solicitudes en esta vista.')}</div>`);

    const byId = new Map(rows.map((s) => [String(s.id), s]));
    const update = async (s, body, msg) => {
      try { await api.put(`/solicitudes/${s.id}`, { prioridad: s.prioridad, comentario: s.comentario, ...body }); toast(msg); load(); } catch (err) { toast(err.message, 'error'); }
    };
    $$('[data-tomar]', main).forEach((b) => b.addEventListener('click', () => update(byId.get(b.dataset.tomar), { estado: 'en_proceso', tecnico_id: user.id }, 'Solicitud asignada a ti')));
    $$('[data-asignar]', main).forEach((b) => b.addEventListener('click', () => {
      const s = byId.get(b.dataset.asignar);
      modal({
        title: `Asignar solicitud #${s.id}`,
        body: html`<form class="space-y-4">
          <div data-field><label for="a-tec">Técnico</label><select id="a-tec" name="tecnico_id" class="input">${options(tecnicos.map((t) => [t.id, t.nombre]), s.tecnico_id)}</select></div>
          <div class="flex justify-end gap-2"><button type="button" class="btn-secondary" data-close>Cancelar</button><button class="btn-primary" type="submit">Asignar</button></div></form>`,
        onSubmit: async (form, close) => { close(); await update(s, { estado: 'en_proceso', tecnico_id: form.tecnico_id.value }, 'Solicitud asignada'); },
      });
    }));
    $$('[data-rechazar]', main).forEach((b) => b.addEventListener('click', () => {
      const s = byId.get(b.dataset.rechazar);
      modal({
        title: `Rechazar solicitud #${s.id}`,
        body: html`<form class="space-y-4">
          <div data-field><label for="r-com">Motivo *</label><textarea id="r-com" name="comentario" rows="3" class="input" required maxlength="2000" placeholder="Explica al usuario por qué se rechaza"></textarea></div>
          <div class="flex justify-end gap-2"><button type="button" class="btn-secondary" data-close>Cancelar</button><button class="btn-danger" type="submit">Rechazar</button></div></form>`,
        onSubmit: async (form, close) => {
          if (!form.comentario.value.trim()) { form.comentario.focus(); return; }
          close(); await update(s, { estado: 'rechazada', tecnico_id: s.tecnico_id, comentario: form.comentario.value }, 'Solicitud rechazada');
        },
      });
    }));
  };

  $$('[data-filtro]', main).forEach((b) => b.addEventListener('click', () => { filtro = b.dataset.filtro; load(); }));
  const abrir = () => nuevaSolicitudModal({ equipos, onDone: () => { filtro = 'abiertas'; load(); } });
  $('#nueva', main).addEventListener('click', abrir);
  if (query.nueva) abrir();
  await load();
}
