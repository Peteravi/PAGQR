const API_BASE = '/api/asistentes';

let state = {
    asistentes: [],
    totalRegistros: 0,
    paginaActual: 1,
    limite: 20,
    totalPaginas: 0,
    filtros: {
        search: '',
        evento: 'todos',
        estado: 'todos'
    },
    eventosList: [],
    resumen: {
        total: 0,
        usadas: 0,
        pendientes: 0,
        canceladas: 0
    }
};

let logoutModalInstance = null;
let adminCsrfToken = '';

const dom = {
    loadingOverlay: document.getElementById('loadingOverlay'),
    tablaBody: document.querySelector('#tablaAsistentes tbody'),
    btnRefrescar: document.getElementById('btnRefrescarAsistentes'),
    btnDescargarCsv: document.getElementById('btnDescargarAsistentesCsv'),
    inputBusqueda: document.getElementById('busquedaAsistentes'),
    selectEvento: document.getElementById('filtroEventoAsistentes'),
    selectEstado: document.getElementById('filtroEstadoAsistentes'),
    btnPrev: document.getElementById('btnAsistentesPrev'),
    btnNext: document.getElementById('btnAsistentesNext'),
    paginacionInfo: document.getElementById('asistentesPaginacionInfo'),

    totalElement: document.getElementById('asistentesTotal'),
    usadasElement: document.getElementById('asistentesUsadas'),
    pendientesElement: document.getElementById('asistentesPendientes'),
    canceladasElement: document.getElementById('asistentesCanceladas'),

    badgeAsistentes: document.getElementById('badgeAsistentes'),
    badgeEventos: document.getElementById('badgeEventos'),

    codigoValidacion: document.getElementById('codigoValidacionManual'),
    puntoAcceso: document.getElementById('puntoAccesoManual'),
    validadoPor: document.getElementById('validadoPorManual'),
    btnValidar: document.getElementById('btnValidarManual')
};

