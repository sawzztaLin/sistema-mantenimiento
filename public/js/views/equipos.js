import { api, qs } from '../api.js';
import {
  html, raw, mount, $, $$, loading, pageHeader, fecha, dinero, badge, revision, tipoEquipo, options, emptyState,
  TIPOS_EQUIPO, ESTADOS_EQUIPO, ESTADOS_SOLICITUD, PRIORIDADES, TIPOS_MANT, toast, formData, showErrors, confirmDialog, debounce,
  hoy, sumarMeses,
} from '../ui.js';
import { nuevaSolicitudModal } from './solicitudes.js';

const REVISION = { vencida: 'Revisión vencida', proxima: 'Próximos 7 días', sin: 'Sin programar' };

// ---------------------------------------------------------------- Listado
export async function list(main, { query, user, navigate, isCurrent }) {
  const staff = user.rol !== 'usuario';
  const ubicaciones = staff ? await api.get('/catalogos/ubicaciones') : [];
  if (!isCurrent()) return;
  const f = { q: query.q || '', tipo: query.tipo || '', estado: query.estado || '', ubicacion_id: query.ubicacion_id || '', revision: query.revision || '' };

  mount(main, html`
    ${pageHeader(staff ? 'Equipos' : 'Mis equipos', 'Inventario de computadoras y periféricos.', html`
      ${staff ? html`<button id="csv" class="btn-secondary"><i class="fa-solid fa-file-csv"></i>Exportar</button>
      <a href="#/equipos/nuevo" class="btn-primary"><i class="fa-solid fa-plus"></i>Nuevo equipo</a>` : ''}`)}
    <div class="card">
      <form id="filtros" class="grid grid-cols-1 gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div class="relative lg:col-span-2">
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input name="q" class="input pl-9" placeholder="Inventario, marca, modelo, serie o responsable" value="${f.q}" aria-label="Buscar">
        </div>
        <select name="tipo" class="input" aria-label="Tipo">${options(Object.entries(TIPOS_EQUIPO).map(([k, v]) => [k, v.label]), f.tipo, { empty: 'Todos los tipos' })}</select>
        <select name="estado" class="input" aria-label="Estado">
          ${options([...Object.entries(ESTADOS_EQUIPO).filter(([k]) => k !== 'baja').map(([k, v]) => [k, v.label]), ['baja', 'Dados de baja'], ['todos', 'Todos (incluye bajas)']], f.estado, { empty: 'Activos' })}
        </select>
        ${staff
          ? html`<select name="ubicacion_id" class="input" aria-label="Ubicación">${options(ubicaciones.map((u) => [u.id, u.nombre]), f.ubicacion_id, { empty: 'Todas las ubicaciones' })}</select>`
          : html`<span></span>`}
        <div class="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-5">
          ${[['', 'Todas las revisiones'], ...Object.entries(REVISION)].map(([k, l]) => html`
            <label class="m-0 cursor-pointer">
              <input type="radio" name="revision" value="${k}" class="peer sr-only" ${f.revision === k ? raw('checked') : ''}>
              <span class="badge cursor-pointer bg-slate-100 px-3 py-1 text-slate-600 peer-checked:bg-blue-700 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500">${l}</span>
            </label>`)}
        </div>
      </form>
      <div id="tabla">${loading()}</div>
    </div>`);

  const form = $('#filtros', main);
  const load = async () => {
    const params = formData(form);
    history.replaceState(null, '', `#/equipos${qs(params)}`);
    const rows = await api.get(`/equipos${qs(params)}`);
    if (!isCurrent()) return;
    mount($('#tabla', main), rows.length ? html`
      <div class="overflow-x-auto">
        <table class="table">
          <thead><tr><th>Inventario</th><th>Equipo</th><th>Tipo</th><th class="hidden md:table-cell">Ubicación</th>
            <th class="hidden lg:table-cell">Responsable</th><th>Estado</th><th>Próxima revisión</th></tr></thead>
          <tbody>
            ${rows.map((e) => html`
              <tr class="clickable" data-id="${e.id}">
                <td class="font-semibold text-blue-800"><a href="#/equipos/${e.id}">${e.num_inventario}</a></td>
                <td>${e.marca} ${e.modelo}<div class="text-xs text-slate-500">${e.num_serie || ''}</div></td>
                <td>${tipoEquipo(e.tipo)}</td>
                <td class="hidden md:table-cell">${e.ubicacion || '—'}</td>
                <td class="hidden lg:table-cell">${e.responsable || '—'}</td>
                <td>${badge(ESTADOS_EQUIPO, e.estado)}</td>
                <td>${e.estado === 'baja' ? '—' : revision(e.proxima_revision)}</td>
              </tr>`)}
          </tbody>
        </table>
      </div>
      <p class="px-4 py-3 text-xs text-slate-500">${rows.length} equipo(s)</p>`
      : emptyState('fa-computer', 'No se encontraron equipos con esos filtros.'));
    $$('tr[data-id]', main).forEach((tr) => tr.addEventListener('click', (ev) => {
      if (!ev.target.closest('a')) navigate(`/equipos/${tr.dataset.id}`);
    }));
  };
  form.addEventListener('input', debounce(load, 250));
  form.addEventListener('change', load);
  form.addEventListener('submit', (e) => { e.preventDefault(); load(); });
  $('#csv', main)?.addEventListener('click', () => api.download(`/equipos${qs({ ...formData(form), formato: 'csv' })}`));
  await load();
}

