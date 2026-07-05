import { state } from '../state.js';
import { storage } from '../storage.js';
import { theme } from '../theme.js';
import { auth, authErrorMsg } from '../auth.js';
import { sync } from '../sync.js';
import { downloadFile, toCsv } from '../utils/csv.js';
import { openModal } from '../components/modal.js';
import { router } from '../router.js';
import { IMPORT_HEADERS } from '../utils/sheet-parsers.js';
import { formatDateEs } from '../utils/date-helpers.js';

export function settingsView(container) {
  const inViewAs = !!state.viewAsUid;
  const viewedProfile = state.viewAsProfile;
  const url = storage.getAppsScriptUrl();
  const tradeCount = state.trades.length;
  const countSheet = sheet => state.trades.filter(t => t.sheet === sheet).length;
  const profile = auth.profile || {};

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
          <div class="setting-desc">Modo oscuro o claro. También se puede cambiar desde la barra lateral.</div>
        </div>
        <div class="setting-control">
          <select class="select" id="themeSel">
            <option value="dark"  ${theme.current() === 'dark'  ? 'selected' : ''}>Oscuro</option>
            <option value="light" ${theme.current() === 'light' ? 'selected' : ''}>Claro</option>
          </select>
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

  const urlInput = container.querySelector('#urlInput');
  if (urlInput) urlInput.addEventListener('change', e => storage.setAppsScriptUrl(e.target.value.trim()));

  const themeSel = container.querySelector('#themeSel');
  if (themeSel) themeSel.addEventListener('change', e => theme.apply(e.target.value));

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

// ─────────────────────────────────────────────────────────────
// Exportador CSV por estrategia
// ─────────────────────────────────────────────────────────────

const DAYS_FULL_ES = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

function tradesToCsv(sheet, trades) {
  const headers = IMPORT_HEADERS[sheet];
  const sorted = [...trades].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.open_hour || 0) - (b.open_hour || 0);
  });
  const headerRow = headers.map(h => h.label);
  const rows = sorted.map((t, i) => headers.map(h => formatCell(h.key, t, i + 1, sheet)));
  return toCsv([headerRow, ...rows]);
}

function formatCell(key, t, idx, sheet) {
  switch (key) {
    case 'idx':
    case 'trade':   return String(idx);
    case 'pair':    return sheet === 'NASDAQ' ? '' : (t.pair || '');
    case 'setup':   return t.setup || '';
    case 'date':    return formatDateEs(t.date) || '';
    case 'dia':     return dayOfWeekFullEs(t.date);
    case 'open':    return t.open_str || '';
    case 'close':   return t.close_str || '';
    case 'time':    return formatDuration(t.dur);
    case 'pips':
    case 'pip':
    case 'ticks':   return numEs(t.pips);
    case 'zone':    return Array.isArray(t.zone) ? t.zone.join(' · ') : (t.zone || '');
    case 'rr':      return numEs(t.rr);
    case 'entry':   return Array.isArray(t.entry) ? t.entry.join(' · ') : (t.entry || '');
    case 'pct':     return pctEs(t.pnl_pct);
    case 'res':     return t.result || '';
    case 'sens':    return t.sensacion || '';
    case 'url1':    return t.url1 || '';
    case 'url2':    return t.url2 || '';
    case 'reflex':  return t.reflexion || '';
    // Columnas calc del Sheet (BALANCE, DD, etc.) — se exportan vacías
    // para preservar el alineamiento de columnas con la hoja original.
    default:        return '';
  }
}

function dayOfWeekFullEs(yyyy_mm_dd) {
  if (!yyyy_mm_dd) return '';
  const d = new Date(yyyy_mm_dd);
  if (isNaN(d.getTime())) return '';
  return DAYS_FULL_ES[d.getDay()];
}

function formatDuration(min) {
  if (min == null || isNaN(min)) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function numEs(v) {
  if (v == null || isNaN(v)) return '';
  return String(v).replace('.', ',');
}

function pctEs(v) {
  if (v == null || isNaN(v)) return '';
  return v.toFixed(2).replace('.', ',') + '%';
}

function stampNow() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 32) || 'usuario';
}

// ─────────────────────────────────────────────────────────────
// Exportador XLSX (3 pestañas en un solo archivo)
// SheetJS se carga bajo demanda — solo la primera vez que el usuario
// pulsa "Descargar Excel", no en cada arranque de la app.
// ─────────────────────────────────────────────────────────────

const SHEETJS_CDN = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';

async function loadSheetJS() {
  if (window.XLSX) return window.XLSX;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SHEETJS_CDN;
    s.onload = () => window.XLSX ? resolve() : reject(new Error('XLSX no se inicializó'));
    s.onerror = () => reject(new Error('No se pudo descargar SheetJS desde el CDN. Comprueba tu conexión.'));
    document.head.appendChild(s);
  });
  return window.XLSX;
}

async function exportXlsx(allTrades, filename) {
  const XLSX = await loadSheetJS();
  const wb = XLSX.utils.book_new();
  const tabName = { ZONAS: 'Zonas', LIQUIDEZ: 'Liquidez', NASDAQ: 'Nasdaq' };

  for (const sheet of ['ZONAS', 'LIQUIDEZ', 'NASDAQ']) {
    const sheetTrades = allTrades.filter(t => t.sheet === sheet);
    if (sheetTrades.length === 0) continue;
    const headers = IMPORT_HEADERS[sheet];
    const sorted = [...sheetTrades].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.open_hour || 0) - (b.open_hour || 0);
    });
    const aoa = [
      headers.map(h => h.label),
      ...sorted.map((t, i) => headers.map(h => formatCell(h.key, t, i + 1, sheet))),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Ancho de columnas razonable (autocálculo simple)
    ws['!cols'] = headers.map(h => ({
      wch: Math.max(h.label.length + 2, 8),
    }));
    XLSX.utils.book_append_sheet(wb, ws, tabName[sheet]);
  }

  XLSX.writeFile(wb, filename);
}
