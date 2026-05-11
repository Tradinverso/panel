// Panel admin "Mis Alumnos". Lista alumnos con métricas, permite crear nuevos
// y entrar al dashboard de cada uno en modo solo-lectura.

import { auth, authErrorMsg } from '../auth.js';
import { sync } from '../sync.js';
import { state } from '../state.js';
import { router } from '../router.js';
import { winrate, pnlPct, pnlPctReal, currentSlStreak, tradeCounts } from '../utils/calculations.js';
import { fmtPct, fmtPctNoSign } from '../utils/number-format-es.js';
import { openModal, closeModal } from '../components/modal.js';

let cache = null;
let cacheUid = null;

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

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Mis Alumnos</h1>
        <div class="sub" id="adminSub">Cargando alumnos…</div>
      </div>
      <div class="page-actions">
        <button class="btn" id="refreshBtn">↻ Refrescar</button>
        <button class="btn primary" id="newStudentBtn">+ Crear nuevo alumno</button>
      </div>
    </div>
    ${viewingBanner}
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
  const sub = container.querySelector('#adminSub');
  if (sub) sub.textContent = `${students.length} alumno${students.length !== 1 ? 's' : ''}`;

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
    <table class="data-table">
      <thead><tr>
        <th>Nombre</th>
        <th>Email</th>
        <th>Trades</th>
        <th>WR <span style="color:var(--muted);font-weight:400;">(global · estrategias)</span></th>
        <th>P&L acum. <span style="color:var(--muted);font-weight:400;">(sist · real)</span></th>
        <th>P&L mes</th>
        <th>SL</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${students.map(s => row(s)).join('')}
      </tbody>
    </table>
  `;

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

  return `
    <tr${trClass}>
      <td>${nameCell}</td>
      <td style="font-family:var(--mono);font-size:11px;color:var(--muted);">${escapeHtml(s.profile.email)}</td>
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
      <td style="text-align:right;">
        ${isViewing
          ? '<span class="badge st-activa">👁 viendo ahora</span>'
          : `<button class="btn primary" data-view-uid="${s.uid}" style="padding:6px 12px;font-size:11px;">Ver dashboard →</button>`
        }
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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
