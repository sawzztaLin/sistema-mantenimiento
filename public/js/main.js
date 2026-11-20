import { api, setUnauthorizedHandler } from './api.js';
import { html, mount, $, $$, ROLES, toast } from './ui.js';
import * as loginView from './views/login.js';
import * as dashboard from './views/dashboard.js';
import * as equipos from './views/equipos.js';
import * as mantenimientos from './views/mantenimientos.js';
import * as agenda from './views/agenda.js';
import * as solicitudes from './views/solicitudes.js';
import * as reportes from './views/reportes.js';
import * as tecnicos from './views/tecnicos.js';
import * as admin from './views/admin.js';
import * as perfil from './views/perfil.js';

const ALL = ['admin', 'tecnico', 'usuario'];
const STAFF = ['admin', 'tecnico'];

const NAV = [
  { href: '#/', icon: 'fa-gauge-high', label: 'Panel', roles: ALL },
  { href: '#/equipos', icon: 'fa-computer', label: 'Equipos', roles: ALL },
  { href: '#/mantenimientos', icon: 'fa-screwdriver-wrench', label: 'Mantenimientos', roles: ALL },
  { href: '#/agenda', icon: 'fa-calendar-days', label: 'Agenda', roles: STAFF },
  { href: '#/solicitudes', icon: 'fa-inbox', label: 'Solicitudes', roles: ALL },
  { href: '#/reportes', icon: 'fa-chart-pie', label: 'Reportes', roles: STAFF },
  { href: '#/tecnicos', icon: 'fa-user-gear', label: 'Técnicos', roles: STAFF },
  { section: 'Administración', roles: ['admin'] },
  { href: '#/usuarios', icon: 'fa-users', label: 'Usuarios', roles: ['admin'] },
  { href: '#/catalogos', icon: 'fa-list-check', label: 'Catálogos', roles: ['admin'] },
];

const ROUTES = [
  ['/', dashboard.render, ALL],
  ['/equipos', equipos.list, ALL],
  ['/equipos/nuevo', equipos.form, STAFF],
  ['/equipos/:id', equipos.detail, ALL],
  ['/equipos/:id/editar', equipos.form, STAFF],
  ['/mantenimientos', mantenimientos.list, ALL],
  ['/mantenimientos/nuevo', mantenimientos.form, STAFF],
  ['/mantenimientos/:id', mantenimientos.detail, ALL],
  ['/mantenimientos/:id/editar', mantenimientos.form, STAFF],
  ['/agenda', agenda.render, STAFF],
  ['/solicitudes', solicitudes.render, ALL],
  ['/reportes', reportes.render, STAFF],
  ['/tecnicos', tecnicos.render, STAFF],
  ['/usuarios', admin.usuarios, ['admin']],
  ['/catalogos', admin.catalogos, ['admin']],
  ['/perfil', perfil.render, ALL],
].map(([path, view, roles]) => {
  const keys = [];
  const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  return { re, keys, view, roles };
});

const state = { user: null };
const app = document.getElementById('app');

function parseHash() {
  const h = decodeURIComponent(location.hash.slice(1) || '/');
  const [path, q = ''] = h.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(q)) };
}

export function navigate(to) { location.hash = to; }

