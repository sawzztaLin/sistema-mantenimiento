import { api, qs } from '../api.js';
import {
  html, raw, mount, $, $$, loading, pageHeader, fecha, dinero, badge, options, emptyState, toast, formData, showErrors,
  confirmDialog, debounce, hoy, sumarMeses, TIPOS_MANT, ESTADOS_EQUIPO, CATEGORIAS_FALLA, PRIORIDADES,
} from '../ui.js';

// ---------------------------------------------------------------- Listado
export async function list(main, { query, user, navigate, isCurrent }) {
  const staff = user.rol !== 'usuario';
  const tecnicos = staff ? await api.get('/usuarios/opciones?rol=tecnico') : [];
  if (!isCurrent()) return;
  const f = { q: query.q || '', tipo: query.tipo || '', tecnico_id: query.tecnico_id || '', desde: query.desde || '', hasta: query.hasta || '' };

  mount(main, html`
    ${pageHeader('Mantenimientos', 'Registro de trabajos preventivos y correctivos.', html`
      <button id="csv" class="btn-secondary"><i class="fa-solid fa-file-csv"></i>Exportar</button>
      ${staff ? html`<a href="#/mantenimientos/nuevo" class="btn-primary"><i class="fa-solid fa-plus"></i>Registrar mantenimiento</a>` : ''}`)}
    <div class="card">
      <form id="filtros" class="grid grid-cols-1 gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div class="relative sm:col-span-2 lg:col-span-1">
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input name="q" class="input pl-9" placeholder="Equipo o diagnóstico" value="${f.q}" aria-label="Buscar">
        </div>
        <select name="tipo" class="input" aria-label="Tipo">${options(Object.entries(TIPOS_MANT).map(([k, v]) => [k, v.label]), f.tipo, { empty: 'Ambos tipos' })}</select>
        ${staff ? html`<select name="tecnico_id" class="input" aria-label="Técnico">${options(tecnicos.map((t) => [t.id, t.nombre]), f.tecnico_id, { empty: 'Todos los técnicos' })}</select>` : ''}
        <input name="desde" type="date" class="input" value="${f.desde}" aria-label="Desde" title="Desde">
        <input name="hasta" type="date" class="input" value="${f.hasta}" aria-label="Hasta" title="Hasta">
      </form>
      <div id="tabla">${loading()}</div>
    </div>`);

  const form = $('#filtros', main);
  const load = async () => {
    const params = formData(form);
    history.replaceState(null, '', `#/mantenimientos${qs(params)}`);
    const rows = await api.get(`/mantenimientos${qs(params)}`);
    if (!isCurrent()) return;
    mount($('#tabla', main), rows.length ? html`
      <div class="overflow-x-auto">
        <table class="table">
          <thead><tr><th>Fecha</th><th>Equipo</th><th>Tipo</th><th class="hidden md:table-cell">Falla / actividades</th>
            <th class="hidden lg:table-cell">Técnico</th><th class="text-right">Costo</th></tr></thead>
          <tbody>
            ${rows.map((m) => html`
              <tr class="clickable" data-id="${m.id}">
                <td class="whitespace-nowrap"><a href="#/mantenimientos/${m.id}" class="font-medium text-blue-800">${fecha(m.fecha)}</a></td>
                <td><span class="font-semibold">${m.num_inventario}</span><div class="text-xs text-slate-500">${m.marca} ${m.modelo}</div></td>
                <td>${badge(TIPOS_MANT, m.tipo)}</td>
                <td class="hidden md:table-cell max-w-xs">
                  ${m.falla ? html`<div class="font-medium text-rose-700">${m.falla}</div>` : ''}
                  <div class="truncate text-xs text-slate-500">${m.actividades.map((a) => a.nombre).join(', ')}</div>
                </td>
                <td class="hidden lg:table-cell">${m.tecnico}</td>
                <td class="text-right whitespace-nowrap">${m.costo_total ? dinero(m.costo_total) : '—'}</td>
              </tr>`)}
          </tbody>
        </table>
      </div>
      <p class="px-4 py-3 text-xs text-slate-500">${rows.length} registro(s)${rows.length >= 500 ? ' · se muestran los 500 más recientes; usa los filtros o exporta a CSV' : ''}</p>`
      : emptyState('fa-screwdriver-wrench', 'No hay mantenimientos con esos filtros.'));
    $$('tr[data-id]', main).forEach((tr) => tr.addEventListener('click', (ev) => {
      if (!ev.target.closest('a')) navigate(`/mantenimientos/${tr.dataset.id}`);
    }));
  };
  form.addEventListener('input', debounce(load, 250));
  form.addEventListener('change', load);
  form.addEventListener('submit', (e) => { e.preventDefault(); load(); });
  $('#csv', main).addEventListener('click', () => api.download(`/mantenimientos${qs({ ...formData(form), formato: 'csv' })}`));
  await load();
}

