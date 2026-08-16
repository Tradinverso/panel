import { state } from '../state.js';
import { storage } from '../storage.js';
import { theme } from '../theme.js';
import { auth, authErrorMsg } from '../auth.js';
import { sync } from '../sync.js';
import { downloadFile } from '../utils/csv.js';
import { openModal, closeModal } from '../components/modal.js';
import { router } from '../router.js';
import { stampNow, slug, exportXlsx } from '../utils/sheet-export.js';
import { TIMEZONES, tzLabel, guessTz } from '../utils/timezone.js';
import { ajustesTabs } from '../components/ajustes-tabs.js';
import { icon } from '../components/icons.js';
import { renderSidebar } from '../components/sidebar.js';

export function settingsView(container) {
  const inViewAs = !!state.viewAsUid;
  const viewedProfile = state.viewAsProfile;
  const url = storage.getAppsScriptUrl();
  const tradeCount = state.trades.length;
  const countSheet = sheet => state.trades.filter(t => t.sheet === sheet).length;
  const profile = auth.profile || {};
  const currentTz = auth.timezone();

  // Personal sections (Mi cuenta, URL, Tema) solo se muestran cuando NO estás
  // viendo como otro alumno. En viewAs solo se muestra Mantenimiento (acciones
  // sobre la cuenta del alumno).
  const personalSections = inViewAs ? '' : `
    <div class="section-title">Mi cuenta</div>
    <div class="card">
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Email</div>
          <div class="setting-desc">Tu identificador de acceso. No se puede cambiar.</div>
        </div>
        <div class="setting-control" style="font-family:var(--mono);font-size:12px;color:var(--muted);">
          ${escapeHtml(profile.email || '')}
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Nombre para mostrar</div>
          <div class="setting-desc">Aparece en el header del Dashboard y en la barra lateral.</div>
        </div>
        <div class="setting-control" style="display:flex;gap:8px;">
          <input class="form-input" type="text" id="nameInput" value="${escapeHtml(profile.nombre || '')}" placeholder="Tu nombre" style="flex:1;">
          <button class="btn primary" id="saveName">Guardar</button>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Contraseña</div>
          <div class="setting-desc">Cambia tu contraseña de acceso.</div>
        </div>
        <div class="setting-control" style="display:flex;justify-content:flex-end;">
          <button class="btn" id="changePwBtn">Cambiar contraseña</button>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Cerrar sesión</div>
          <div class="setting-desc">Sal de tu cuenta en este dispositivo. Tus datos siguen guardados en la nube.</div>
        </div>
        <div class="setting-control" style="display:flex;justify-content:flex-end;">
          <button class="btn" id="logoutBtn" style="color:var(--red);">Cerrar sesión</button>
        </div>
      </div>
    </div>

    <div class="section-title">Conexión con Apps Script</div>
    <div class="card">
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">URL del Apps Script</div>
          <div class="setting-desc">Endpoint público que devuelve tus trades en JSON. Se usa para reimportar.</div>
        </div>
        <div class="setting-control">
          <input class="form-input" type="url" id="urlInput" value="${escapeHtml(url)}" placeholder="https://script.google.com/macros/s/.../exec">
        </div>
      </div>
    </div>

    <div class="section-title">Apariencia</div>
    <div class="card">
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Tema</div>
          <div class="setting-desc">Modo oscuro o claro. También se cambia con el sol/luna de la barra lateral.</div>
        </div>
        <div class="setting-control">
          <div class="segmented" id="themeSeg" role="group" aria-label="Tema">
            <button type="button" class="seg-btn ${theme.current() === 'dark' ? 'active' : ''}" data-theme="dark"><span class="seg-ic">${icon('luna')}</span>Oscuro</button>
            <button type="button" class="seg-btn ${theme.current() === 'light' ? 'active' : ''}" data-theme="light"><span class="seg-ic">${icon('sol')}</span>Claro</button>
          </div>
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Noticias · calendario económico</div>
          <div class="setting-desc">Qué web abre el acceso <strong>Noticias</strong> de la barra lateral.</div>
        </div>
        <div class="setting-control">
          <select class="select" id="newsSel">
            <option value="investing"    ${storage.getNewsSource() === 'investing'    ? 'selected' : ''}>Investing.com</option>
            <option value="forexfactory" ${storage.getNewsSource() === 'forexfactory' ? 'selected' : ''}>ForexFactory</option>
          </select>
        </div>
      </div>
    </div>

    <div class="section-title">Zona horaria</div>
    <div class="card">
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Tu zona horaria</div>
          <div class="setting-desc">
            Metes los trades en <strong>tu hora local</strong> y las estadísticas por hora se muestran en tu horario.
            Tu profesor verá tus horas convertidas automáticamente a la suya.
            ${!auth.hasTimezone() ? `<br><span style="color:var(--orange);">⚠ Sin configurar. Detectada: <strong>${escapeHtml(guessTz())}</strong> — confírmala para que tus horas cuadren.</span>` : ''}
          </div>
        </div>
        <div class="setting-control" style="display:flex;gap:8px;">
          <select class="select" id="tzSel" style="flex:1;">
            ${TIMEZONES.map(t => `<option value="${escapeHtml(t.tz)}" ${currentTz === t.tz ? 'selected' : ''}>${escapeHtml(tzLabel(t.tz))}</option>`).join('')}
            ${TIMEZONES.some(t => t.tz === currentTz) ? '' : `<option value="${escapeHtml(currentTz)}" selected>${escapeHtml(tzLabel(currentTz))}</option>`}
          </select>
          <button class="btn primary" id="saveTzBtn">Guardar</button>
        </div>
      </div>
    </div>

    <div class="section-title">Módulos</div>
    <div class="card">
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Gestión de riesgo / rotación</div>
          <div class="setting-desc">Añade la sección <strong>Riesgo</strong> en la barra lateral: escalado de riesgo por niveles según el drawdown y rotación entre cuentas. Lee de tus cuentas y trades, no añade datos.</div>
        </div>
        <div class="setting-control">
          <select class="select" id="riskModuleSel">
            <option value="on"  ${state.config.riskModuleEnabled === false ? '' : 'selected'}>Activado</option>
            <option value="off" ${state.config.riskModuleEnabled === false ? 'selected' : ''}>Desactivado</option>
          </select>
        </div>
      </div>
    </div>
  `;

  const adminBanner = inViewAs && viewedProfile ? `
    <div class="imp-banner" style="margin-bottom:20px;">
      <div class="imp-banner-icon">📝</div>
      <div class="imp-banner-text">
        Acciones sobre <strong>${escapeHtml(viewedProfile.nombre || viewedProfile.email)}</strong>
        <span class="meta">cualquier borrado afecta a SU cuenta, no a la tuya</span>
      </div>
    </div>
  ` : '';

  container.innerHTML = `
    ${ajustesTabs('ajustes')}
    <div class="page-header">
      <div>
        <h1>Ajustes</h1>
        <div class="sub">${inViewAs ? `Cuenta de ${escapeHtml(viewedProfile?.nombre || 'alumno')}` : `Configuración de la app`} · ${tradeCount} trades almacenados</div>
      </div>
    </div>

    ${adminBanner}
    ${personalSections}

    <div class="section-title">Copia de seguridad</div>
    <div class="card">
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Excel completo (.xlsx)</div>
          <div class="setting-desc">
            Archivo Excel con <strong>3 pestañas</strong> (Zonas · Liquidez · Nasdaq), cada una con sus columnas y todos tus trades.
            Se abre directamente en Excel o Google Sheets. Mismo orden de columnas que tu hoja original.
          </div>
        </div>
        <div class="setting-control" style="display:flex;justify-content:flex-end;">
          <button class="btn primary" id="exportXlsxBtn" ${tradeCount === 0 ? 'disabled' : ''}>📊 Descargar Excel (${tradeCount})</button>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Backup completo (JSON)</div>
          <div class="setting-desc">
            Archivo JSON con <strong>todos tus datos</strong>: trades, cuentas, reflexiones de psicología y perfiles de riesgo.
            Para restaurar, súbelo desde <strong>Importar → Subir archivo</strong>.
          </div>
        </div>
        <div class="setting-control" style="display:flex;justify-content:flex-end;">
          <button class="btn" id="exportBtn">📥 Descargar backup</button>
        </div>
      </div>
    </div>

    <div class="section-title">Mantenimiento</div>
    <div class="card">
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Borrar trades por estrategia</div>
          <div class="setting-desc">Elimina solo los trades de una estrategia. Útil para reimportar desde cero.</div>
        </div>
        <div class="setting-control" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
          <button class="btn danger" data-wipe-sheet="ZONAS">Zonas (${countSheet('ZONAS')})</button>
          <button class="btn danger" data-wipe-sheet="LIQUIDEZ">Liquidez (${countSheet('LIQUIDEZ')})</button>
          <button class="btn danger" data-wipe-sheet="NASDAQ">Nasdaq (${countSheet('NASDAQ')})</button>
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Borrar todos los datos</div>
          <div class="setting-desc">Elimina todos tus trades de la nube. Esta acción no se puede deshacer.</div>
        </div>
        <div class="setting-control" style="display:flex;justify-content:flex-end;">
          <button class="btn danger" id="wipeBtn">Borrar todo</button>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="card-title">Sobre Tradinverso</div>
      <div class="card-sub">Trading journal en la nube · datos sincronizados con Firebase</div>
      <p style="font-size:12px;color:var(--muted);line-height:1.6;margin-top:12px;">
        Toda la operativa se mide en porcentajes. Los importes monetarios reales se asignarán
        más adelante por cuenta en la sección de gestión de cuentas. Tus datos viven en tu cuenta
        de Firestore y son privados — solo el admin de la academia puede verlos.
      </p>
    </div>
  `;

  // ── Wire (solo si los elementos existen — en viewAs no hay sección personal) ──
  const saveNameBtn = container.querySelector('#saveName');
  if (saveNameBtn) {
    saveNameBtn.addEventListener('click', async () => {
      const v = container.querySelector('#nameInput').value.trim();
      if (!v) return;
      try {
        await auth.updateName(v);
        flashOk(container, 'Nombre actualizado');
      } catch (e) {
        flashErr(container, 'Error: ' + (e.message || e));
      }
    });
  }

  const changePwBtn = container.querySelector('#changePwBtn');
  if (changePwBtn) changePwBtn.addEventListener('click', () => openChangePwModal());

  const logoutBtn = container.querySelector('#logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', async () => {
    try { await auth.signOut(); } catch (e) { console.error(e); }
  });

  const urlInput = container.querySelector('#urlInput');
  if (urlInput) urlInput.addEventListener('change', e => storage.setAppsScriptUrl(e.target.value.trim()));

  const themeSeg = container.querySelector('#themeSeg');
  if (themeSeg) themeSeg.addEventListener('click', e => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    theme.apply(btn.dataset.theme);
    // Re-render de la vista (marca el botón activo) + sidebar vía router.onChange.
    // También repinta los charts de otras vistas si se vuelve a ellas.
    // Cerrar cualquier modal abierto antes: quedaría huérfano tras el reload.
    closeModal();
    router.reload();
  });

  const newsSel = container.querySelector('#newsSel');
  if (newsSel) newsSel.addEventListener('change', e => {
    storage.setNewsSource(e.target.value);
    renderSidebar(document.getElementById('sidebar'));  // el acceso "Noticias" apunta a la nueva web
    flashOk(container, e.target.value === 'forexfactory' ? 'Noticias: ForexFactory' : 'Noticias: Investing.com');
  });

  const saveTzBtn = container.querySelector('#saveTzBtn');
  if (saveTzBtn) saveTzBtn.addEventListener('click', async () => {
    const sel = container.querySelector('#tzSel');
    if (!sel) return;
    const tz = sel.value;
    saveTzBtn.disabled = true;
    try {
      await auth.updateTimezone(tz);
      flashOk(container, 'Zona horaria guardada: ' + tzLabel(tz));
    } catch (e) {
      // Antes esto solo iba a la consola: si fallaba, parecía que "no confirmaba".
      flashErr(container, 'Error guardando la zona horaria: ' + (e.message || e));
    } finally {
      saveTzBtn.disabled = false;
    }
  });

  const riskSel = container.querySelector('#riskModuleSel');
  if (riskSel) riskSel.addEventListener('change', e => {
    state.setConfig({ riskModuleEnabled: e.target.value === 'on' });
    flashOk(container, e.target.value === 'on' ? 'Módulo de riesgo activado' : 'Módulo de riesgo desactivado');
  });

  container.querySelector('#exportBtn').addEventListener('click', () => {
    const data = {
      version: 2,
      exportedAt: new Date().toISOString(),
      exportedBy: profile?.email || auth.currentUser?.email || 'unknown',
      trades: state.trades,
      backtests: state.backtests,
      cuentas: state.cuentas,
      reflections: state.reflections,
      perfiles: state.perfiles,
      config: state.config,
      tradingPlan: state.tradingPlan,
    };
    const stamp = stampNow();
    const userPart = inViewAs && viewedProfile
      ? slug(viewedProfile.nombre || viewedProfile.email)
      : slug(profile.nombre || profile.email || 'tradinverso');
    downloadFile(`tradinverso-backup-${userPart}-${stamp}.json`, JSON.stringify(data, null, 2), 'application/json');
  });

  // Exportar Excel (.xlsx) con 3 pestañas
  const xlsxBtn = container.querySelector('#exportXlsxBtn');
  if (xlsxBtn) {
    xlsxBtn.addEventListener('click', async () => {
      if (state.trades.length === 0) return;
      const originalText = xlsxBtn.textContent;
      xlsxBtn.disabled = true;
      xlsxBtn.innerHTML = '<span class="spinner-sm"></span> Generando…';
      try {
        const userPart = inViewAs && viewedProfile
          ? slug(viewedProfile.nombre || viewedProfile.email)
          : slug(profile.nombre || profile.email || 'tradinverso');
        const filename = `tradinverso-${userPart}-${stampNow()}.xlsx`;
        await exportXlsx(state.trades, filename);
      } catch (e) {
        console.error('Export XLSX falló:', e);
        flashErr(container, 'Error generando Excel: ' + (e.message || e));
      } finally {
        xlsxBtn.disabled = false;
        xlsxBtn.textContent = originalText;
      }
    });
  }

  container.querySelector('#wipeBtn').addEventListener('click', () => {
    const targetUid = state.viewAsUid || auth.uid();
    const targetLabel = inViewAs && viewedProfile
      ? `de la cuenta de <strong>${escapeHtml(viewedProfile.nombre || viewedProfile.email)}</strong>`
      : 'de tu cuenta en la nube';
    openModal({
      title: 'Borrar todos los datos',
      body: `Vas a eliminar <strong>${state.trades.length} trades</strong> ${targetLabel}.
             Esta acción <strong>no se puede deshacer</strong>. ¿Continuar?`,
      actions: [
        { label: 'Cancelar', onClick: close => close() },
        { label: 'Sí, borrar todo', variant: 'danger', onClick: async close => {
          try {
            await sync.wipeAllTrades(targetUid);
            state.trades = [];
            state.emit();
          } catch (e) { console.error(e); }
          close();
          router.go('#/dashboard');
        } },
      ],
    });
  });

  container.querySelectorAll('[data-wipe-sheet]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sheet = btn.dataset.wipeSheet;
      const n = countSheet(sheet);
      if (!n) return;
      openModal({
        title: `Borrar trades de ${sheet}`,
        body: `Vas a eliminar <strong>${n} trades</strong> de la estrategia ${sheet} de tu cuenta. Las demás estrategias no se ven afectadas. ¿Continuar?`,
        actions: [
          { label: 'Cancelar', onClick: close => close() },
          { label: `Sí, borrar ${n}`, variant: 'danger', onClick: close => {
            const removed = state.removeBySheet(sheet);
            close();
            openModal({
              title: 'Borrado',
              body: `<strong>${removed}</strong> trades de ${sheet} eliminados.`,
              actions: [{ label: 'Cerrar', onClick: c => { c(); settingsView(container); } }],
            });
          } },
        ],
      });
    });
  });
}

