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
        <a href="#" id="forgotLink">¿Has olvidado la contraseña?</a>
      </div>

      <form class="auth-form" id="resetForm" style="display:none;" autocomplete="on">
        <div class="auth-tagline" style="margin-bottom:4px;">Recuperar contraseña</div>
        <div style="font-size:13px;opacity:.75;margin-bottom:8px;">
          Te enviaremos un email con un enlace para restablecerla.
        </div>
        <input class="form-input" type="email" id="resetEmail" placeholder="Email" required autocomplete="email">
        <div id="resetMsg" style="display:none;" class="auth-error"></div>
        <button class="btn primary" type="submit" id="resetBtn">Enviar email</button>
        <a href="#" id="backToLogin" style="text-align:center;font-size:13px;">Volver a iniciar sesión</a>
      </form>
    </div>
  `;

  const form = container.querySelector('#loginForm');
  const errorEl = container.querySelector('#error');
  const submitBtn = container.querySelector('#submitBtn');
  const emailEl = container.querySelector('#email');
  const passwordEl = container.querySelector('#password');
  const helpEl = container.querySelector('.auth-help');
  const forgotLink = container.querySelector('#forgotLink');

  const resetForm = container.querySelector('#resetForm');
  const resetEmailEl = container.querySelector('#resetEmail');
  const resetMsgEl = container.querySelector('#resetMsg');
  const resetBtn = container.querySelector('#resetBtn');
  const backToLogin = container.querySelector('#backToLogin');

  emailEl.focus();

  // Si auth.init expulsó al usuario por cuenta bloqueada, mostrar el aviso.
  if (auth._blockedNotice) {
    errorEl.textContent = '⚠ ' + auth._blockedNotice;
    errorEl.style.display = 'flex';
    auth._blockedNotice = null;
  }

  function showLogin() {
    resetForm.style.display = 'none';
    form.style.display = '';
    helpEl.style.display = '';
    resetMsgEl.style.display = 'none';
    emailEl.focus();
  }

  function showReset() {
    form.style.display = 'none';
    helpEl.style.display = 'none';
    resetForm.style.display = '';
    resetMsgEl.style.display = 'none';
    resetMsgEl.classList.remove('auth-success');
    resetEmailEl.value = emailEl.value.trim();
    resetEmailEl.focus();
  }

  forgotLink.addEventListener('click', e => {
    e.preventDefault();
    showReset();
  });

  backToLogin.addEventListener('click', e => {
    e.preventDefault();
    showLogin();
  });

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

  resetForm.addEventListener('submit', async e => {
    e.preventDefault();
    const email = resetEmailEl.value.trim();
    if (!email) return;

    resetMsgEl.style.display = 'none';
    resetMsgEl.classList.remove('auth-success');
    resetBtn.disabled = true;
    resetBtn.innerHTML = '<span class="spinner-sm"></span> Enviando…';

    try {
      await auth.sendPasswordReset(email);
      resetMsgEl.textContent = '✓ Te hemos enviado un email a ' + email + '. Revisa tu bandeja (y la carpeta de spam).';
      resetMsgEl.classList.add('auth-success');
      resetMsgEl.style.display = 'flex';
      resetBtn.disabled = false;
      resetBtn.textContent = 'Enviar email';
    } catch (err) {
      resetMsgEl.textContent = '⚠ ' + authErrorMsg(err);
      resetMsgEl.style.display = 'flex';
      resetBtn.disabled = false;
      resetBtn.textContent = 'Enviar email';
    }
  });
}
