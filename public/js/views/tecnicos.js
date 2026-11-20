import { api } from '../api.js';
import { html, mount, loading, pageHeader, fecha, emptyState } from '../ui.js';

/** Módulo de técnicos: datos de contacto y carga de trabajo. */
export async function render(main, { user, isCurrent }) {
  mount(main, loading());
  const tecnicos = await api.get('/usuarios/tecnicos');
  if (!isCurrent()) return;
  mount(main, html`
    ${pageHeader('Técnicos', 'Personal de mantenimiento y su carga de trabajo.',
      user.rol === 'admin' ? html`<a href="#/usuarios?rol=tecnico" class="btn-primary"><i class="fa-solid fa-user-plus"></i>Administrar técnicos</a>` : '')}
    ${tecnicos.length ? html`
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        ${tecnicos.map((t) => html`
          <article class="card card-body ${t.activo ? '' : 'opacity-60'}">
            <div class="flex items-start gap-4">
              <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-700">
                ${t.nombre.split(' ').map((p) => p[0]).slice(0, 2).join('')}
              </div>
              <div class="min-w-0">
                <h2 class="truncate">${t.nombre}</h2>
                <p class="text-sm text-slate-500">${t.especialidad || 'Sin especialidad registrada'}</p>
                ${t.activo ? '' : html`<span class="badge mt-1 bg-slate-200 text-slate-700">Inactivo</span>`}
              </div>
            </div>
            <dl class="mt-4 space-y-1 text-sm">
              <div class="flex items-center gap-2 text-slate-600"><i class="fa-solid fa-envelope w-4 text-slate-400"></i><a class="hover:underline" href="mailto:${t.email}">${t.email}</a></div>
              ${t.telefono ? html`<div class="flex items-center gap-2 text-slate-600"><i class="fa-solid fa-phone w-4 text-slate-400"></i><a class="hover:underline" href="tel:${t.telefono}">${t.telefono}</a></div>` : ''}
            </dl>
            <div class="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center">
              <div><div class="text-xl font-bold">${t.total_mantenimientos}</div><div class="text-xs text-slate-500">Trabajos</div></div>
              <div><div class="text-xl font-bold text-sky-700">${t.preventivos}</div><div class="text-xs text-slate-500">Preventivos</div></div>
              <div><div class="text-xl font-bold text-rose-700">${t.correctivos}</div><div class="text-xs text-slate-500">Correctivos</div></div>
            </div>
            <div class="mt-3 flex justify-between text-xs text-slate-500">
              <span>Último trabajo: ${fecha(t.ultimo_mantenimiento)}</span>
              <span>${t.solicitudes_en_proceso} solicitud(es) en proceso</span>
            </div>
            <a href="#/mantenimientos?tecnico_id=${t.id}" class="btn-secondary btn-sm mt-4">Ver sus trabajos</a>
          </article>`)}
      </div>` : html`<div class="card">${emptyState('fa-user-gear', 'No hay técnicos registrados.')}</div>`}`);
}
