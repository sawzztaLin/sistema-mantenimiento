import { api } from '../api.js';
import { html, mount, $ } from '../ui.js';

export function render(app, { onLogin }) {
  mount(app, html`
    <div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-700 to-indigo-900 p-4">
      <div class="card w-full max-w-sm">
        <div class="card-body p-8">
          <div class="mb-6 text-center">
            <div class="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
              <i class="fa-solid fa-laptop-medical text-2xl"></i>
            </div>
            <h1 class="text-xl">Sistema de Mantenimiento</h1>
            <p class="mt-1 text-sm text-slate-500">Equipos de cómputo</p>
          </div>
          <form id="login" class="space-y-4" novalidate>
            <div>
              <label for="email">Correo electrónico</label>
              <input id="email" name="email" type="email" class="input" autocomplete="username" required autofocus>
            </div>
            <div>
              <label for="password">Contraseña</label>
              <input id="password" name="password" type="password" class="input" autocomplete="current-password" required>
            </div>
            <p id="err" class="hidden rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert"></p>
            <button type="submit" class="btn-primary w-full py-2.5">Iniciar sesión</button>
          </form>
        </div>
      </div>
    </div>`);

  const form = $('#login', app);
  $('#email', app).focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#err', app);
    const btn = $('[type=submit]', form);
    err.classList.add('hidden');
    btn.disabled = true;
    try {
      const { user } = await api.post('/auth/login', { email: form.email.value, password: form.password.value });
      onLogin(user);
    } catch (ex) {
      err.textContent = ex.details?.email ? 'Escribe un correo válido.' : ex.message;
      err.classList.remove('hidden');
      btn.disabled = false;
    }
  });
}
