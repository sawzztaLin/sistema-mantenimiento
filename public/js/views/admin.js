import { api, qs } from '../api.js';
import {
  html, raw, mount, $, $$, loading, pageHeader, fecha, options, emptyState, toast, formData, showErrors, modal, confirmDialog,
  ROLES, CATEGORIAS_FALLA, TIPOS_MANT, badge,
} from '../ui.js';

// ---------------------------------------------------------------- Usuarios
export async function usuarios(main, { query, user, isCurrent }) {
  let rol = query.rol || '';

  mount(main, html`
    ${pageHeader('Usuarios', 'Administradores, técnicos y usuarios responsables de equipos.', html`<button id="nuevo" class="btn-primary"><i class="fa-solid fa-user-plus"></i>Nuevo usuario</button>`)}
    <div class="card">
      <div class="flex flex-wrap gap-3 border-b border-slate-200 p-4">
        <select id="rol" class="input w-56" aria-label="Rol">${options(Object.entries(ROLES), rol, { empty: 'Todos los roles' })}</select>
      </div>
      <div id="tabla">${loading()}</div>
    </div>`);

  const abrir = (u) => {
    const v = u || { rol: rol || 'usuario', activo: 1 };
    modal({
      title: u ? `Editar ${u.nombre}` : 'Nuevo usuario',
      body: html`
        <form class="grid grid-cols-1 gap-4 sm:grid-cols-2" novalidate>
          <div data-field class="sm:col-span-2"><label for="u-nombre">Nombre completo *</label><input id="u-nombre" name="nombre" class="input" value="${v.nombre}" maxlength="120" autofocus></div>
          <div data-field class="sm:col-span-2"><label for="u-email">Correo *</label><input id="u-email" name="email" type="email" class="input" value="${v.email}" autocomplete="off"></div>
          <div data-field><label for="u-rol">Rol *</label><select id="u-rol" name="rol" class="input">${options(Object.entries(ROLES), v.rol)}</select></div>
          <div data-field><label for="u-tel">Teléfono</label><input id="u-tel" name="telefono" class="input" value="${v.telefono}" maxlength="30"></div>
          <div data-field class="sm:col-span-2"><label for="u-esp">Especialidad (técnicos)</label><input id="u-esp" name="especialidad" class="input" value="${v.especialidad}" maxlength="120" placeholder="Hardware, redes, software…"></div>
          <div data-field class="sm:col-span-2"><label for="u-pass">${u ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña * (mínimo 8 caracteres)'}</label>
            <input id="u-pass" name="password" type="password" class="input" autocomplete="new-password"></div>
          <label class="m-0 flex items-center gap-2 font-normal sm:col-span-2"><input type="checkbox" name="activo" ${v.activo ? raw('checked') : ''}> Cuenta activa</label>
          <div class="flex justify-end gap-2 sm:col-span-2"><button type="button" class="btn-secondary" data-close>Cancelar</button><button type="submit" class="btn-primary">Guardar</button></div>
        </form>`,
      onSubmit: async (form, close) => {
        try {
          const data = formData(form);
          if (u) await api.put(`/usuarios/${u.id}`, data); else await api.post('/usuarios', data);
          close(); toast('Usuario guardado'); load();
        } catch (err) { showErrors(form, err); }
      },
    });
  };

  const load = async () => {
    history.replaceState(null, '', `#/usuarios${qs({ rol })}`);
    const rows = await api.get(`/usuarios${qs({ rol })}`);
    if (!isCurrent()) return;
    mount($('#tabla', main), rows.length ? html`
      <div class="overflow-x-auto"><table class="table">
        <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th class="hidden md:table-cell">Alta</th><th>Estado</th><th></th></tr></thead>
        <tbody>${rows.map((u) => html`
          <tr>
            <td class="font-medium">${u.nombre}${u.id === user.id ? html` <span class="text-xs text-slate-500">(tú)</span>` : ''}<div class="text-xs text-slate-500">${u.especialidad || ''}</div></td>
            <td>${u.email}</td>
            <td>${ROLES[u.rol]}</td>
            <td class="hidden md:table-cell">${fecha(u.creado_en)}</td>
            <td>${u.activo ? html`<span class="badge bg-green-100 text-green-800">Activo</span>` : html`<span class="badge bg-slate-200 text-slate-700">Inactivo</span>`}</td>
            <td class="text-right"><button class="btn-ghost" data-edit="${u.id}" aria-label="Editar ${u.nombre}"><i class="fa-solid fa-pen"></i></button></td>
          </tr>`)}</tbody></table></div>` : emptyState('fa-users', 'No hay usuarios con ese rol.'));
    $$('[data-edit]', main).forEach((b) => b.addEventListener('click', () => abrir(rows.find((u) => String(u.id) === b.dataset.edit))));
  };

  $('#rol', main).addEventListener('change', (e) => { rol = e.target.value; load(); });
  $('#nuevo', main).addEventListener('click', () => abrir());
  await load();
}

