import { api, qs } from '../api.js';
import { html, mount, $, $$, loading, pageHeader, hoy, tipoEquipo, revision, emptyState } from '../ui.js';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const p2 = (n) => String(n).padStart(2, '0');

/** Calendario mensual de revisiones preventivas programadas. */
export async function render(main, { query, isCurrent }) {
  const t = hoy();
  let [y, m] = (query.mes && /^\d{4}-\d{2}$/.test(query.mes) ? query.mes : t.slice(0, 7)).split('-').map(Number);

  mount(main, html`
    ${pageHeader('Agenda de mantenimiento', 'Revisiones preventivas programadas por fecha.', html`
      <a href="#/equipos?revision=vencida" class="btn-secondary"><i class="fa-solid fa-triangle-exclamation text-red-500"></i>Ver vencidas</a>`)}
    <div class="card">
      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <button id="prev" class="btn-ghost" aria-label="Mes anterior"><i class="fa-solid fa-chevron-left"></i></button>
        <div class="flex items-center gap-3"><h2 id="titulo"></h2><button id="hoy" class="btn-secondary btn-sm">Hoy</button></div>
        <button id="next" class="btn-ghost" aria-label="Mes siguiente"><i class="fa-solid fa-chevron-right"></i></button>
      </div>
      <div id="cal">${loading()}</div>
    </div>
    <div id="lista" class="mt-6"></div>`);

  const load = async () => {
    const mes = `${y}-${p2(m)}`;
    history.replaceState(null, '', `#/agenda${qs({ mes })}`);
    $('#titulo', main).textContent = `${MESES[m - 1]} ${y}`;
    const ultimo = new Date(y, m, 0).getDate();
    const desde = `${mes}-01`;
    const hasta = `${mes}-${p2(ultimo)}`;
    const equipos = await api.get(`/equipos${qs({ desde, hasta })}`);
    if (!isCurrent()) return;
    const porDia = new Map();
    for (const e of equipos) {
      const d = Number(e.proxima_revision.slice(8, 10));
      (porDia.get(d) || porDia.set(d, []).get(d)).push(e);
    }
    const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7; // lunes = 0
    const celdas = [];
    for (let i = 0; i < offset; i++) celdas.push(null);
    for (let d = 1; d <= ultimo; d++) celdas.push(d);
    while (celdas.length % 7) celdas.push(null);

    mount($('#cal', main), html`
      <div class="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold uppercase text-slate-500">
        ${DIAS.map((d) => html`<div class="py-2">${d}</div>`)}
      </div>
      <div class="grid grid-cols-7">
        ${celdas.map((d) => {
          if (!d) return html`<div class="min-h-[5.5rem] border-b border-r border-slate-100 bg-slate-50/60"></div>`;
          const f = `${mes}-${p2(d)}`;
          const items = porDia.get(d) || [];
          const vencida = f < t;
          return html`
            <div class="min-h-[5.5rem] border-b border-r border-slate-100 p-1.5 ${f === t ? 'bg-blue-50' : ''}">
              <div class="mb-1 text-right text-xs ${f === t ? 'font-bold text-blue-700' : 'text-slate-500'}">${d}</div>
              <div class="space-y-1">
                ${items.slice(0, 3).map((e) => html`
                  <a href="#/equipos/${e.id}" title="${e.num_inventario} · ${e.marca} ${e.modelo}"
                     class="block truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${vencida ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'} hover:opacity-80">${e.num_inventario}</a>`)}
                ${items.length > 3 ? html`<button class="w-full text-left text-[11px] text-slate-500 hover:underline" data-dia="${d}">+${items.length - 3} más</button>` : ''}
              </div>
            </div>`;
        })}
      </div>`);

    mount($('#lista', main), html`
      <div class="card">
        <div class="border-b border-slate-200 px-5 py-4"><h2>Equipos a revisar en ${MESES[m - 1].toLowerCase()} (${equipos.length})</h2></div>
        ${equipos.length ? html`
          <div class="overflow-x-auto"><table class="table">
            <thead><tr><th>Fecha</th><th>Equipo</th><th>Tipo</th><th class="hidden md:table-cell">Ubicación</th><th></th></tr></thead>
            <tbody>${equipos.sort((a, b) => a.proxima_revision.localeCompare(b.proxima_revision)).map((e) => html`
              <tr id="dia-${Number(e.proxima_revision.slice(8, 10))}">
                <td class="whitespace-nowrap">${revision(e.proxima_revision)}</td>
                <td><a class="font-semibold text-blue-800 hover:underline" href="#/equipos/${e.id}">${e.num_inventario}</a><div class="text-xs text-slate-500">${e.marca} ${e.modelo}</div></td>
                <td>${tipoEquipo(e.tipo)}</td>
                <td class="hidden md:table-cell">${e.ubicacion || '—'}</td>
                <td class="text-right"><a href="#/mantenimientos/nuevo?equipo=${e.id}" class="btn-secondary btn-sm"><i class="fa-solid fa-plus"></i>Registrar</a></td>
              </tr>`)}</tbody>
          </table></div>` : emptyState('fa-calendar', `Sin revisiones programadas para ${MESES[m - 1].toLowerCase()} ${y}.`)}
      </div>`);
    $$('[data-dia]', main).forEach((b) => b.addEventListener('click', () => $(`#dia-${b.dataset.dia}`, main)?.scrollIntoView({ behavior: 'smooth', block: 'center' })));
  };

  const move = (delta) => { m += delta; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } load(); };
  $('#prev', main).addEventListener('click', () => move(-1));
  $('#next', main).addEventListener('click', () => move(1));
  $('#hoy', main).addEventListener('click', () => { [y, m] = t.slice(0, 7).split('-').map(Number); load(); });
  await load();
}
