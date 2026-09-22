// Vista "Alumnos" del GESTOR de alumnos: un alumno al que el admin ha dado
// permiso (profile.gestor) para dar de alta alumnos. Ve el listado (nombre,
// email, fecha de alta) y puede crear nuevos, pero NO ve resultados ni entra
// en el dashboard de nadie. Las reglas de Firestore lo garantizan: al gestor
// solo le dejan leer users/{uid} y su profile, nunca trades ni lo demás.

import { auth } from '../auth.js';
import { sync } from '../sync.js';
import { router } from '../router.js';
import { openCreateStudentModal } from './admin.js';

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
          <thead><tr><th>Nombre</th><th>Email</th><th>Alta</th></tr></thead>
          <tbody>
            ${filtered.map(s => `
              <tr>
                <td><strong>${esc(s.profile.nombre || '–')}</strong></td>
                <td style="font-family:var(--mono);font-size:11px;color:var(--muted);">${esc(s.profile.email)}</td>
                <td style="font-family:var(--mono);font-size:11px;color:var(--muted);">${fecha(s.profile.createdAt)}</td>
              </tr>`).join('')}
          </tbody>
        </table>`}
  `;

  const input = content.querySelector('#alumnosSearch');
  input.addEventListener('input', e => {
    searchQuery = e.target.value;
    paint(container, students);
    const el = container.querySelector('#alumnosSearch');
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  });
}

// createdAt es un Timestamp de Firestore (o falta en alumnos muy antiguos).
function fecha(ts) {
  const d = ts && typeof ts.toDate === 'function' ? ts.toDate() : null;
  return d ? d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '–';
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
