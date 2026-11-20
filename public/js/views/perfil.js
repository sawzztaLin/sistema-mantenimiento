import { api } from '../api.js';
import { html, mount, $, pageHeader, toast, formData, showErrors, ROLES } from '../ui.js';

export async function render(main, { user }) {
  mount(main, html`
    ${pageHeader('Mi perfil')}
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div class="card card-body">
        <h2 class="mb-4">Datos de la cuenta</h2>
        <dl class="space-y-3 text-sm">
          <div><dt class="text-slate-500">Nombre</dt><dd class="font-medium">${user.nombre}</dd></div>
          <div><dt class="text-slate-500">Correo</dt><dd class="font-medium">${user.email}</dd></div>
          <div><dt class="text-slate-500">Rol</dt><dd class="font-medium">${ROLES[user.rol]}</dd></div>
        </dl>
        <p class="mt-4 text-xs text-slate-500">Para cambiar tu nombre o correo, contacta al administrador del sistema.</p>
      </div>
      <form id="pass" class="card card-body space-y-4" novalidate>
        <h2>Cambiar contraseña</h2>
        <div data-field><label for="p-actual">Contraseña actual</label><input id="p-actual" name="actual" type="password" class="input" autocomplete="current-password"></div>
        <div data-field><label for="p-nueva">Nueva contraseña (mínimo 8 caracteres)</label><input id="p-nueva" name="nueva" type="password" class="input" autocomplete="new-password"></div>
        <div data-field><label for="p-conf">Confirmar nueva contraseña</label><input id="p-conf" name="confirmar" type="password" class="input" autocomplete="new-password"></div>
        <div class="flex justify-end"><button type="submit" class="btn-primary">Actualizar contraseña</button></div>
      </form>
    </div>`);

  const f = $('#pass', main);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(f);
    if (d.nueva !== d.confirmar) return showErrors(f, { message: 'Las contraseñas no coinciden', details: { confirmar: 'No coincide con la nueva contraseña' } });
    try {
      await api.put('/auth/password', { actual: d.actual, nueva: d.nueva });
      f.reset();
      toast('Contraseña actualizada');
    } catch (err) { showErrors(f, err); }
  });
}
