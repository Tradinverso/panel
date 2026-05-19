// Panel admin "Mis Alumnos". Lista alumnos con métricas, permite crear nuevos
// y entrar al dashboard de cada uno en modo solo-lectura.

import { auth, authErrorMsg } from '../auth.js';
import { sync } from '../sync.js';
import { state } from '../state.js';
import { router } from '../router.js';
import { winrate, pnlPct, pnlPctReal, currentSlStreak, tradeCounts } from '../utils/calculations.js';
import { fmtPct, fmtPctNoSign } from '../utils/number-format-es.js';
import { openModal, closeModal } from '../components/modal.js';
import {
  generateBackup, downloadBackup, getLastBackupDate, setLastBackupDate,
  daysSinceLastBackup, formatBackupDate,
  parseBackupFile, summarizeBackup, restoreBackup,
} from '../utils/backup.js';

let cache = null;
let cacheUid = null;
let searchQuery = '';

// Reset de cache cuando cambia el admin que usa la app (logout o cambio de cuenta).
auth.on(() => {
  if (auth.uid() !== cacheUid) {
    cache = null;
    cacheUid = auth.uid();
  }
});

export function adminView(container) {
  if (!auth.isAdmin()) {
    router.go('#/dashboard');
    return;
  }
  render(container);
}