// ---------------------------------------------------------------- Catálogos
const CATALOGOS = {
  actividades: {
    titulo: 'Actividades de mantenimiento',
    desc: 'Lo que el técnico puede marcar como realizado.',
    cols: [['Actividad', (r) => r.nombre], ['Tipo', (r) => badge(TIPOS_MANT, r.tipo)]],
    fields: (v) => html`
      <div data-field><label for="c-nombre">Nombre *</label><input id="c-nombre" name="nombre" class="input" value="${v.nombre}" maxlength="120" autofocus></div>
      <div data-field><label for="c-tipo">Tipo *</label><select id="c-tipo" name="tipo" class="input">${options(Object.entries(TIPOS_MANT).map(([k, t]) => [k, t.label]), v.tipo || 'preventivo')}</select></div>`,
    hasActivo: true,
  },
  fallas: {
    titulo: 'Catálogo de fallas',
    desc: 'Se usa para identificar las fallas más comunes.',
    cols: [['Falla', (r) => r.nombre], ['Categoría', (r) => CATEGORIAS_FALLA[r.categoria]]],
    fields: (v) => html`
      <div data-field><label for="c-nombre">Nombre *</label><input id="c-nombre" name="nombre" class="input" value="${v.nombre}" maxlength="120" autofocus></div>
      <div data-field><label for="c-cat">Categoría *</label><select id="c-cat" name="categoria" class="input">${options(Object.entries(CATEGORIAS_FALLA), v.categoria || 'hardware')}</select></div>`,
    hasActivo: true,
  },
  ubicaciones: {
    titulo: 'Ubicaciones',
    desc: 'Áreas, laboratorios u oficinas donde están los equipos.',
    cols: [['Ubicación', (r) => r.nombre], ['Descripción', (r) => r.descripcion || '—']],
    fields: (v) => html`
      <div data-field><label for="c-nombre">Nombre *</label><input id="c-nombre" name="nombre" class="input" value="${v.nombre}" maxlength="120" autofocus></div>
      <div data-field><label for="c-desc">Descripción</label><input id="c-desc" name="descripcion" class="input" value="${v.descripcion}" maxlength="255"></div>`,
    hasActivo: false,
  },
};

export async function catalogos(main, { query, isCurrent }) {
  let tab = CATALOGOS[query.tab] ? query.tab : 'actividades';

  mount(main, html`
    ${pageHeader('Catálogos', 'Datos de referencia que usan los formularios y reportes.')}
    <div class="mb-4 flex flex-wrap gap-2 border-b border-slate-200" role="tablist">
      ${Object.entries(CATALOGOS).map(([k, c]) => html`<button data-tab="${k}" role="tab" class="-mb-px border-b-2 px-3 py-2 text-sm font-semibold">${c.titulo}</button>`)}
    </div>
    <div id="cont"></div>`);

  const load = async () => {
    history.replaceState(null, '', `#/catalogos${qs({ tab })}`);
    $$('[data-tab]', main).forEach((b) => {
      const on = b.dataset.tab === tab;
      b.className = `-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${on ? 'border-blue-700 text-blue-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`;
      b.setAttribute('aria-selected', on);
    });
    const c = CATALOGOS[tab];
    const rows = await api.get(`/catalogos/${tab}`);
    if (!isCurrent()) return;
    mount($('#cont', main), html`
      <div class="card">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <p class="text-sm text-slate-500">${c.desc}</p>
          <button id="nuevo" class="btn-primary btn-sm"><i class="fa-solid fa-plus"></i>Agregar</button>
        </div>
        ${rows.length ? html`<div class="overflow-x-auto"><table class="table">
          <thead><tr>${c.cols.map(([h]) => html`<th>${h}</th>`)}${c.hasActivo ? html`<th>Estado</th>` : ''}<th></th></tr></thead>
          <tbody>${rows.map((r) => html`
            <tr class="${c.hasActivo && !r.activo ? 'opacity-60' : ''}">
              ${c.cols.map(([, fn]) => html`<td>${fn(r)}</td>`)}
              ${c.hasActivo ? html`<td>${r.activo ? html`<span class="badge bg-green-100 text-green-800">Activo</span>` : html`<span class="badge bg-slate-200 text-slate-700">Inactivo</span>`}</td>` : ''}
              <td class="whitespace-nowrap text-right">
                <button class="btn-ghost" data-edit="${r.id}" aria-label="Editar"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-ghost text-red-600" data-del="${r.id}" aria-label="Eliminar"><i class="fa-solid fa-trash"></i></button>
              </td>
            </tr>`)}</tbody></table></div>` : emptyState('fa-list', 'Sin registros.')}
      </div>`);

    const abrir = (r) => modal({
      title: r ? 'Editar registro' : 'Nuevo registro',
      body: html`<form class="space-y-4" novalidate>
        ${c.fields(r || {})}
        ${c.hasActivo ? html`<label class="m-0 flex items-center gap-2 font-normal"><input type="checkbox" name="activo" ${!r || r.activo ? raw('checked') : ''}> Activo (aparece en los formularios)</label>` : ''}
        <div class="flex justify-end gap-2"><button type="button" class="btn-secondary" data-close>Cancelar</button><button type="submit" class="btn-primary">Guardar</button></div>
      </form>`,
      onSubmit: async (form, close) => {
        try {
          const data = formData(form);
          if (r) await api.put(`/catalogos/${tab}/${r.id}`, data); else await api.post(`/catalogos/${tab}`, data);
          close(); toast('Guardado'); load();
        } catch (err) { showErrors(form, err); }
      },
    });
    $('#nuevo', main).addEventListener('click', () => abrir());
    $$('[data-edit]', main).forEach((b) => b.addEventListener('click', () => abrir(rows.find((r) => String(r.id) === b.dataset.edit))));
    $$('[data-del]', main).forEach((b) => b.addEventListener('click', async () => {
      const r = rows.find((x) => String(x.id) === b.dataset.del);
      if (!(await confirmDialog(`¿Eliminar "${r.nombre}"?`, { danger: true, ok: 'Eliminar' }))) return;
      try { await api.del(`/catalogos/${tab}/${r.id}`); toast('Eliminado'); load(); } catch (err) { toast(err.message, 'error'); }
    }));
  };

  $$('[data-tab]', main).forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; load(); }));
  await load();
}
