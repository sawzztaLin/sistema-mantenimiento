import { api, qs } from '../api.js';
import {
  html, mount, $, $$, loading, pageHeader, fecha, dinero, badge, emptyState, hoy, sumarMeses, tipoEquipo, revision,
  ESTADOS_EQUIPO, TIPOS_MANT, TIPOS_EQUIPO, CATEGORIAS_FALLA,
} from '../ui.js';
import { chart, COLORS } from './charts.js';

const TABS = [
  ['pendientes', 'Equipos que necesitan mantenimiento', 'fa-triangle-exclamation'],
  ['fallas', 'Fallas más comunes', 'fa-bug'],
  ['trabajos', 'Trabajos realizados', 'fa-clipboard-check'],
];

const stat = (label, value, sub = '') => html`
  <div class="card card-body"><p class="text-sm text-slate-500">${label}</p><p class="mt-1 text-2xl font-bold">${value}</p>${sub ? html`<p class="text-xs text-slate-500">${sub}</p>` : ''}</div>`;

export async function render(main, { query, isCurrent }) {
  const state = {
    tab: TABS.some(([k]) => k === query.tab) ? query.tab : 'pendientes',
    desde: query.desde || sumarMeses(hoy(), -12),
    hasta: query.hasta || hoy(),
    dias: query.dias || '30',
  };

  mount(main, html`
    ${pageHeader('Reportes', 'Información para planear el mantenimiento y medir resultados.', html`
      <button id="csv" class="btn-secondary"><i class="fa-solid fa-file-csv"></i>Exportar CSV</button>
      <button id="print" class="btn-secondary"><i class="fa-solid fa-print"></i>Imprimir / PDF</button>`)}
    <div class="no-print mb-4 flex flex-wrap gap-2 border-b border-slate-200" role="tablist">
      ${TABS.map(([k, l, i]) => html`<button data-tab="${k}" role="tab" class="-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold"><i class="fa-solid ${i}"></i>${l}</button>`)}
    </div>
    <form id="rango" class="no-print card card-body mb-6 flex flex-wrap items-end gap-4"></form>
    <div id="contenido"></div>`);

  const form = $('#rango', main);
  const cont = $('#contenido', main);

  const renderRango = () => {
    mount(form, state.tab === 'pendientes' ? html`
      <div><label for="r-dias">Revisión dentro de los próximos</label>
        <select id="r-dias" name="dias" class="input w-48">
          ${[['7', '7 días'], ['15', '15 días'], ['30', '30 días'], ['60', '60 días'], ['90', '90 días']].map(([v, l]) => html`<option value="${v}" ${v === state.dias ? 'selected' : ''}>${l}</option>`)}
        </select></div>
      <p class="pb-2 text-sm text-slate-500">Incluye revisiones vencidas, equipos con falla y solicitudes abiertas.</p>`
      : html`
      <div><label for="r-desde">Desde</label><input id="r-desde" type="date" name="desde" class="input" value="${state.desde}" max="${hoy()}"></div>
      <div><label for="r-hasta">Hasta</label><input id="r-hasta" type="date" name="hasta" class="input" value="${state.hasta}" max="${hoy()}"></div>
      <div class="flex flex-wrap gap-2 pb-0.5">
        ${[[1, 'Último mes'], [3, '3 meses'], [6, '6 meses'], [12, '12 meses']].map(([n, l]) => html`<button type="button" class="btn-secondary btn-sm" data-meses="${n}">${l}</button>`)}
      </div>`);
    $$('[data-meses]', form).forEach((b) => b.addEventListener('click', () => {
      state.hasta = hoy(); state.desde = sumarMeses(hoy(), -Number(b.dataset.meses)); renderRango(); load();
    }));
  };

  const load = async () => {
    history.replaceState(null, '', `#/reportes${qs(state.tab === 'pendientes' ? { tab: state.tab, dias: state.dias } : { tab: state.tab, desde: state.desde, hasta: state.hasta })}`);
    $$('[data-tab]', main).forEach((b) => {
      const on = b.dataset.tab === state.tab;
      b.className = `-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${on ? 'border-blue-700 text-blue-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`;
      b.setAttribute('aria-selected', on);
    });
    mount(cont, loading());
    if (state.tab === 'pendientes') await pendientes();
    else if (state.tab === 'fallas') await fallas();
    else await trabajos();
  };

  // ---- Equipos que necesitan mantenimiento
  async function pendientes() {
    const d = await api.get(`/reportes/pendientes${qs({ dias: state.dias })}`);
    if (!isCurrent()) return;
    const eq = d.equipos;
    const vencidas = eq.filter((e) => e.motivo.includes('Revisión vencida')).length;
    const conFalla = eq.filter((e) => ['en_reparacion', 'fuera_servicio'].includes(e.estado)).length;
    mount(cont, html`
      <h2 class="mb-3 hidden print:block">Equipos que necesitan mantenimiento (próximos ${d.dias} días) · ${fecha(hoy())}</h2>
      <div class="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        ${stat('Equipos en la lista', eq.length)}
        ${stat('Revisión vencida', vencidas)}
        ${stat(`Revisión en ${d.dias} días`, eq.filter((e) => e.motivo.includes('Revisión próxima')).length)}
        ${stat('En reparación / fuera de servicio', conFalla)}
      </div>
      <div class="card">
        ${eq.length ? html`<div class="overflow-x-auto"><table class="table">
          <thead><tr><th>Equipo</th><th>Tipo</th><th class="hidden md:table-cell">Ubicación</th><th>Estado</th><th>Último</th><th>Próxima revisión</th><th>Motivo</th></tr></thead>
          <tbody>${eq.map((e) => html`
            <tr>
              <td><a class="font-semibold text-blue-800 hover:underline" href="#/equipos/${e.id}">${e.num_inventario}</a><div class="text-xs text-slate-500">${e.marca} ${e.modelo}</div></td>
              <td>${tipoEquipo(e.tipo)}</td>
              <td class="hidden md:table-cell">${e.ubicacion || '—'}<div class="text-xs text-slate-500">${e.responsable || ''}</div></td>
              <td>${badge(ESTADOS_EQUIPO, e.estado)}</td>
              <td class="whitespace-nowrap">${fecha(e.ultimo_mantenimiento)}</td>
              <td>${revision(e.proxima_revision)}</td>
              <td class="text-xs">${e.motivo.join(', ')}</td>
            </tr>`)}</tbody></table></div>`
        : emptyState('fa-circle-check', 'Ningún equipo requiere atención en este periodo.')}
      </div>`);
  }

  // ---- Fallas más comunes
  async function fallas() {
    const d = await api.get(`/reportes/fallas${qs({ desde: state.desde, hasta: state.hasta })}`);
    if (!isCurrent()) return;
    const max = d.fallas[0]?.total || 1;
    mount(cont, html`
      <h2 class="mb-3 hidden print:block">Fallas más comunes · ${fecha(d.desde)} a ${fecha(d.hasta)}</h2>
      <div class="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        ${stat('Fallas registradas', d.total)}
        ${stat('Tipos de falla distintos', d.fallas.length)}
        ${stat('Falla más frecuente', d.fallas[0]?.nombre || '—', d.fallas[0] ? `${d.fallas[0].porcentaje}% del total` : '')}
        ${stat('Equipos reincidentes', d.reincidentes.length, '2 o más fallas en el periodo')}
      </div>
      ${d.total ? html`
      <div class="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div class="card card-body xl:col-span-2">
          <h2 class="mb-4">Ranking de fallas</h2>
          <ul class="space-y-3">
            ${d.fallas.map((f) => html`
              <li>
                <div class="mb-1 flex justify-between gap-2 text-sm"><span class="font-medium">${f.nombre} <span class="text-xs font-normal text-slate-500">· ${CATEGORIAS_FALLA[f.categoria]}</span></span>
                  <span class="whitespace-nowrap text-slate-600">${f.total} · ${f.porcentaje}%</span></div>
                <div class="h-2.5 rounded-full bg-slate-100"><div class="h-2.5 rounded-full bg-rose-500" data-w="${Math.round((f.total / max) * 100)}"></div></div>
                <p class="mt-0.5 text-xs text-slate-500">${f.equipos_afectados} equipo(s) · última: ${fecha(f.ultima)}</p>
              </li>`)}
          </ul>
        </div>
        <div class="space-y-6">
          <div class="card card-body"><h2 class="mb-4">Por categoría</h2><div class="h-56"><canvas id="c-cat"></canvas></div></div>
          <div class="card card-body"><h2 class="mb-4">Por tipo de equipo</h2><div class="h-56"><canvas id="c-tipo"></canvas></div></div>
        </div>
      </div>
      ${d.reincidentes.length ? html`
        <div class="card mt-6">
          <div class="border-b border-slate-200 px-5 py-4"><h2>Equipos con fallas recurrentes</h2><p class="text-sm text-slate-500">Candidatos a revisión profunda o reemplazo${d.reincidentes.length > 15 ? ' (se muestran los 15 con más fallas)' : ''}.</p></div>
          <div class="overflow-x-auto"><table class="table"><thead><tr><th>Equipo</th><th>Modelo</th><th class="text-right">Fallas</th></tr></thead>
          <tbody>${d.reincidentes.slice(0, 15).map((e) => html`<tr><td><a class="font-semibold text-blue-800 hover:underline" href="#/equipos/${e.id}">${e.num_inventario}</a></td><td>${e.marca} ${e.modelo}</td><td class="text-right font-semibold">${e.fallas}</td></tr>`)}</tbody></table></div>
        </div>` : ''}`
      : html`<div class="card">${emptyState('fa-bug', 'No se registraron fallas en este periodo.')}</div>`}`);
    // Anchos de barra vía CSSOM (compatible con la política CSP)
    $$('[data-w]', cont).forEach((el) => { el.style.width = `${el.dataset.w}%`; });
    chart($('#c-cat', cont), {
      type: 'doughnut',
      data: { labels: d.porCategoria.map((c) => CATEGORIAS_FALLA[c.categoria]), datasets: [{ data: d.porCategoria.map((c) => c.total), backgroundColor: COLORS.palette, borderColor: '#fff', borderWidth: 2 }] },
      options: { cutout: '55%' },
    });
    chart($('#c-tipo', cont), {
      type: 'bar',
      data: { labels: d.porTipoEquipo.map((c) => TIPOS_EQUIPO[c.tipo]?.label || c.tipo), datasets: [{ label: 'Fallas', data: d.porTipoEquipo.map((c) => c.total), backgroundColor: COLORS.correctivo, borderRadius: 4 }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } } },
    });
  }

  // ---- Trabajos realizados
  async function trabajos() {
    const [d, lista] = await Promise.all([
      api.get(`/reportes/trabajos${qs({ desde: state.desde, hasta: state.hasta })}`),
      api.get(`/mantenimientos${qs({ desde: state.desde, hasta: state.hasta, limit: 2000 })}`),
    ]);
    if (!isCurrent()) return;
    const r = d.resumen;
    mount(cont, html`
      <h2 class="mb-3 hidden print:block">Trabajos realizados · ${fecha(d.desde)} a ${fecha(d.hasta)}</h2>
      <div class="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        ${stat('Mantenimientos', r.total, `${r.preventivos} preventivos · ${r.correctivos} correctivos`)}
        ${stat('Equipos atendidos', r.equipos_atendidos)}
        ${stat('Piezas reemplazadas', r.piezas, dinero(r.costo_piezas))}
        ${stat('Costo total', dinero(r.costo_total), `Mano de obra: ${dinero(r.costo_mano_obra)}`)}
      </div>
      ${r.total ? html`
      <div class="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div class="card card-body"><h2 class="mb-4">Trabajos por técnico</h2><div class="h-64"><canvas id="c-tec"></canvas></div></div>
        <div class="card card-body"><h2 class="mb-4">Actividades más realizadas</h2>
          <ol class="space-y-2 text-sm">${d.actividades.map((a, i) => html`
            <li class="flex items-center justify-between gap-2"><span><span class="mr-2 text-slate-400">${i + 1}.</span>${a.nombre}</span>
              <span class="flex items-center gap-2">${badge(TIPOS_MANT, a.tipo)}<span class="w-8 text-right font-semibold">${a.total}</span></span></li>`)}
          </ol></div>
      </div>
      <div class="card">
        <div class="border-b border-slate-200 px-5 py-4"><h2>Listado de trabajos (${lista.length})</h2></div>
        <div class="overflow-x-auto"><table class="table">
          <thead><tr><th>Fecha</th><th>Equipo</th><th>Tipo</th><th>Falla / actividades</th><th class="hidden md:table-cell">Técnico</th><th class="text-right">Costo</th></tr></thead>
          <tbody>${lista.map((m) => html`
            <tr>
              <td class="whitespace-nowrap"><a class="text-blue-800 hover:underline" href="#/mantenimientos/${m.id}">${fecha(m.fecha)}</a></td>
              <td><span class="font-semibold">${m.num_inventario}</span><div class="text-xs text-slate-500">${m.marca} ${m.modelo}</div></td>
              <td>${badge(TIPOS_MANT, m.tipo)}</td>
              <td class="max-w-sm">${m.falla ? html`<div class="font-medium text-rose-700">${m.falla}</div>` : ''}<div class="text-xs text-slate-500">${m.actividades.map((a) => a.nombre).join(', ')}</div></td>
              <td class="hidden md:table-cell">${m.tecnico}</td>
              <td class="text-right whitespace-nowrap">${m.costo_total ? dinero(m.costo_total) : '—'}</td>
            </tr>`)}</tbody>
        </table></div>
      </div>` : html`<div class="card">${emptyState('fa-clipboard', 'No hay trabajos registrados en este periodo.')}</div>`}`);
    chart($('#c-tec', cont), {
      type: 'bar',
      data: {
        labels: d.porTecnico.map((t) => t.nombre),
        datasets: [
          { label: 'Preventivo', data: d.porTecnico.map((t) => t.preventivos), backgroundColor: COLORS.preventivo, borderRadius: 4 },
          { label: 'Correctivo', data: d.porTecnico.map((t) => t.correctivos), backgroundColor: COLORS.correctivo, borderRadius: 4 },
        ],
      },
      options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } },
    });
  }

  $$('[data-tab]', main).forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab; renderRango(); load(); }));
  form.addEventListener('change', (e) => {
    if (e.target.name === 'dias') state.dias = e.target.value;
    if (e.target.name === 'desde' && e.target.value) state.desde = e.target.value;
    if (e.target.name === 'hasta' && e.target.value) state.hasta = e.target.value;
    load();
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  $('#print', main).addEventListener('click', () => window.print());
  $('#csv', main).addEventListener('click', () => {
    if (state.tab === 'pendientes') api.download(`/reportes/pendientes${qs({ dias: state.dias, formato: 'csv' })}`);
    else if (state.tab === 'fallas') api.download(`/reportes/fallas${qs({ desde: state.desde, hasta: state.hasta, formato: 'csv' })}`);
    else api.download(`/mantenimientos${qs({ desde: state.desde, hasta: state.hasta, formato: 'csv' })}`);
  });
  renderRango();
  await load();
}