// ---------------------------------------------------------------- Ficha / historial
export async function detail(main, { params, user, navigate, isCurrent }) {
  mount(main, loading());
  const e = await api.get(`/equipos/${params.id}`);
  if (!isCurrent()) return;
  const staff = user.rol !== 'usuario';
  const dato = (label, value) => html`<div><dt class="text-xs uppercase tracking-wide text-slate-500">${label}</dt><dd class="mt-0.5 font-medium">${value || '—'}</dd></div>`;

  mount(main, html`
    <a href="#/equipos" class="no-print mb-3 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"><i class="fa-solid fa-arrow-left"></i>Equipos</a>
    ${pageHeader(`${e.num_inventario} · ${e.marca} ${e.modelo}`, raw(`${TIPOS_EQUIPO[e.tipo]?.label || e.tipo}`), html`
      <button id="print" class="btn-secondary"><i class="fa-solid fa-print"></i>Imprimir</button>
      ${!staff && e.estado !== 'baja' ? html`<button id="reportar" class="btn-primary"><i class="fa-solid fa-bullhorn"></i>Reportar falla</button>` : ''}
      ${staff ? html`
        <a href="#/equipos/${e.id}/editar" class="btn-secondary"><i class="fa-solid fa-pen"></i>Editar</a>
        ${e.estado !== 'baja' ? html`<a href="#/mantenimientos/nuevo?equipo=${e.id}" class="btn-primary"><i class="fa-solid fa-plus"></i>Registrar mantenimiento</a>` : ''}` : ''}
      ${user.rol === 'admin' && !e.historial.length ? html`<button id="borrar" class="btn-danger"><i class="fa-solid fa-trash"></i></button>` : ''}`)}

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div class="space-y-6">
        <div class="card card-body">
          <div class="mb-4 flex items-center justify-between"><h2>Datos del equipo</h2>${badge(ESTADOS_EQUIPO, e.estado)}</div>
          <dl class="grid grid-cols-2 gap-4 text-sm">
            ${dato('Inventario', e.num_inventario)}
            ${dato('Número de serie', e.num_serie)}
            ${dato('Marca', e.marca)}
            ${dato('Modelo', e.modelo)}
            ${dato('Ubicación', e.ubicacion)}
            ${dato('Responsable', e.responsable)}
            ${dato('Adquisición', e.fecha_adquisicion ? fecha(e.fecha_adquisicion) : '')}
            ${dato('Revisión cada', `${e.intervalo_meses} meses`)}
          </dl>
          ${e.especificaciones ? html`<div class="mt-4 text-sm"><dt class="text-xs uppercase tracking-wide text-slate-500">Especificaciones</dt><dd class="mt-0.5 whitespace-pre-line">${e.especificaciones}</dd></div>` : ''}
        </div>
        <div class="card card-body">
          <h2 class="mb-4">Mantenimiento</h2>
          <dl class="space-y-3 text-sm">
            <div class="flex justify-between gap-2"><dt class="text-slate-500">Próxima revisión</dt><dd>${e.estado === 'baja' ? '—' : revision(e.proxima_revision)}</dd></div>
            <div class="flex justify-between"><dt class="text-slate-500">Último mantenimiento</dt><dd class="font-medium">${fecha(e.ultimo_mantenimiento)}</dd></div>
            <div class="flex justify-between"><dt class="text-slate-500">Preventivos / correctivos</dt><dd class="font-medium">${e.resumen.preventivos} / ${e.resumen.correctivos}</dd></div>
            <div class="flex justify-between"><dt class="text-slate-500">Costo acumulado</dt><dd class="font-medium">${dinero(e.resumen.costo_total)}</dd></div>
          </dl>
          ${e.fallas.length ? html`
            <h3 class="mt-5 mb-2 text-sm font-semibold text-slate-700">Fallas registradas</h3>
            <ul class="space-y-1 text-sm">${e.fallas.map((x) => html`<li class="flex justify-between"><span>${x.nombre}</span><span class="badge bg-rose-50 text-rose-700">${x.total}</span></li>`)}</ul>` : ''}
        </div>
        ${e.solicitudes.length ? html`
          <div class="card card-body">
            <h2 class="mb-3">Solicitudes</h2>
            <ul class="space-y-3 text-sm">
              ${e.solicitudes.map((s) => html`
                <li class="rounded-lg border border-slate-200 p-3">
                  <div class="flex flex-wrap items-center gap-2">${badge(ESTADOS_SOLICITUD, s.estado)}${badge(PRIORIDADES, s.prioridad)}<span class="text-xs text-slate-500">${fecha(s.fecha)}</span></div>
                  <p class="mt-2">${s.descripcion}</p>
                  <p class="mt-1 text-xs text-slate-500">Reportó: ${s.solicitante}${s.tecnico ? ` · Técnico: ${s.tecnico}` : ''}</p>
                </li>`)}
            </ul>
          </div>` : ''}
      </div>

      <div class="card lg:col-span-2">
        <div class="border-b border-slate-200 px-5 py-4"><h2>Historial de mantenimiento</h2></div>
        ${e.historial.length ? html`
          <ol class="relative ml-8 mr-5 my-5 border-l-2 border-slate-200">
            ${e.historial.map((m) => html`
              <li class="mb-6 ml-6">
                <span class="absolute -left-[17px] flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-white ${m.tipo === 'preventivo' ? 'bg-sky-100 text-sky-700' : 'bg-rose-100 text-rose-700'}">
                  <i class="fa-solid ${TIPOS_MANT[m.tipo].icon} text-xs"></i>
                </span>
                <a href="#/mantenimientos/${m.id}" class="block rounded-lg border border-slate-200 p-4 hover:border-blue-300 hover:bg-blue-50/40">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex flex-wrap items-center gap-2"><span class="font-semibold">${fecha(m.fecha)}</span>${badge(TIPOS_MANT, m.tipo)}${m.falla ? html`<span class="badge bg-rose-50 text-rose-700"><i class="fa-solid fa-bug"></i>${m.falla}</span>` : ''}</div>
                    <span class="text-xs text-slate-500"><i class="fa-solid fa-user-gear"></i> ${m.tecnico}</span>
                  </div>
                  ${m.diagnostico ? html`<p class="mt-2 text-sm text-slate-700">${m.diagnostico}</p>` : ''}
                  <div class="mt-2 flex flex-wrap gap-1">${m.actividades.map((a) => html`<span class="badge bg-slate-100 text-slate-700 font-normal">${a.nombre}</span>`)}</div>
                  ${m.piezas.length ? html`<p class="mt-2 text-xs text-slate-600"><i class="fa-solid fa-microchip"></i> ${m.piezas.map((p) => `${p.cantidad}× ${p.pieza}`).join(', ')}</p>` : ''}
                  <div class="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                    <span>Resultado: ${ESTADOS_EQUIPO[m.estado_resultante]?.label}</span>
                    ${m.costo_total ? html`<span>Costo: ${dinero(m.costo_total)}</span>` : ''}
                  </div>
                </a>
              </li>`)}
          </ol>` : emptyState('fa-clock-rotate-left', 'Este equipo aún no tiene mantenimientos registrados.',
            staff && e.estado !== 'baja' ? html`<a href="#/mantenimientos/nuevo?equipo=${e.id}" class="btn-primary"><i class="fa-solid fa-plus"></i>Registrar el primero</a>` : '')}
      </div>
    </div>`);

  $('#print', main).addEventListener('click', () => window.print());
  $('#reportar', main)?.addEventListener('click', () => nuevaSolicitudModal({ equipos: [e], equipoId: e.id, onDone: () => detail(main, { params, user, navigate, isCurrent }) }));
  $('#borrar', main)?.addEventListener('click', async () => {
    if (!(await confirmDialog(`¿Eliminar el equipo ${e.num_inventario}? Esta acción no se puede deshacer.`, { danger: true, ok: 'Eliminar' }))) return;
    try { await api.del(`/equipos/${e.id}`); toast('Equipo eliminado'); navigate('/equipos'); } catch (err) { toast(err.message, 'error'); }
  });
}

