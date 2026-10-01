// Vista "Alumnos" del GESTOR de alumnos: un alumno al que el admin ha dado
// permiso (profile.gestor) para dar de alta alumnos. Ve el listado (nombre,
// email y fecha de alta), puede crear nuevos y corregir el NOMBRE de un alumno,
// pero NO ve resultados ni entra en el dashboard de nadie. Las reglas de
// Firestore lo garantizan: al gestor solo le dejan leer users/{uid} y su
// profile (nunca trades ni lo demás), y en el profile solo escribir `nombre`.

import { auth } from '../auth.js';
import { sync } from '../sync.js';
import { router } from '../router.js';
import { openCreateStudentModal } from './admin.js';
import { openModal } from '../components/modal.js';

let cache = null;
let searchQuery = '';

auth.on(() => { cache = null; });

export function alumnosView(container) {
  if (!auth.isGestor()) { router.go('#/dashboard'); return; }
  render(container);
}

async function render(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Alumnos</h1>
        <div class="sub" id="alumnosSub">Cargando alumnos…</div>
      </div>
      <div class="page-actions">
        <button class="btn" id="refreshBtn">↻ Refrescar</button>
        <button class="btn primary" id="newStudentBtn">+ Crear nuevo alumno</button>
      </div>
    </div>
    <div id="studentsContent" class="card">
      <div class="loader"><div class="spinner"></div><div>Cargando alumnos…</div></div>
    </div>
  `;

  container.querySelector('#refreshBtn').addEventListener('click', () => { cache = null; render(container); });
  container.querySelector('#newStudentBtn').addEventListener('click', () =>
    openCreateStudentModal(() => { cache = null; render(container); }));

  try {
    if (!cache) cache = await sync.listStudentsBasic();
    paint(container, cache);
  } catch (e) {
    container.querySelector('#studentsContent').innerHTML = `
      <div class="empty"><div class="big">⚠</div><div>Error cargando alumnos: ${esc(e.message || String(e))}</div></div>`;
  }
}

function paint(container, students) {
  const sorted = [...students].sort((a, b) =>
    (a.profile.nombre || a.profile.email || '').toLowerCase()
      .localeCompare((b.profile.nombre || b.profile.email || '').toLowerCase(), 'es'));
  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? sorted.filter(s => (s.profile.nombre || '').toLowerCase().includes(q) || (s.profile.email || '').toLowerCase().includes(q))
    : sorted;

  const n = students.length;
  container.querySelector('#alumnosSub').textContent = q
    ? `${filtered.length} de ${n} alumno${n !== 1 ? 's' : ''}`
    : `${n} alumno${n !== 1 ? 's' : ''}`;

  const content = container.querySelector('#studentsContent');
  content.innerHTML = `
    <div class="admin-search">
      <input type="search" id="alumnosSearch" class="form-input" placeholder="🔍 Buscar alumno por nombre o email…" value="${esc(searchQuery)}" autocomplete="off">
    </div>
    ${filtered.length === 0
      ? `<div class="empty">${q ? `Ningún alumno coincide con "${esc(searchQuery)}".` : 'Aún no hay alumnos.'}</div>`
      : `<table class="data-table">
          <thead><tr><th>Nombre</th><th>Email</th><th>Alta</th><th></th></tr></thead>
          <tbody>
            ${filtered.map(s => `
              <tr>
                <td><strong>${esc(s.profile.nombre || '–')}</strong></td>
                <td style="font-family:var(--mono);font-size:11px;color:var(--muted);">${esc(s.profile.email)}</td>
                <td style="font-family:var(--mono);font-size:11px;color:var(--muted);">${fecha(s.profile.createdAt)}</td>
                <td style="text-align:right;"><button class="btn ghost" data-edit-uid="${esc(s.uid)}" title="Editar nombre" style="padding:4px 9px;font-size:12px;">✏️</button></td>
              </tr>`).join('')}
          </tbody>
        </table>`}
  `;

  content.querySelectorAll('[data-edit-uid]').forEach(btn => {
    btn.addEventListener('click', () => {
      const stu = students.find(s => s.uid === btn.dataset.editUid);
      if (stu) openEditNameModal(stu, () => paint(container, students));
    });
  });

  const input = content.querySelector('#alumnosSearch');
  input.addEventListener('input', e => {
    searchQuery = e.target.value;
    paint(container, students);
    const el = container.querySelector('#alumnosSearch');
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  });
}

// Corregir el nombre del alumno. El email no: es el de acceso y no se puede
// cambiar desde la app.
function openEditNameModal(stu, onSaved) {
  openModal({
    title: 'Editar alumno',
    body: `
      <div class="form" style="max-width:none;gap:14px;white-space:normal;">
        <div class="form-field">
          <label class="form-label">Nombre completo</label>
          <input class="form-input" type="text" id="editName" maxlength="80" value="${esc(stu.profile.nombre || '')}" autocomplete="off">
        </div>
        <div style="font-size:11px;color:var(--muted);font-family:var(--mono);">Email: ${esc(stu.profile.email)} · no se puede cambiar (es el de acceso).</div>
        <div id="editErr" class="auth-error" style="display:none;"></div>
      </div>
    `,
    actions: [
      { label: 'Cancelar', onClick: close => close() },
      {
        label: 'Guardar',
        variant: 'primary',
        onClick: async close => {
          const root = document.getElementById('modal-root');
          const errEl = root.querySelector('#editErr');
          const nombre = root.querySelector('#editName').value.trim();
          if (!nombre) { errEl.textContent = '⚠ El nombre no puede quedar vacío.'; errEl.style.display = 'flex'; return; }
          try {
            await sync.updateProfile(stu.uid, { nombre });
            stu.profile = { ...stu.profile, nombre };
            close();
            onSaved();
          } catch (e) {
            errEl.textContent = '⚠ No se pudo guardar: ' + (e.message || e);
            errEl.style.display = 'flex';
          }
        },
      },
    ],
  });
  setTimeout(() => document.getElementById('editName')?.focus(), 0);
}

// createdAt es un Timestamp de Firestore (o falta en alumnos muy antiguos).
function fecha(ts) {
  const d = ts && typeof ts.toDate === 'function' ? ts.toDate() : null;
  return d ? d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '–';
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
