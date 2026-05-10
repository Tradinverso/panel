import { auth, authErrorMsg } from '../auth.js';

export function loginView(container) {
  container.innerHTML = `
    <div class="auth-card">
      <div class="auth-brand">
        <img src="assets/logo.png" alt="Tradinverso" class="auth-logo-img"
             onerror="this.style.display='none';document.getElementById('logoFallback').style.display='flex';">
        <div id="logoFallback" style="display:none;flex-direction:column;align-items:center;gap:12px;">
          <div class="auth-logo">T</div>
          <div class="auth-tagline">Journaling</div>
          <div class="auth-title">Tradinverso</div>
        </div>
      </div>
      <form class="auth-form" id="loginForm" autocomplete="on">
        <input class="form-input" type="email" id="email" placeholder="Email" required autocomplete="email">
        <input class="form-input" type="password" id="password" placeholder="Contraseña" required autocomplete="current-password">
        <div id="error" style="display:none;" class="auth-error"></div>
        <button class="btn primary" type="submit" id="submitBtn">Entrar</button>
      </form>
      <div class="auth-help">
        ¿Has olvidado la contraseña?<br>
        Contacta con tu admin de la academia para restablecerla.
      </div>
    </div>
  `;

  const form = container.querySelector('#loginForm');
  const errorEl = container.querySelector('#error');
  const submitBtn = container.querySelector('#submitBtn');
  const emailEl = container.querySelector('#email');
  const passwordEl = container.querySelector('#password');

  emailEl.focus();

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = emailEl.value.trim();
    const password = passwordEl.value;
    if (!email || !password) return;

    errorEl.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-sm"></span> Entrando…';

    try {
      await auth.signIn(email, password);
    } catch (err) {
      errorEl.textContent = '⚠ ' + authErrorMsg(err);
      errorEl.style.display = 'flex';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Entrar';
      passwordEl.focus();
      passwordEl.select();
    }
  });
}