function openChangePwModal() {
  openModal({
    title: 'Cambiar contraseña',
    body: `
      <div class="form" style="max-width:none;">
        <div class="form-field">
          <label class="form-label">Nueva contraseña <span class="required">*</span></label>
          <input class="form-input" type="password" id="newPw" placeholder="Mínimo 6 caracteres" autocomplete="new-password">
        </div>
        <div class="form-field">
          <label class="form-label">Repetir contraseña <span class="required">*</span></label>
          <input class="form-input" type="password" id="newPw2" placeholder="Repite la contraseña" autocomplete="new-password">
        </div>
        <div id="pwErr" class="auth-error" style="display:none;"></div>
        <div style="font-size:11px;color:var(--muted);font-family:var(--mono);">
          Si te sale "vuelve a iniciar sesión", cierra sesión y vuelve a entrar. Firebase requiere autenticación reciente para cambios de contraseña.
        </div>
      </div>
    `,
    actions: [
      { label: 'Cancelar', onClick: close => close() },
      {
        label: 'Cambiar contraseña',
        variant: 'primary',
        onClick: async close => {
          const root = document.getElementById('modal-root');
          const a = root.querySelector('#newPw').value;
          const b = root.querySelector('#newPw2').value;
          const err = root.querySelector('#pwErr');
          err.style.display = 'none';
          if (a.length < 6) { err.textContent = '⚠ La contraseña debe tener al menos 6 caracteres'; err.style.display = 'flex'; return; }
          if (a !== b) { err.textContent = '⚠ Las contraseñas no coinciden'; err.style.display = 'flex'; return; }
          try {
            await auth.changePassword(a);
            close();
            openModal({
              title: 'Contraseña actualizada',
              body: 'Tu contraseña se ha cambiado correctamente.',
              actions: [{ label: 'Cerrar', variant: 'primary', onClick: c => c() }],
            });
          } catch (e) {
            err.textContent = '⚠ ' + authErrorMsg(e);
            err.style.display = 'flex';
          }
        },
      },
    ],
  });
}

function flashOk(container, msg) {
  flash(container, msg, 'ok');
}
function flashErr(container, msg) {
  flash(container, msg, 'err');
}
function flash(container, msg, type) {
  const ex = container.querySelector('.flash');
  if (ex) ex.remove();
  const el = document.createElement('div');
  el.className = 'flash import-result ' + type;
  el.textContent = msg;
  el.style.position = 'fixed';
  el.style.bottom = '20px';
  el.style.right = '20px';
  el.style.zIndex = '9999';
  el.style.maxWidth = '320px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