function layout() {
  const u = state.user;
  const items = NAV.filter((n) => n.roles.includes(u.rol));
  mount(app, html`
    <div class="min-h-screen lg:flex">
      <aside id="sidebar" class="no-print fixed inset-y-0 left-0 z-30 w-64 -translate-x-full transform bg-blue-800 transition-transform lg:static lg:translate-x-0 flex flex-col">
        <div class="flex h-16 items-center gap-2 px-5 text-white">
          <i class="fa-solid fa-laptop-medical text-2xl"></i>
          <div class="leading-tight"><div class="font-bold">Mantenimiento PC</div><div class="text-xs text-blue-200">Control de equipos de cómputo</div></div>
        </div>
        <nav class="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          ${items.map((n) => n.section
            ? html`<div class="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-blue-300">${n.section}</div>`
            : html`<a href="${n.href}" class="nav-link" data-nav><i class="fa-solid ${n.icon}"></i>${n.label}</a>`)}
        </nav>
        <div class="border-t border-blue-700 p-3">
          <a href="#/perfil" class="nav-link" data-nav>
            <i class="fa-solid fa-circle-user"></i>
            <span class="min-w-0"><span class="block truncate">${u.nombre}</span><span class="block text-xs text-blue-300">${ROLES[u.rol]}</span></span>
          </a>
          <button id="logout" class="nav-link w-full"><i class="fa-solid fa-right-from-bracket"></i>Cerrar sesión</button>
        </div>
      </aside>
      <div id="backdrop" class="no-print fixed inset-0 z-20 hidden bg-slate-900/40 lg:hidden"></div>
      <div class="flex-1 min-w-0">
        <header class="no-print sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
          <button id="menu" class="btn-ghost" aria-label="Abrir menú"><i class="fa-solid fa-bars text-lg"></i></button>
          <span class="font-semibold text-blue-800">Mantenimiento PC</span>
        </header>
        <main id="main" class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"></main>
      </div>
    </div>`);

  const sidebar = $('#sidebar');
  const backdrop = $('#backdrop');
  const toggle = (open) => {
    sidebar.classList.toggle('-translate-x-full', !open);
    backdrop.classList.toggle('hidden', !open);
  };
  $('#menu').addEventListener('click', () => toggle(true));
  backdrop.addEventListener('click', () => toggle(false));
  $$('[data-nav]').forEach((a) => a.addEventListener('click', () => toggle(false)));
  $('#logout').addEventListener('click', async () => {
    await api.post('/auth/logout').catch(() => {});
    state.user = null;
    location.hash = '#/';
    route();
  });
}

let renderId = 0;
async function route() {
  if (!state.user) {
    try { state.user = (await api.get('/auth/me')).user; } catch { /* sin sesión */ }
  }
  if (!state.user) {
    return loginView.render(app, { onLogin: (user) => { state.user = user; route(); } });
  }
  if (!$('#main')) layout();

  const { path, query } = parseHash();
  const main = $('#main');
  $$('[data-nav]').forEach((a) => {
    const href = a.getAttribute('href').slice(1);
    a.classList.toggle('active', href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
  });

  const match = ROUTES.find((r) => r.re.test(path));
  if (!match) { mount(main, html`<div class="card card-body text-center py-16"><h1>Página no encontrada</h1><a href="#/" class="btn-primary mt-4">Ir al panel</a></div>`); return; }
  if (!match.roles.includes(state.user.rol)) { mount(main, html`<div class="card card-body text-center py-16"><i class="fa-solid fa-lock text-4xl text-slate-300"></i><h1 class="mt-3">Acceso restringido</h1><p class="text-slate-500 mt-1">Tu rol no tiene acceso a esta sección.</p></div>`); return; }

  const params = Object.fromEntries(match.keys.map((k, i) => [k, path.match(match.re)[i + 1]]));
  const id = ++renderId;
  window.scrollTo(0, 0);
  try {
    await match.view(main, { params, query, user: state.user, navigate, isCurrent: () => id === renderId });
  } catch (e) {
    if (id !== renderId) return;
    if (e.status === 401) return;
    console.error(e);
    mount(main, html`<div class="card card-body text-center py-16"><i class="fa-solid fa-triangle-exclamation text-4xl text-red-300"></i><h1 class="mt-3">No se pudo cargar</h1><p class="text-slate-500 mt-1">${e.message}</p></div>`);
  }
}

setUnauthorizedHandler(() => {
  if (state.user) { state.user = null; toast('Tu sesión expiró. Vuelve a iniciar sesión.', 'error'); route(); }
});
window.addEventListener('hashchange', route);
route();