// ---------------------------------------------------------------- Detalle
export async function detail(main, { params, user, navigate, isCurrent }) {
  mount(main, loading());
  const m = await api.get(`/mantenimientos/${params.id}`);
  if (!isCurrent()) return;
  const canEdit = user.rol === 'admin' || (user.rol === 'tecnico' && m.tecnico_id === user.id);
  const dato = (label, value) => html`<div><dt class="text-xs uppercase tracking-wide text-slate-500">${label}</dt><dd class="mt-0.5 font-medium">${value || '—'}</dd></div>`;

  mount(main, html`
    <a href="#/equipos/${m.equipo_id}" class="no-print mb-3 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"><i class="fa-solid fa-arrow-left"></i>Historial del equipo</a>
    ${pageHeader(`Mantenimiento ${TIPOS_MANT[m.tipo].label.toLowerCase()} · ${fecha(m.fecha)}`, `Folio #${m.id}`, html`
      <button id="print" class="btn-secondary"><i class="fa-solid fa-print"></i>Imprimir</button>
      ${canEdit ? html`<a href="#/mantenimientos/${m.id}/editar" class="btn-secondary"><i class="fa-solid fa-pen"></i>Editar</a>` : ''}
      ${user.rol === 'admin' ? html`<button id="borrar" class="btn-danger"><i class="fa-solid fa-trash"></i>Eliminar</button>` : ''}`)}
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div class="card card-body space-y-6 lg:col-span-2">
        <dl class="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          ${dato('Equipo', html`<a class="text-blue-800 hover:underline" href="#/equipos/${m.equipo_id}">${m.num_inventario}</a> <span class="font-normal text-slate-500">${m.marca} ${m.modelo}</span>`)}
          ${dato('Tipo', badge(TIPOS_MANT, m.tipo))}
          ${dato('Técnico', m.tecnico)}
          ${dato('Falla atendida', m.falla ? html`${m.falla} <span class="text-xs font-normal text-slate-500">(${CATEGORIAS_FALLA[m.falla_categoria] || ''})</span>` : '')}
          ${dato('Estado resultante', badge(ESTADOS_EQUIPO, m.estado_resultante))}
          ${dato('Próxima revisión', fecha(m.proxima_revision))}
        </dl>
        <div>
          <h2 class="mb-2 text-base">Actividades realizadas</h2>
          <ul class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            ${m.actividades.map((a) => html`<li class="flex items-center gap-2 text-sm"><i class="fa-solid fa-circle-check text-green-600"></i>${a.nombre}</li>`)}
          </ul>
        </div>
        ${m.diagnostico ? html`<div><h2 class="mb-1 text-base">Diagnóstico</h2><p class="whitespace-pre-line text-sm text-slate-700">${m.diagnostico}</p></div>` : ''}
        ${m.observaciones ? html`<div><h2 class="mb-1 text-base">Observaciones</h2><p class="whitespace-pre-line text-sm text-slate-700">${m.observaciones}</p></div>` : ''}
      </div>
      <div class="card card-body">
        <h2 class="mb-3">Costos</h2>
        ${m.piezas.length ? html`
          <table class="w-full text-sm"><tbody>
            ${m.piezas.map((p) => html`<tr class="border-b border-slate-100"><td class="py-2">${p.cantidad}× ${p.pieza}</td><td class="py-2 text-right">${dinero(p.costo * p.cantidad)}</td></tr>`)}
          </tbody></table>` : html`<p class="text-sm text-slate-500">Sin piezas reemplazadas.</p>`}
        <dl class="mt-4 space-y-2 text-sm">
          <div class="flex justify-between"><dt class="text-slate-500">Piezas</dt><dd>${dinero(m.costo_piezas)}</dd></div>
          <div class="flex justify-between"><dt class="text-slate-500">Mano de obra</dt><dd>${dinero(m.costo_mano_obra)}</dd></div>
          <div class="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold"><dt>Total</dt><dd>${dinero(m.costo_total)}</dd></div>
        </dl>
      </div>
    </div>`);

  $('#print', main).addEventListener('click', () => window.print());
  $('#borrar', main)?.addEventListener('click', async () => {
    if (!(await confirmDialog('¿Eliminar este registro de mantenimiento? El estado y la próxima revisión del equipo se recalcularán.', { danger: true, ok: 'Eliminar' }))) return;
    try { await api.del(`/mantenimientos/${m.id}`); toast('Registro eliminado'); navigate(`/equipos/${m.equipo_id}`); } catch (err) { toast(err.message, 'error'); }
  });
}