async function render(container) {
  // Banner si actualmente estás viendo a un alumno
  const viewingNow = state.viewAsUid && state.viewAsProfile;
  const viewingBanner = viewingNow ? `
    <div class="imp-banner" style="margin-bottom:20px;">
      <div class="imp-banner-icon">📍</div>
      <div class="imp-banner-text">
        Actualmente estás viendo a <strong>${escapeHtml(state.viewAsProfile.nombre || state.viewAsProfile.email)}</strong>
        <span class="meta">cualquier cambio que hagas afecta a su cuenta</span>
      </div>
      <button class="btn" id="exitViewAsAdminBtn">↩ Volver a tu cuenta</button>
    </div>
  ` : '';

  const lastBackup = getLastBackupDate();
  const daysSince = daysSinceLastBackup();
  const showBackupWarn = daysSince >= 7;
  const backupTooltip = lastBackup ? `Último backup: ${formatBackupDate(lastBackup)}` : 'Aún no has hecho ningún backup';

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Mis Alumnos</h1>
        <div class="sub" id="adminSub">Cargando alumnos…</div>
      </div>
      <div class="page-actions">
        <button class="btn" id="backupBtn" title="${backupTooltip}">📥 Backup</button>
        <button class="btn" id="restoreBtn" title="Restaurar desde un archivo de backup">📂 Restaurar</button>
        <button class="btn" id="refreshBtn">↻ Refrescar</button>
        <button class="btn primary" id="newStudentBtn">+ Crear nuevo alumno</button>
      </div>
    </div>
    ${viewingBanner}
    ${showBackupWarn ? `
      <div class="backup-warn">
        ⚠ <strong>Backup pendiente</strong> — tu último backup fue ${lastBackup ? `hace ${daysSince} días (${formatBackupDate(lastBackup)})` : 'nunca'}.
        <button class="btn primary" id="backupBtnInline">Crear ahora</button>
      </div>
    ` : ''}
    <div id="studentsContent" class="card">
      <div class="loader"><div class="spinner"></div><div>Cargando alumnos…</div></div>
    </div>
  `;

  const exitBtn = container.querySelector('#exitViewAsAdminBtn');
  if (exitBtn) {
    exitBtn.addEventListener('click', async () => {
      await state.exitViewAs();
      render(container);
    });
  }

  container.querySelector('#refreshBtn').addEventListener('click', () => {
    cache = null;
    render(container);
  });
  container.querySelector('#newStudentBtn').addEventListener('click', () => {
    openCreateStudentModal(container);
  });

  // Backup handler (mismo handler para ambos botones: header + banner)
  async function runBackup() {
    const btnHeader = container.querySelector('#backupBtn');
    const btnInline = container.querySelector('#backupBtnInline');
    const setBtnText = (txt) => {
      if (btnHeader) btnHeader.textContent = txt;
      if (btnInline) btnInline.textContent = txt;
    };
    const setBtnDisabled = (b) => {
      if (btnHeader) btnHeader.disabled = b;
      if (btnInline) btnInline.disabled = b;
    };
    setBtnDisabled(true);
    setBtnText('Generando…');
    try {
      const data = await generateBackup((i, total) => {
        setBtnText(`Generando ${i}/${total}…`);
      });
      downloadBackup(data);
      setLastBackupDate();
      render(container);
    } catch (e) {
      console.error('Backup error:', e);
      alert('Error generando backup: ' + (e.message || String(e)));
      setBtnDisabled(false);
      setBtnText('📥 Backup');
    }
  }
  container.querySelector('#backupBtn').addEventListener('click', runBackup);
  const backupInline = container.querySelector('#backupBtnInline');
  if (backupInline) backupInline.addEventListener('click', runBackup);

  container.querySelector('#restoreBtn').addEventListener('click', () => openRestoreModal(container));

  try {
    if (!cache) cache = await sync.listStudents();
    paintStudents(container, cache);
  } catch (e) {
    container.querySelector('#studentsContent').innerHTML = `
      <div class="empty">
        <div class="big">⚠</div>
        <div>Error cargando alumnos: ${escapeHtml(e.message || String(e))}</div>
      </div>
    `;
  }
}

function paintStudents(container, students) {
  // Orden alfabético por nombre (cae a email si no hay nombre)
  const sorted = [...students].sort((a, b) => {
    const na = (a.profile?.nombre || a.profile?.email || '').toLowerCase();
    const nb = (b.profile?.nombre || b.profile?.email || '').toLowerCase();
    return na.localeCompare(nb, 'es');
  });

  // Filtra por búsqueda (nombre + email, case-insensitive)
  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? sorted.filter(s => {
        const n = (s.profile?.nombre || '').toLowerCase();
        const e = (s.profile?.email || '').toLowerCase();
        return n.includes(q) || e.includes(q);
      })
    : sorted;

  const sub = container.querySelector('#adminSub');
  if (sub) {
    sub.textContent = q
      ? `${filtered.length} de ${students.length} alumno${students.length !== 1 ? 's' : ''}`
      : `${students.length} alumno${students.length !== 1 ? 's' : ''}`;
  }

  const content = container.querySelector('#studentsContent');
  if (!students.length) {
    content.innerHTML = `
      <div class="empty">
        <div class="big">👥</div>
        <div>Aún no has dado de alta a ningún alumno.</div>
        <div style="margin-top:8px;font-size:11px;color:var(--muted);">Pulsa "Crear nuevo alumno" arriba para empezar.</div>
      </div>
    `;
    return;
  }

  content.innerHTML = `
    <div class="admin-search">
      <input type="search" id="adminSearch" class="form-input" placeholder="🔍 Buscar alumno por nombre o email…" value="${escAttr(searchQuery)}" autocomplete="off">
      ${q ? `<button class="btn ghost" id="adminSearchClear" title="Limpiar">×</button>` : ''}
    </div>
    ${filtered.length === 0
      ? `<div class="empty">Ningún alumno coincide con "${escapeHtml(searchQuery)}".</div>`
      : `<table class="data-table">
          <thead><tr>
            <th>Nombre</th>
            <th>Email</th>
            <th>Nivel</th>
            <th>Trades</th>
            <th>WR <span style="color:var(--muted);font-weight:400;">(global · estrategias)</span></th>
            <th>P&L acum. <span style="color:var(--muted);font-weight:400;">(sist · real)</span></th>
            <th>P&L mes</th>
            <th>SL</th>
            <th></th>
          </tr></thead>
          <tbody>
            ${filtered.map(s => row(s)).join('')}
          </tbody>
        </table>`}
  `;

  // Búsqueda en vivo (sin re-fetch, solo re-paint)
  const searchEl = content.querySelector('#adminSearch');
  if (searchEl) {
    searchEl.addEventListener('input', e => {
      searchQuery = e.target.value;
      paintStudents(container, students);
      // Mantener el foco en el input tras el re-render
      const newEl = container.querySelector('#adminSearch');
      if (newEl) {
        newEl.focus();
        // Restaurar la posición del cursor al final
        const len = newEl.value.length;
        newEl.setSelectionRange(len, len);
      }
    });
  }
  const clearEl = content.querySelector('#adminSearchClear');
  if (clearEl) {
    clearEl.addEventListener('click', () => {
      searchQuery = '';
      paintStudents(container, students);
    });
  }

  content.querySelectorAll('[data-view-uid]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid = btn.dataset.viewUid;
      const stu = students.find(s => s.uid === uid);
      if (!stu) return;
      try {
        await state.viewAs(uid, stu.profile);
        router.go('#/dashboard');
      } catch (e) {
        alert('Error: ' + (e.message || e));
      }
    });
  });

  // Cambio de nivel (Principiante / Intermedio / Avanzado / Sin asignar).
  content.querySelectorAll('[data-level-uid]').forEach(sel => {
    sel.addEventListener('change', async e => {
      const uid = sel.dataset.levelUid;
      const newLevel = e.target.value;
      const stu = students.find(s => s.uid === uid);
      if (!stu) return;
      try {
        await sync.updateProfile(uid, { level: newLevel });
        // Actualizar cache local del listado sin recargar
        stu.profile = { ...stu.profile, level: newLevel };
      } catch (err) {
        console.error('No se pudo actualizar el nivel:', err);
        alert('No se pudo guardar el nivel: ' + (err.message || err));
        // Revertir el select al valor anterior
        e.target.value = stu.profile?.level || '';
      }
    });
  });

  // Eliminar alumno (soft delete: marca profile.blocked).
  content.querySelectorAll('[data-delete-uid]').forEach(btn => {
    btn.addEventListener('click', () => {
      const uid = btn.dataset.deleteUid;
      const stu = students.find(s => s.uid === uid);
      if (!stu) return;
      openDeleteStudentModal(container, stu);
    });
  });
}

function escAttr(s) {
  return String(s == null ? '' : s).replace(/"/g, '&quot;');
}

function row(s) {
  const counts = tradeCounts(s.trades);
  const wr = winrate(s.trades);
  const pnl = pnlPct(s.trades);
  const pnlReal = pnlPctReal(s.trades);
  const streak = currentSlStreak(s.trades);

  // WR por estrategia (solo las que tienen trades)
  const stratBreakdown = ['ZONAS', 'LIQUIDEZ', 'NASDAQ']
    .map(sheet => {
      const sub = s.trades.filter(t => t.sheet === sheet);
      if (!sub.length) return null;
      return { letter: sheet[0], wr: winrate(sub) };
    })
    .filter(Boolean);
  const stratWrText = stratBreakdown.length
    ? stratBreakdown.map(x => {
        const c = x.wr >= 40 ? 'var(--green)' : 'var(--red)';
        return `<span style="color:${c}">${x.letter} ${x.wr.toFixed(0)}</span>`;
      }).join(' · ')
    : '';

  // P&L mes actual
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthTrades = s.trades.filter(t => (t.date || '').startsWith(ym));
  const pnlMonth = pnlPct(monthTrades);
  const pnlMonthColor = pnlMonth >= 0 ? 'var(--green)' : 'var(--red)';

  // Colores: WR ≥40 verde, <40 rojo
  const wrColor = wr >= 40 ? 'var(--green)' : 'var(--red)';
  const pnlColor = pnl >= 0 ? 'var(--green)' : 'var(--red)';
  const pnlRealColor = pnlReal >= 0 ? 'var(--green)' : 'var(--red)';
  const slColor = streak >= 3 ? 'var(--red)' : streak >= 1 ? 'var(--orange)' : 'var(--muted)';

  const isViewing = state.viewAsUid === s.uid;
  const trClass = isViewing ? ' style="background:var(--orange-bg);outline:2px solid var(--orange);outline-offset:-2px;"' : '';
  const nameCell = isViewing
    ? `<strong>${escapeHtml(s.profile.nombre || '–')}</strong> <span style="color:var(--orange);font-family:var(--mono);font-size:10px;">📍 viendo</span>`
    : `<strong>${escapeHtml(s.profile.nombre || '–')}</strong>`;

  const level = s.profile?.level || '';
  const levelSel = `
    <select class="admin-level-select" data-level-uid="${s.uid}">
      <option value=""              ${level === ''              ? 'selected' : ''}>— Sin asignar —</option>
      <option value="principiante"  ${level === 'principiante'  ? 'selected' : ''}>Principiante</option>
      <option value="intermedio"    ${level === 'intermedio'    ? 'selected' : ''}>Intermedio</option>
      <option value="avanzado"      ${level === 'avanzado'      ? 'selected' : ''}>Avanzado</option>
    </select>
  `;

  return `
    <tr${trClass}>
      <td>${nameCell}</td>
      <td style="font-family:var(--mono);font-size:11px;color:var(--muted);">${escapeHtml(s.profile.email)}</td>
      <td>${levelSel}</td>
      <td>${counts.total} <span style="color:var(--muted);font-size:10px;">(${counts.tp}T·${counts.sl}S)</span></td>
      <td>
        <div style="color:${wrColor};font-weight:600;">${counts.total ? fmtPctNoSign(wr, 0) : '–'}</div>
        ${stratWrText ? `<div style="font-family:var(--mono);font-size:10px;margin-top:2px;">${stratWrText}</div>` : ''}
      </td>
      <td>
        <div style="color:${pnlColor};font-weight:600;">${counts.total ? fmtPct(pnl, 1) : '–'}</div>
        ${counts.total ? `<div style="color:${pnlRealColor};font-family:var(--mono);font-size:10px;margin-top:2px;">real ${fmtPct(pnlReal, 1)}</div>` : ''}
      </td>
      <td style="color:${pnlMonthColor};font-weight:500;">${monthTrades.length ? fmtPct(pnlMonth, 1) : '–'}</td>
      <td style="color:${slColor};font-family:var(--mono);font-weight:500;">${streak > 0 ? streak + ' SL' : '–'}</td>
      <td style="text-align:right;white-space:nowrap;">
        ${isViewing
          ? '<span class="badge st-activa">👁 viendo ahora</span>'
          : `<button class="btn primary" data-view-uid="${s.uid}" style="padding:6px 12px;font-size:11px;">Ver dashboard →</button>`
        }
        <button class="btn" data-delete-uid="${s.uid}" title="Eliminar alumno (bloquear acceso)" style="padding:6px 9px;font-size:13px;margin-left:6px;color:var(--red);">🗑</button>
      </td>
    </tr>
  `;
}

function openCreateStudentModal(container) {
  openModal({
    title: 'Crear nuevo alumno',
    body: `
      <div class="form" style="max-width:none;">
        <div class="form-field">
          <label class="form-label">Nombre completo</label>
          <input class="form-input" type="text" id="newName" placeholder="Juan Pérez" autocomplete="off">
        </div>
        <div class="form-field">
          <label class="form-label">Email <span class="required">*</span></label>
          <input class="form-input" type="email" id="newEmail" placeholder="alumno@email.com" autocomplete="off">
        </div>
        <div class="form-field">
          <label class="form-label">Contraseña temporal <span class="required">*</span></label>
          <input class="form-input" type="text" id="newPassword" placeholder="Mínimo 6 caracteres" autocomplete="off">
          <div style="font-size:10px;color:var(--muted);font-family:var(--mono);margin-top:4px;">El alumno podrá cambiarla desde su perfil.</div>
        </div>
        <div id="createErr" class="auth-error" style="display:none;"></div>
      </div>
    `,
    actions: [
      { label: 'Cancelar', onClick: close => close() },
      {
        label: 'Crear alumno',
        variant: 'primary',
        onClick: async close => {
          const root = document.getElementById('modal-root');
          const nombre = root.querySelector('#newName').value.trim();
          const email = root.querySelector('#newEmail').value.trim();
          const password = root.querySelector('#newPassword').value;
          const errEl = root.querySelector('#createErr');
          errEl.style.display = 'none';

          if (!email || !password) { showErr(errEl, 'Email y contraseña obligatorios'); return; }
          if (password.length < 6) { showErr(errEl, 'La contraseña debe tener al menos 6 caracteres'); return; }

          try {
            await auth.createStudent(email, password, nombre || email.split('@')[0]);
            close();
            cache = null;
            render(container);
            // Modal de confirmación con credenciales
            openModal({
              title: 'Alumno creado',
              body: `
                <p style="margin-bottom:12px;">Las credenciales del alumno son:</p>
                <div style="background:var(--card2);padding:14px;border-radius:8px;font-family:var(--mono);font-size:13px;">
                  <div><strong>Email:</strong> ${escapeHtml(email)}</div>
                  <div style="margin-top:6px;"><strong>Contraseña:</strong> ${escapeHtml(password)}</div>
                </div>
                <p style="font-size:11px;color:var(--muted);font-family:var(--mono);margin-top:14px;">
                  Cópialas y pásaselas al alumno. Podrá cambiar la contraseña desde Ajustes.
                </p>
              `,
              actions: [{ label: 'Listo', variant: 'primary', onClick: c => c() }],
            });
          } catch (err) {
            showErr(errEl, authErrorMsg(err));
          }
        },
      },
    ],
  });
}

function showErr(el, msg) {
  el.textContent = '⚠ ' + msg;
  el.style.display = 'flex';
}

function openDeleteStudentModal(adminContainer, stu) {
  const nombre = stu.profile?.nombre || '';
  const email = stu.profile?.email || '';
  const expected = email.trim().toLowerCase();
  const tradeCount = stu.trades?.length || 0;

  openModal({
    title: 'Eliminar alumno',
    body: `
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div style="padding:12px 14px;background:var(--red-bg);border:1px solid rgba(255,71,87,0.4);border-radius:8px;font-size:13px;line-height:1.5;">
          Vas a eliminar a <strong>${escapeHtml(nombre || email)}</strong>
          ${nombre ? `<span style="color:var(--muted);">(${escapeHtml(email)})</span>` : ''}
          de la app. No volverá a aparecer en la lista y <strong>no podrá entrar</strong>.
        </div>
        <div style="font-size:12px;color:var(--muted);font-family:var(--mono);line-height:1.6;">
          Sus datos (${tradeCount} trade${tradeCount === 1 ? '' : 's'}, cuentas, reflexiones) <strong>se conservan</strong> en Firebase por si lo necesitas recuperar.
          Para desbloquearlo: en la consola de Firebase, en <code>users/{uid}/profile/data</code>, cambia <code>blocked</code> a <code>false</code>.
        </div>
        <div class="form-field">
          <label class="form-label">Escribe el email del alumno para confirmar</label>
          <input class="form-input" type="text" id="deleteConfirmInp" placeholder="${escAttr(email)}" autocomplete="off">
        </div>
        <div id="deleteErr" class="auth-error" style="display:none;"></div>
      </div>
    `,
    actions: [
      { label: 'Cancelar', onClick: close => close() },
      {
        label: 'Eliminar',
        variant: 'danger',
        onClick: async close => {
          const root = document.getElementById('modal-root');
          const inp = root.querySelector('#deleteConfirmInp');
          const errEl = root.querySelector('#deleteErr');
          const typed = (inp?.value || '').trim().toLowerCase();
          if (typed !== expected) {
            errEl.textContent = '⚠ El email no coincide.';
            errEl.style.display = 'flex';
            return;
          }
          errEl.style.display = 'none';
          try {
            // Si el admin está viendo a este alumno ahora mismo, salir primero.
            if (state.viewAsUid === stu.uid) {
              await state.exitViewAs();
            }
            await sync.blockStudent(stu.uid);
            close();
            cache = null;
            render(adminContainer);
          } catch (err) {
            console.error('No se pudo eliminar el alumno:', err);
            errEl.textContent = '⚠ Error: ' + (err.message || String(err));
            errEl.style.display = 'flex';
          }
        },
      },
    ],
  });
}

function openRestoreModal(adminContainer) {
  let loadedData = null;

  openModal({
    title: 'Restaurar desde backup',
    meta: 'Sube un archivo JSON generado por "📥 Backup"',
    size: 'lg',
    body: `
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div class="form-field">
          <label class="form-label">Archivo de backup (.json)</label>
          <input type="file" id="restoreFile" accept="application/json,.json" class="form-input" style="padding:8px;">
        </div>

        <div id="restoreSummary" style="display:none;background:var(--card2);padding:12px 14px;border-radius:8px;font-family:var(--mono);font-size:12px;line-height:1.6;border:1px solid var(--border);"></div>

        <div id="restoreMode" style="display:none;">
          <label class="form-label">Modo de restauración</label>
          <div style="display:flex;flex-direction:column;gap:8px;font-size:12px;">
            <label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer;">
              <input type="radio" name="restoreMode" value="merge" checked style="margin-top:3px;">
              <span><strong>Merge (recomendado)</strong> — añade y actualiza, no borra nada. Si un trade existe con el mismo ID, se sobreescribe con el del backup. Lo nuevo que haya se conserva.</span>
            </label>
            <label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer;">
              <input type="radio" name="restoreMode" value="replace" style="margin-top:3px;">
              <span style="color:var(--red);"><strong>Replace (peligroso)</strong> — borra TODOS los trades, cuentas y reflexiones de cada alumno antes de restaurar. Pierdes cambios posteriores al backup.</span>
            </label>
          </div>
          <div id="restoreConfirm" style="display:none;margin-top:10px;padding:10px;background:var(--red-bg);border:1px solid rgba(255,71,87,0.4);border-radius:6px;">
            <label class="form-label" style="color:var(--red);">⚠ Confirma escribiendo <strong>REEMPLAZAR</strong></label>
            <input type="text" id="restoreConfirmInp" class="form-input" placeholder="REEMPLAZAR" autocomplete="off">
          </div>
        </div>

        <div id="restoreProgress" style="display:none;font-family:var(--mono);font-size:12px;color:var(--accent);padding:10px 12px;background:var(--card2);border-radius:6px;"></div>
        <div id="restoreErr" class="auth-error" style="display:none;"></div>
      </div>
    `,
    actions: [
      { label: 'Cancelar', onClick: close => close() },
      {
        label: 'Restaurar',
        variant: 'primary',
        onClick: close => runRestore(close),
      },
    ],
  });

  // Wire post-mount
  setTimeout(() => {
    const root = document.getElementById('modal-root');
    if (!root) return;

    const fileInp = root.querySelector('#restoreFile');
    const summaryEl = root.querySelector('#restoreSummary');
    const modeEl = root.querySelector('#restoreMode');
    const confirmEl = root.querySelector('#restoreConfirm');
    const errEl = root.querySelector('#restoreErr');

    function showErrModal(msg) {
      errEl.textContent = '⚠ ' + msg;
      errEl.style.display = 'flex';
    }
    function clearErr() { errEl.style.display = 'none'; errEl.textContent = ''; }

    fileInp.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      clearErr();
      try {
        loadedData = await parseBackupFile(file);
        const s = summarizeBackup(loadedData);
        summaryEl.style.display = 'block';
        summaryEl.innerHTML = `
          <strong>${new Date(s.exported_at).toLocaleString('es-ES')}</strong><br>
          ${s.students} alumnos · ${s.trades} trades · ${s.cuentas} cuentas · ${s.reflections} reflexiones<br>
          <span style="color:var(--muted);">Exportado por: ${escapeHtml(s.exported_by || 'desconocido')}</span>
        `;
        modeEl.style.display = 'block';
      } catch (err) {
        loadedData = null;
        summaryEl.style.display = 'none';
        modeEl.style.display = 'none';
        showErrModal(err.message || String(err));
      }
    });

    root.querySelectorAll('[name="restoreMode"]').forEach(r => {
      r.addEventListener('change', () => {
        const isReplace = root.querySelector('[name="restoreMode"]:checked')?.value === 'replace';
        confirmEl.style.display = isReplace ? 'block' : 'none';
      });
    });
  }, 0);

  async function runRestore(close) {
    const root = document.getElementById('modal-root');
    if (!root) return;
    const errEl = root.querySelector('#restoreErr');
    const progEl = root.querySelector('#restoreProgress');
    const showErrModal = (msg) => { errEl.textContent = '⚠ ' + msg; errEl.style.display = 'flex'; };

    if (!loadedData) { showErrModal('Selecciona un archivo de backup primero.'); return; }

    const mode = root.querySelector('[name="restoreMode"]:checked')?.value || 'merge';
    if (mode === 'replace') {
      const conf = root.querySelector('#restoreConfirmInp')?.value;
      if (conf !== 'REEMPLAZAR') {
        showErrModal('Para usar Replace, escribe "REEMPLAZAR" en el campo de confirmación.');
        return;
      }
    }

    errEl.style.display = 'none';
    progEl.style.display = 'block';
    progEl.style.color = 'var(--accent)';
    progEl.textContent = 'Iniciando…';

    // Deshabilitar inputs y botones mientras corre
    root.querySelectorAll('input, [data-action]').forEach(el => el.disabled = true);

    try {
      const stats = await restoreBackup(loadedData, mode, (i, total, label) => {
        progEl.textContent = `Restaurando ${i}/${total} · ${label}`;
      });
      progEl.style.color = 'var(--green)';
      progEl.innerHTML = `✓ Restaurados <strong>${stats.trades}</strong> trades, <strong>${stats.cuentas}</strong> cuentas y <strong>${stats.reflections}</strong> reflexiones (${stats.students} alumnos).<br><span style="color:var(--muted);">Pulsa "Cancelar" para cerrar.</span>`;
      // Invalidar cache de admin para forzar recarga al cerrar
      cache = null;
    } catch (err) {
      progEl.style.display = 'none';
      showErrModal('Error: ' + (err.message || String(err)));
      root.querySelectorAll('input, [data-action]').forEach(el => el.disabled = false);
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
