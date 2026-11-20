import { api } from '../api.js';
import { html, mount, $, loading, pageHeader, fecha, mesCorto, badge, revision, tipoEquipo, TIPOS_MANT, ESTADOS_EQUIPO, emptyState } from '../ui.js';
import { chart, COLORS } from './charts.js';

const kpi = (label, value, icon, accent, href) => html`
  <a href="${href}" class="card card-body flex items-center justify-between border-l-4 ${accent.border} hover:shadow-md transition">
    <div><p class="text-sm text-slate-500">${label}</p><p class="mt-1 text-3xl font-bold text-slate-900">${value}</p></div>
    <i class="fa-solid ${icon} text-3xl ${accent.text}"></i>
  </a>`;

const A = {
  blue: { border: 'border-blue-600', text: 'text-blue-600' },
  green: { border: 'border-green-500', text: 'text-green-500' },
  amber: { border: 'border-amber-500', text: 'text-amber-500' },
  red: { border: 'border-red-500', text: 'text-red-500' },
  violet: { border: 'border-violet-500', text: 'text-violet-500' },
};

export async function render(main, { user, isCurrent }) {
  mount(main, loading());
  const d = await api.get('/reportes/dashboard');
  if (!isCurrent()) return;
  const k = d.kpis;
  const staff = user.rol !== 'usuario';

  mount(main, html`
    ${pageHeader(`Hola, ${user.nombre.split(' ')[0]}`, staff ? 'Resumen del estado de los equipos y el mantenimiento.' : 'Estado de los equipos a tu cargo.',
      staff
        ? html`<a href="#/mantenimientos/nuevo" class="btn-primary"><i class="fa-solid fa-plus"></i>Registrar mantenimiento</a>`
        : html`<a href="#/solicitudes?nueva=1" class="btn-primary"><i class="fa-solid fa-bullhorn"></i>Reportar una falla</a>`)}

    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      ${kpi(staff ? 'Equipos activos' : 'Mis equipos', k.equipos, 'fa-computer', A.blue, '#/equipos')}
      ${kpi('Revisiones vencidas', k.vencidos, 'fa-triangle-exclamation', A.red, '#/equipos?revision=vencida')}
      ${kpi('Revisiones en 7 días', k.proximos, 'fa-calendar-check', A.amber, '#/equipos?revision=proxima')}
      ${kpi('Solicitudes abiertas', k.solicitudes_abiertas, 'fa-inbox', A.violet, '#/solicitudes')}
    </div>

    <div class="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div class="card card-body xl:col-span-2">
        <div class="mb-4 flex items-center justify-between">
          <h2>Mantenimientos por mes</h2><span class="text-xs text-slate-500">Últimos 12 meses</span>
        </div>
        <div class="h-64"><canvas id="chart-meses" aria-label="Mantenimientos por mes"></canvas></div>
      </div>
      <div class="card card-body">
        <h2 class="mb-4">Estado de los equipos</h2>
        <div class="h-48"><canvas id="chart-estados" aria-label="Estado de los equipos"></canvas></div>
        <ul class="mt-4 space-y-2 text-sm">
          ${Object.entries(ESTADOS_EQUIPO).filter(([e]) => e !== 'baja').map(([e]) => html`
            <li class="flex items-center justify-between">${badge(ESTADOS_EQUIPO, e)}<span class="font-semibold">${d.porEstado[e] || 0}</span></li>`)}
        </ul>
      </div>
    </div>

    <div class="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
      <div class="card">
        <div class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2>Próximas revisiones</h2>${staff ? html`<a href="#/agenda" class="text-sm font-medium text-blue-700 hover:underline">Ver agenda</a>` : ''}
        </div>
        ${d.agenda.length ? html`
          <ul class="divide-y divide-slate-100">
            ${d.agenda.map((e) => html`
              <li><a href="#/equipos/${e.id}" class="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                <div class="min-w-0">
                  <div class="font-medium">${e.num_inventario} · ${e.marca} ${e.modelo}</div>
                  <div class="text-xs text-slate-500">${tipoEquipo(e.tipo)} · ${e.ubicacion || 'Sin ubicación'}</div>
                </div>
                ${revision(e.proxima_revision)}
              </a></li>`)}
          </ul>` : emptyState('fa-calendar-check', 'No hay revisiones en los próximos 30 días.')}
      </div>
      <div class="card">
        <div class="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2>Trabajos recientes</h2><a href="#/mantenimientos" class="text-sm font-medium text-blue-700 hover:underline">Ver todos</a>
        </div>
        ${d.recientes.length ? html`
          <ul class="divide-y divide-slate-100">
            ${d.recientes.map((m) => html`
              <li><a href="#/mantenimientos/${m.id}" class="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                <div class="min-w-0">
                  <div class="font-medium">${m.num_inventario} · ${m.marca} ${m.modelo}</div>
                  <div class="text-xs text-slate-500">${fecha(m.fecha)} · ${m.tecnico}${m.falla ? ` · ${m.falla}` : ''}</div>
                </div>
                ${badge(TIPOS_MANT, m.tipo)}
              </a></li>`)}
          </ul>` : emptyState('fa-screwdriver-wrench', 'Aún no hay mantenimientos registrados.')}
      </div>
    </div>`);

  chart($('#chart-meses', main), {
    type: 'bar',
    data: {
      labels: d.serie.map((s) => mesCorto(s.mes)),
      datasets: [
        { label: 'Preventivo', data: d.serie.map((s) => s.preventivos), backgroundColor: COLORS.preventivo, borderRadius: 4 },
        { label: 'Correctivo', data: d.serie.map((s) => s.correctivos), backgroundColor: COLORS.correctivo, borderRadius: 4 },
      ],
    },
    options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } },
  });
  const est = ['operativo', 'en_reparacion', 'fuera_servicio'];
  chart($('#chart-estados', main), {
    type: 'doughnut',
    data: {
      labels: est.map((e) => ESTADOS_EQUIPO[e].label),
      datasets: [{ data: est.map((e) => d.porEstado[e] || 0), backgroundColor: [COLORS.ok, COLORS.warn, COLORS.bad], borderWidth: 2, borderColor: '#fff' }],
    },
    options: { cutout: '65%', plugins: { legend: { display: false } } },
  });
}