// ---------------------------------------------------------------- Alta / edición
export async function form(main, { params, navigate, isCurrent }) {
  mount(main, loading());
  const [e, ubicaciones, usuarios] = await Promise.all([
    params.id ? api.get(`/equipos/${params.id}`) : Promise.resolve(null),
    api.get('/catalogos/ubicaciones'),
    api.get('/usuarios/opciones'),
  ]);
  if (!isCurrent()) return;
  const v = e || { tipo: 'pc', estado: 'operativo', intervalo_meses: 6, proxima_revision: hoy() };
  const field = (name, label, input, cls = '') => html`<div data-field class="${cls}"><label for="f-${name}">${label}</label>${input}</div>`;

  mount(main, html`
    <a href="${e ? `#/equipos/${e.id}` : '#/equipos'}" class="mb-3 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"><i class="fa-solid fa-arrow-left"></i>${e ? 'Volver al equipo' : 'Equipos'}</a>
    ${pageHeader(e ? `Editar ${e.num_inventario}` : 'Nuevo equipo', 'Los campos con * son obligatorios.')}
    <form id="form" class="card card-body space-y-6" novalidate>
      <fieldset class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend class="mb-2 text-sm font-semibold text-slate-900">Identificación</legend>
        ${field('num_inventario', 'Número de inventario *', html`<input id="f-num_inventario" name="num_inventario" class="input" value="${v.num_inventario}" maxlength="60" required autofocus>`)}
        ${field('tipo', 'Tipo *', html`<select id="f-tipo" name="tipo" class="input">${options(Object.entries(TIPOS_EQUIPO).map(([k, x]) => [k, x.label]), v.tipo)}</select>`)}
        ${field('estado', 'Estado', html`<select id="f-estado" name="estado" class="input">${options(Object.entries(ESTADOS_EQUIPO).map(([k, x]) => [k, x.label]), v.estado)}</select>`)}
        ${field('marca', 'Marca *', html`<input id="f-marca" name="marca" class="input" value="${v.marca}" maxlength="80" required>`)}
        ${field('modelo', 'Modelo *', html`<input id="f-modelo" name="modelo" class="input" value="${v.modelo}" maxlength="80" required>`)}
        ${field('num_serie', 'Número de serie', html`<input id="f-num_serie" name="num_serie" class="input" value="${v.num_serie}" maxlength="80">`)}
      </fieldset>
      <fieldset class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend class="mb-2 text-sm font-semibold text-slate-900">Asignación</legend>
        ${field('ubicacion_id', 'Ubicación', html`<select id="f-ubicacion_id" name="ubicacion_id" class="input">${options(ubicaciones.map((u) => [u.id, u.nombre]), v.ubicacion_id, { empty: 'Sin ubicación' })}</select>`)}
        ${field('responsable_id', 'Usuario responsable', html`<select id="f-responsable_id" name="responsable_id" class="input">${options(usuarios.map((u) => [u.id, u.nombre]), v.responsable_id, { empty: 'Sin responsable' })}</select>`)}
        ${field('fecha_adquisicion', 'Fecha de adquisición', html`<input id="f-fecha_adquisicion" name="fecha_adquisicion" type="date" class="input" value="${v.fecha_adquisicion}" max="${hoy()}">`)}
      </fieldset>
      <fieldset class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend class="mb-2 text-sm font-semibold text-slate-900">Mantenimiento preventivo</legend>
        ${field('intervalo_meses', 'Revisar cada (meses) *', html`<input id="f-intervalo_meses" name="intervalo_meses" type="number" min="1" max="60" class="input" value="${v.intervalo_meses}">`)}
        ${field('proxima_revision', 'Próxima revisión', html`<input id="f-proxima_revision" name="proxima_revision" type="date" class="input" value="${v.proxima_revision}">
          <p class="mt-1 text-xs text-slate-500">Se actualiza automáticamente al registrar un mantenimiento.</p>`)}
      </fieldset>
      ${field('especificaciones', 'Especificaciones / notas', html`<textarea id="f-especificaciones" name="especificaciones" rows="3" class="input" maxlength="2000" placeholder="Procesador, RAM, almacenamiento, sistema operativo…">${v.especificaciones}</textarea>`)}
      <div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <a href="${e ? `#/equipos/${e.id}` : '#/equipos'}" class="btn-secondary">Cancelar</a>
        <button type="submit" class="btn-primary"><i class="fa-solid fa-floppy-disk"></i>Guardar</button>
      </div>
    </form>`);

  const f = $('#form', main);
  if (!e) {
    // Sugiere la próxima revisión a partir del intervalo
    f.intervalo_meses.addEventListener('change', () => {
      const n = Number(f.intervalo_meses.value);
      if (n > 0) f.proxima_revision.value = sumarMeses(hoy(), n);
    });
  }
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = $('[type=submit]', f);
    btn.disabled = true;
    try {
      const r = e ? await api.put(`/equipos/${e.id}`, formData(f)) : await api.post('/equipos', formData(f));
      toast(e ? 'Equipo actualizado' : 'Equipo registrado');
      navigate(`/equipos/${r.id}`);
    } catch (err) {
      showErrors(f, err);
    } finally {
      btn.disabled = false;
    }
  });
}