// -------------------------------
// CSRF
// -------------------------------
async function obtenerCsrfToken(force = false) {
    if (!force && adminCsrfToken) {
        return adminCsrfToken;
    }

    const response = await fetch('/api/admin-auth/csrf', {
        method: 'GET',
        credentials: 'same-origin',
        headers: {
            'Accept': 'application/json'
        }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.ok || !data.csrfToken) {
        throw new Error(data.message || 'No se pudo obtener el token CSRF');
    }

    adminCsrfToken = data.csrfToken;
    return adminCsrfToken;
}

async function fetchConCsrf(url, options = {}) {
    let token = await obtenerCsrfToken();

    const headers = new Headers(options.headers || {});
    headers.set('CSRF-Token', token);

    let response = await fetch(url, {
        ...options,
        credentials: 'same-origin',
        headers
    });

    if (response.status === 403) {
        token = await obtenerCsrfToken(true);

        const retryHeaders = new Headers(options.headers || {});
        retryHeaders.set('CSRF-Token', token);

        response = await fetch(url, {
            ...options,
            credentials: 'same-origin',
            headers: retryHeaders
        });
    }

    return response;
}

// -------------------------------
// UI helpers
// -------------------------------
function mostrarLoading(show) {
    if (!dom.loadingOverlay) return;
    dom.loadingOverlay.style.display = show ? 'flex' : 'none';
}

function mostrarToast(msg, tipo = 'info') {
    const el = document.getElementById('toastNotification');
    const body = document.getElementById('toastMessage');

    if (!el || !body || typeof bootstrap === 'undefined') return;

    body.textContent = msg;
    el.className = 'toast border-0';

    if (tipo === 'success') el.classList.add('text-bg-success');
    else if (tipo === 'error') el.classList.add('text-bg-danger');
    else if (tipo === 'warning') el.classList.add('text-bg-warning');
    else el.classList.add('text-bg-primary');

    const toast = bootstrap.Toast.getOrCreateInstance(el);
    toast.show();
}

// -------------------------------
// LOGOUT MODAL
// -------------------------------
function inicializarLogoutModal() {
    const modalElement = document.getElementById('logoutModal');
    const btnLogout = document.getElementById('btnLogout');
    const confirmLogoutBtn = document.getElementById('confirmLogoutBtn');

    if (!modalElement || !btnLogout || !confirmLogoutBtn || typeof bootstrap === 'undefined') {
        return;
    }

    logoutModalInstance = new bootstrap.Modal(modalElement);

    btnLogout.addEventListener('click', () => {
        logoutModalInstance.show();
    });

    confirmLogoutBtn.addEventListener('click', cerrarSesion);
}

async function cerrarSesion() {
    const confirmLogoutBtn = document.getElementById('confirmLogoutBtn');

    try {
        if (confirmLogoutBtn) {
            confirmLogoutBtn.disabled = true;
            confirmLogoutBtn.innerHTML = `
                <span class="spinner-border spinner-border-sm me-2"></span>
                Cerrando...
            `;
        }

        const response = await fetchConCsrf('/api/admin-auth/logout', {
            method: 'POST'
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || 'Error al cerrar sesión');
        }

        window.location.href = '/login';
    } catch (error) {
        console.error('Error cerrando sesión:', error);

        if (logoutModalInstance) {
            logoutModalInstance.hide();
        }

        mostrarToast('No se pudo cerrar la sesión', 'error');
    } finally {
        if (confirmLogoutBtn) {
            confirmLogoutBtn.disabled = false;
            confirmLogoutBtn.innerHTML = `
                <i class="bi bi-box-arrow-right me-2"></i>
                Sí, cerrar sesión
            `;
        }
    }
}

// -------------------------------
// API
// -------------------------------
async function cargarResumen() {
    try {
        const resp = await fetch(`${API_BASE}/resumen`, { credentials: 'same-origin' });
        const data = await resp.json();

        if (data.ok) {
            const r = data.resumen || {};

            state.resumen = {
                total: r.total || 0,
                usadas: r.usadas || 0,
                pendientes: (r.generadas || 0) + (r.enviadas || 0),
                canceladas: r.canceladas || 0
            };

            if (dom.totalElement) dom.totalElement.textContent = state.resumen.total;
            if (dom.usadasElement) dom.usadasElement.textContent = state.resumen.usadas;
            if (dom.pendientesElement) dom.pendientesElement.textContent = state.resumen.pendientes;
            if (dom.canceladasElement) dom.canceladasElement.textContent = state.resumen.canceladas;
            if (dom.badgeAsistentes) dom.badgeAsistentes.textContent = state.resumen.total;
        }
    } catch (e) {
        console.error('Error cargando resumen:', e);
        mostrarToast('Error cargando resumen de asistentes', 'error');
    }
}

async function cargarEventos() {
    try {
        const resp = await fetch(`${API_BASE}/eventos`, { credentials: 'same-origin' });
        const data = await resp.json();

        if (data.ok) {
            state.eventosList = Array.isArray(data.eventos) ? data.eventos : [];

            if (dom.selectEvento) {
                dom.selectEvento.innerHTML = `<option value="todos">Todos</option>`;

                state.eventosList.forEach(evento => {
                    const op = document.createElement('option');
                    op.value = evento.id_evento;
                    op.textContent = evento.titulo;
                    dom.selectEvento.appendChild(op);
                });
            }

            if (dom.badgeEventos) {
                dom.badgeEventos.textContent = state.eventosList.length;
            }
        }
    } catch (e) {
        console.error('Error cargando eventos:', e);
        mostrarToast('Error cargando eventos', 'error');
    }
}

async function cargarAsistentes(reset = true) {
    if (reset) state.paginaActual = 1;

    if (dom.tablaBody) {
        dom.tablaBody.innerHTML = `<tr><td colspan="7" class="text-center">Cargando...</td></tr>`;
    }

    try {
        const params = new URLSearchParams({
            page: String(state.paginaActual),
            limit: String(state.limite),
            search: state.filtros.search || '',
            evento: state.filtros.evento || 'todos',
            estado: state.filtros.estado || 'todos'
        });

        const resp = await fetch(`${API_BASE}?${params.toString()}`, { credentials: 'same-origin' });
        const data = await resp.json();

        if (data.ok) {
            state.asistentes = Array.isArray(data.asistentes) ? data.asistentes : [];
            state.totalRegistros = Number(data.total || 0);
            state.totalPaginas = Math.max(1, Math.ceil(state.totalRegistros / state.limite));

            if (state.paginaActual > state.totalPaginas) {
                state.paginaActual = state.totalPaginas;
            }

            renderTabla();
            renderPaginacion();
        } else if (dom.tablaBody) {
            dom.tablaBody.innerHTML = `<tr><td colspan="7" class="text-center">No se pudo cargar la información</td></tr>`;
        }
    } catch (e) {
        console.error('Error cargando asistentes:', e);
        if (dom.tablaBody) {
            dom.tablaBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Error cargando asistentes</td></tr>`;
        }
        mostrarToast('Error cargando asistentes', 'error');
    }
}

// -------------------------------
// Render
// -------------------------------
function formatearFecha(fecha) {
    if (!fecha) return '-';
    const f = new Date(fecha);
    if (isNaN(f.getTime())) return '-';
    return f.toLocaleDateString();
}

function escapeHtml(texto) {
    if (texto === null || texto === undefined) return '';
    return String(texto)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function renderTabla() {
    if (!dom.tablaBody) return;

    if (!state.asistentes.length) {
        dom.tablaBody.innerHTML = `<tr><td colspan="7" class="text-center">Sin datos</td></tr>`;
        return;
    }

    dom.tablaBody.innerHTML = state.asistentes.map(a => {
        const codigo = escapeHtml(a.codigo_entrada || '-');
        const idEntrada = escapeHtml(a.id_entrada || '');
        const nombre = escapeHtml(a.asistente?.nombre || '-');
        const email = escapeHtml(a.asistente?.email || '-');
        const tituloEvento = escapeHtml(a.evento?.titulo || '-');
        const tipoEntrada = escapeHtml(a.tipo_entrada?.nombre || '-');
        const estado = escapeHtml(a.estado || '-');
        const fechaEvento = formatearFecha(a.evento?.fecha_evento);

        return `
            <tr>
                <td>${codigo}</td>
                <td>
                    ${nombre}<br>
                    <small>${email}</small>
                </td>
                <td>${tituloEvento}</td>
                <td>${tipoEntrada}</td>
                <td>${estado}</td>
                <td>${fechaEvento}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="verDetalle('${idEntrada}')">
                        Ver
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderPaginacion() {
    if (dom.paginacionInfo) {
        dom.paginacionInfo.textContent = `Página ${state.paginaActual} de ${state.totalPaginas}`;
    }

    if (dom.btnPrev) {
        dom.btnPrev.disabled = state.paginaActual <= 1;
    }

    if (dom.btnNext) {
        dom.btnNext.disabled = state.paginaActual >= state.totalPaginas;
    }
}

// -------------------------------
// Acciones
// -------------------------------
async function verDetalle(id) {
    try {
        if (!id) {
            mostrarToast('ID de entrada no válido', 'warning');
            return;
        }

        const resp = await fetch(`${API_BASE}/${id}`, { credentials: 'same-origin' });
        const data = await resp.json();

        if (data.ok) {
            alert(JSON.stringify(data, null, 2));
        } else {
            mostrarToast(data.message || 'No se pudo cargar el detalle', 'warning');
        }
    } catch (e) {
        console.error('Error cargando detalle:', e);
        mostrarToast('Error cargando detalle del asistente', 'error');
    }
}

async function descargarCSV() {
    try {
        mostrarLoading(true);

        const params = new URLSearchParams({
            search: state.filtros.search || '',
            evento: state.filtros.evento || 'todos',
            estado: state.filtros.estado || 'todos'
        });

        const resp = await fetch(`${API_BASE}/export/csv?${params.toString()}`, {
            credentials: 'same-origin'
        });

        if (!resp.ok) {
            throw new Error(`Error HTTP ${resp.status}`);
        }

        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'asistentes.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        mostrarToast('CSV descargado correctamente', 'success');
    } catch (e) {
        console.error('Error descargando CSV:', e);
        mostrarToast('Error descargando CSV', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function validarManual() {
    try {
        const codigo = dom.codigoValidacion?.value?.trim();
        const punto_acceso = dom.puntoAcceso?.value?.trim() || 'Principal';
        const validado_por = dom.validadoPor?.value?.trim() || 'Admin';

        if (!codigo) {
            mostrarToast('Ingresa un código para validar', 'warning');
            return;
        }

        mostrarLoading(true);

        const resp = await fetchConCsrf(`${API_BASE}/validar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                codigo,
                punto_acceso,
                validado_por
            })
        });

        const data = await resp.json().catch(() => ({}));

        if (data.ok) {
            mostrarToast(data.message || 'Entrada validada correctamente', 'success');

            if (dom.codigoValidacion) dom.codigoValidacion.value = '';

            await cargarResumen();
            await cargarAsistentes(false);
        } else {
            mostrarToast(data.message || 'No se pudo validar la entrada', 'warning');
        }
    } catch (e) {
        console.error('Error en validación manual:', e);
        mostrarToast('Error validando entrada', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// -------------------------------
// Utilidad debounce
// -------------------------------
function debounce(fn, delay = 300) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

// -------------------------------
// Eventos
// -------------------------------
async function init() {
    try {
        await obtenerCsrfToken();
    } catch (error) {
        console.error('Error inicializando CSRF:', error);
        mostrarToast('No se pudo inicializar la seguridad del panel', 'error');
    }

    cargarResumen();
    cargarEventos();
    cargarAsistentes();

    if (dom.btnRefrescar) {
        dom.btnRefrescar.onclick = async () => {
            mostrarLoading(true);
            await cargarResumen();
            await cargarEventos();
            await cargarAsistentes();
            mostrarLoading(false);
        };
    }

    if (dom.btnDescargarCsv) {
        dom.btnDescargarCsv.onclick = descargarCSV;
    }

    if (dom.inputBusqueda) {
        dom.inputBusqueda.oninput = debounce((e) => {
            state.filtros.search = e.target.value.trim();
            cargarAsistentes(true);
        }, 350);
    }

    if (dom.selectEvento) {
        dom.selectEvento.onchange = (e) => {
            state.filtros.evento = e.target.value;
            cargarAsistentes(true);
        };
    }

    if (dom.selectEstado) {
        dom.selectEstado.onchange = (e) => {
            state.filtros.estado = e.target.value;
            cargarAsistentes(true);
        };
    }

    if (dom.btnPrev) {
        dom.btnPrev.onclick = () => {
            if (state.paginaActual > 1) {
                state.paginaActual--;
                cargarAsistentes(false);
            }
        };
    }

    if (dom.btnNext) {
        dom.btnNext.onclick = () => {
            if (state.paginaActual < state.totalPaginas) {
                state.paginaActual++;
                cargarAsistentes(false);
            }
        };
    }

    if (dom.btnValidar) {
        dom.btnValidar.onclick = validarManual;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await init();
    inicializarLogoutModal();
});