// ---------------------------------------------------------------- Registro / edición
export async function form(main, { params, query, user, navigate, isCurrent }) {
  mount(main, loading());
  const [m, equipos, actividades, fallas, tecnicos, solicitudes] = await Promise.all([
    params.id ? api.get(`/mantenimientos/${params.id}`) : Promise.resolve(null),
    api.get('/equipos?estado=todos'),
    api.get('/catalogos/actividades'),
    api.get('/catalogos/fallas'),
    user.rol === 'admin' ? api.get('/usuarios/opciones?rol=tecnico') : Promise.resolve([]),
    api.get('/solicitudes?estado=abiertas'),
  ]);
  if (!isCurrent()) return;

  const v = m || {
    equipo_id: Number(query.equipo) || '',
    solicitud_id: Number(query.solicitud) || '',
    tipo: query.solicitud ? 'correctivo' : 'preventivo',
    fecha: hoy(),
    estado_resultante: 'operativo',
    costo_mano_obra: 0,
    actividades: [],
    piezas: [],
    tecnico_id: user.id,
  };
  const selActs = new Set((v.actividades || []).map((a) => a.id ?? a));
  const activas = (list) => list.filter((x) => x.activo || selActs.has(x.id) || x.id === v.falla_id);
  const eqOpts = equipos
    .filter((e) => e.estado !== 'baja' || e.id === v.equipo_id)
    .map((e) => [e.id, `${e.num_inventario} · ${e.marca} ${e.modelo}${e.ubicacion ? ` — ${e.ubicacion}` : ''}`]);
  const tecOpts = [[user.id, `${user.nombre} (yo)`], ...tecnicos.filter((t) => t.id !== user.id).map((t) => [t.id, t.nombre])];
  const field = (name, label, input, cls = '') => html`<div data-field class="${cls}"><label for="f-${name}">${label}</label>${input}</div>`;
  const back = m ? `#/mantenimientos/${m.id}` : v.equipo_id ? `#/equipos/${v.equipo_id}` : '#/mantenimientos';

  mount(main, html`
    <a href="${back}" class="mb-3 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"><i class="fa-solid fa-arrow-left"></i>Volver</a>
    ${pageHeader(m ? `Editar mantenimiento #${m.id}` : 'Registrar mantenimiento', 'Captura el trabajo realizado; el estado y la próxima revisión del equipo se actualizan al guardar.')}
    <form id="form" class="space-y-6" novalidate>
      <div class="card card-body grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        ${field('equipo_id', 'Equipo *', html`<select id="f-equipo_id" name="equipo_id" class="input">${options(eqOpts, v.equipo_id, { empty: 'Selecciona un equipo…' })}</select>`, 'sm:col-span-2')}
        ${field('fecha', 'Fecha *', html`<input id="f-fecha" name="fecha" type="date" class="input" value="${v.fecha}" max="${hoy()}">`)}
        ${user.rol === 'admin'
          ? field('tecnico_id', 'Técnico', html`<select id="f-tecnico_id" name="tecnico_id" class="input">${options(tecOpts, v.tecnico_id)}</select>`)
          : field('tecnico', 'Técnico', html`<input id="f-tecnico" class="input" value="${m ? m.tecnico : user.nombre}" disabled>`)}
        <div data-field class="sm:col-span-2">
          <span class="mb-1 block text-sm font-medium text-slate-700">Tipo de mantenimiento *</span>
          <div class="grid grid-cols-2 gap-2">
            ${Object.entries(TIPOS_MANT).map(([k, t]) => html`
              <label class="m-0 cursor-pointer">
                <input type="radio" name="tipo" value="${k}" class="peer sr-only" ${v.tipo === k ? raw('checked') : ''}>
                <span class="flex items-center justify-center gap-2 rounded-lg border-2 border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 peer-checked:border-blue-600 peer-checked:bg-blue-50 peer-checked:text-blue-800 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500">
                  <i class="fa-solid ${t.icon}"></i>${t.label}</span>
              </label>`)}
          </div>
        </div>
        <div id="sol-wrap" class="sm:col-span-2"></div>
      </div>

      <div class="card card-body">
        <h2 class="mb-1">Actividades realizadas *</h2>
        <p class="mb-4 text-sm text-slate-500">Marca todo lo que se hizo al equipo.</p>
        <div data-error-for="actividades" class="grid grid-cols-1 gap-6 md:grid-cols-2">
          ${['preventivo', 'correctivo'].map((t) => html`
            <fieldset data-grupo="${t}">
              <legend class="mb-2 text-sm font-semibold text-slate-700">${TIPOS_MANT[t].label}</legend>
              <div class="space-y-1">
                ${activas(actividades).filter((a) => a.tipo === t).map((a) => html`
                  <label class="m-0 flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 font-normal hover:bg-slate-50">
                    <input type="checkbox" name="actividades" data-multi value="${a.id}" class="h-4 w-4 rounded border-slate-300 text-blue-700" ${selActs.has(a.id) ? raw('checked') : ''}>
                    <span class="text-sm">${a.nombre}</span>
                  </label>`)}
              </div>
            </fieldset>`)}
        </div>
      </div>

      <div class="card card-body grid grid-cols-1 gap-4 md:grid-cols-2">
        ${field('falla_id', html`Falla atendida <span id="falla-req" class="text-red-600">*</span>`, html`
          <select id="f-falla_id" name="falla_id" class="input">${options(activas(fallas).map((x) => [x.id, `${x.nombre} (${CATEGORIAS_FALLA[x.categoria]})`]), v.falla_id, { empty: 'Ninguna / no aplica' })}</select>`)}
        ${field('estado_resultante', 'Estado del equipo al terminar *', html`
          <select id="f-estado_resultante" name="estado_resultante" class="input">${options(Object.entries(ESTADOS_EQUIPO).map(([k, x]) => [k, x.label]), v.estado_resultante)}</select>`)}
        ${field('diagnostico', 'Diagnóstico', html`<textarea id="f-diagnostico" name="diagnostico" rows="3" class="input" maxlength="4000" placeholder="¿Qué se encontró?">${v.diagnostico}</textarea>`)}
        ${field('observaciones', 'Observaciones / recomendaciones', html`<textarea id="f-observaciones" name="observaciones" rows="3" class="input" maxlength="4000">${v.observaciones}</textarea>`)}
      </div>

      <div class="card card-body">
        <div class="mb-3 flex items-center justify-between">
          <h2>Piezas reemplazadas</h2>
          <button type="button" id="add-pieza" class="btn-secondary btn-sm"><i class="fa-solid fa-plus"></i>Agregar pieza</button>
        </div>
        <div id="piezas" data-error-for="piezas" class="space-y-2"></div>
        <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          ${field('costo_mano_obra', 'Mano de obra (MXN)', html`<input id="f-costo_mano_obra" name="costo_mano_obra" type="number" min="0" step="0.01" class="input" value="${v.costo_mano_obra}">`)}
          <div class="sm:col-span-2 flex items-end justify-end"><p class="text-sm text-slate-600">Total: <span id="total" class="text-lg font-bold text-slate-900"></span></p></div>
        </div>
      </div>

      <div class="card card-body grid grid-cols-1 gap-4 sm:grid-cols-2">
        ${field('proxima_revision', 'Próxima revisión preventiva', html`<input id="f-proxima_revision" name="proxima_revision" type="date" class="input" value="${v.proxima_revision}">
          <p id="prox-hint" class="mt-1 text-xs text-slate-500"></p>`)}
      </div>

      <div class="flex justify-end gap-2">
        <a href="${back}" class="btn-secondary">Cancelar</a>
        <button type="submit" class="btn-primary"><i class="fa-solid fa-floppy-disk"></i>Guardar mantenimiento</button>
      </div>
    </form>`);

  const f = $('#form', main);
  const piezasBox = $('#piezas', main);
  const eqById = new Map(equipos.map((e) => [e.id, e]));
  let proxTouched = Boolean(m);

  const addPieza = (p = {}) => {
    const row = document.createElement('div');
    row.className = 'grid grid-cols-12 gap-2';
    mount(row, html`
      <input class="input col-span-12 sm:col-span-6" data-p="pieza" placeholder="Pieza (p. ej. Memoria RAM 8 GB)" value="${p.pieza}" maxlength="120" aria-label="Pieza">
      <input class="input col-span-4 sm:col-span-2" data-p="cantidad" type="number" min="1" step="1" value="${p.cantidad ?? 1}" aria-label="Cantidad">
      <input class="input col-span-6 sm:col-span-3" data-p="costo" type="number" min="0" step="0.01" placeholder="Costo unitario" value="${p.costo}" aria-label="Costo unitario">
      <button type="button" class="btn-ghost col-span-2 sm:col-span-1 text-red-600" aria-label="Quitar pieza"><i class="fa-solid fa-xmark"></i></button>`);
    $('button', row).addEventListener('click', () => { row.remove(); updateTotal(); });
    piezasBox.append(row);
  };
  const getPiezas = () => $$('#piezas > div', main).map((r) => ({
    pieza: $('[data-p=pieza]', r).value, cantidad: $('[data-p=cantidad]', r).value, costo: $('[data-p=costo]', r).value,
  })).filter((p) => p.pieza.trim());
  const updateTotal = () => {
    const piezas = getPiezas().reduce((s, p) => s + Number(p.cantidad || 0) * Number(p.costo || 0), 0);
    $('#total', main).textContent = dinero(piezas + Number(f.costo_mano_obra.value || 0));
  };

  const tipoActual = () => f.querySelector('[name=tipo]:checked')?.value;
  const updateTipo = () => {
    const t = tipoActual();
    $('#falla-req', main).classList.toggle('hidden', t !== 'correctivo');
    // El grupo que corresponde al tipo va primero
    const grupos = $('[data-error-for=actividades]', main);
    const g = $(`[data-grupo=${t}]`, grupos);
    grupos.prepend(g);
  };
  const suggestProx = () => {
    const e = eqById.get(Number(f.equipo_id.value));
    const hint = $('#prox-hint', main);
    if (!e) { hint.textContent = ''; return; }
    const sug = f.fecha.value ? sumarMeses(f.fecha.value, e.intervalo_meses) : '';
    hint.textContent = `Sugerida según el intervalo del equipo (cada ${e.intervalo_meses} meses): ${sug.split('-').reverse().join('/')}`;
    if (!proxTouched && sug) f.proxima_revision.value = sug;
  };
  const updateSolicitudes = () => {
    const eqId = Number(f.equipo_id.value);
    const abiertas = solicitudes.filter((s) => s.equipo_id === eqId);
    if (m?.solicitud_id && !abiertas.some((s) => s.id === m.solicitud_id)) abiertas.push({ id: m.solicitud_id, descripcion: '(solicitud vinculada)', prioridad: 'media' });
    mount($('#sol-wrap', main), abiertas.length ? field('solicitud_id', 'Atiende la solicitud', html`
      <select id="f-solicitud_id" name="solicitud_id" class="input">
        ${options(abiertas.map((s) => [s.id, `#${s.id} · ${PRIORIDADES[s.prioridad]?.label || ''} · ${s.descripcion.slice(0, 60)}`]), v.solicitud_id, { empty: 'No vinculada a una solicitud' })}
      </select>`) : '');
  };

  (v.piezas || []).forEach(addPieza);
  $('#add-pieza', main).addEventListener('click', () => { addPieza(); $$('[data-p=pieza]', piezasBox).at(-1).focus(); });
  piezasBox.addEventListener('input', updateTotal);
  f.costo_mano_obra.addEventListener('input', updateTotal);
  $$('[name=tipo]', f).forEach((r) => r.addEventListener('change', updateTipo));
  f.equipo_id.addEventListener('change', () => { suggestProx(); updateSolicitudes(); });
  f.fecha.addEventListener('change', suggestProx);
  f.proxima_revision.addEventListener('input', () => { proxTouched = true; });
  f.estado_resultante.addEventListener('change', () => {
    if (f.estado_resultante.value === 'baja') { f.proxima_revision.value = ''; proxTouched = true; }
  });
  updateTotal(); updateTipo(); suggestProx(); updateSolicitudes();
  if (!v.equipo_id) f.equipo_id.focus();

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = $('[type=submit]', f);
    btn.disabled = true;
    const data = { ...formData(f), piezas: getPiezas() };
    try {
      if (m) await api.put(`/mantenimientos/${m.id}`, data);
      else await api.post('/mantenimientos', data);
      toast(m ? 'Mantenimiento actualizado' : 'Mantenimiento registrado');
      navigate(`/equipos/${data.equipo_id}`);
    } catch (err) {
      showErrors(f, err);
    } finally {
      btn.disabled = false;
    }
  });
}

