const API_BASE = '/api/eventos';
const API_TIPOS = '/api/tipos-entrada';

// Elementos del DOM
const loadingOverlay = document.getElementById('loadingOverlay');
const toastElement = document.getElementById('toastNotification');
const toast = toastElement ? new bootstrap.Toast(toastElement, { autohide: true, delay: 3500 }) : null;
const modalEventoElement = document.getElementById('modalEvento');
const modalEvento = modalEventoElement ? new bootstrap.Modal(modalEventoElement) : null;
const formEvento = document.getElementById('formEvento');
const searchInput = document.getElementById('searchEventos');

let currentEditId = null;
let currentEventIdForTipos = null;
let tiposCache = [];
let logoutModalInstance = null;
let adminCsrfToken = '';

// =========================
// CSRF
// =========================
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

// =========================
// UTILIDADES
// =========================
function mostrarLoading(show) {
    if (!loadingOverlay) return;
    if (show) loadingOverlay.classList.add('active');
    else loadingOverlay.classList.remove('active');
}

function mostrarToast(titulo, mensaje, tipo = 'success') {
    const toastIcon = document.getElementById('toastIcon');
    const toastTitle = document.getElementById('toastTitle');
    const toastMessage = document.getElementById('toastMessage');

    if (!toastElement || !toastTitle || !toastMessage || !toast) return;

    toastElement.className = 'toast border-0';

    if (tipo === 'success') {
        toastElement.classList.add('text-bg-success');
        if (toastIcon) toastIcon.className = 'bi bi-check-circle-fill me-2';
        toastTitle.textContent = titulo;
    } else if (tipo === 'error') {
        toastElement.classList.add('text-bg-danger');
        if (toastIcon) toastIcon.className = 'bi bi-exclamation-triangle-fill me-2';
        toastTitle.textContent = titulo;
    } else if (tipo === 'warning') {
        toastElement.classList.add('text-bg-warning');
        if (toastIcon) toastIcon.className = 'bi bi-exclamation-circle-fill me-2';
        toastTitle.textContent = titulo;
    } else {
        toastElement.classList.add('text-bg-primary');
        if (toastIcon) toastIcon.className = 'bi bi-info-circle-fill me-2';
        toastTitle.textContent = titulo;
    }

    toastMessage.textContent = mensaje;
    toast.show();
}

function formatearFecha(fecha) {
    if (!fecha) return 'No definida';
    const f = new Date(fecha);
    if (isNaN(f.getTime())) return 'No definida';
    return f.toLocaleString();
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>]/g, function (m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// =========================
// LOGOUT MODAL
// =========================
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

        mostrarToast('Error', error.message || 'No se pudo cerrar la sesión', 'error');
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

// =========================
// CRUD EVENTOS
// =========================
async function cargarEventos() {
    mostrarLoading(true);
    try {
        const response = await fetch(API_BASE, { credentials: 'same-origin' });
        if (!response.ok) throw new Error('Error al cargar eventos');

        const eventos = await response.json();
        const tbody = document.querySelector('#tablaEventos tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (!Array.isArray(eventos) || eventos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-muted">No hay eventos registrados</td></tr>';
            actualizarStats([]);
            return;
        }

        const eventosConStock = await Promise.all(eventos.map(async (ev) => {
            try {
                const resTipos = await fetch(`${API_BASE}/${ev.id_evento}/tipos`, { credentials: 'same-origin' });
                if (resTipos.ok) {
                    const tipos = await resTipos.json();
                    const stockTotal = Array.isArray(tipos)
                        ? tipos.reduce((sum, t) => sum + (Number(t.stock_disponible) || 0), 0)
                        : 0;
                    return { ...ev, stockTotal };
                }
            } catch (e) {
                console.error(`Error al obtener tipos para evento ${ev.id_evento}`, e);
            }
            return { ...ev, stockTotal: 0 };
        }));

        eventosConStock.forEach(ev => {
            const lugarCiudad = [ev.lugar, ev.ciudad].filter(Boolean).join(', ') || ev.lugar || 'Sin lugar';
            let estadoBadge = '';

            switch (ev.estado) {
                case 'publicado':
                    estadoBadge = '<span class="badge bg-success">Publicado</span>';
                    break;
                case 'borrador':
                    estadoBadge = '<span class="badge bg-secondary">Borrador</span>';
                    break;
                case 'agotado':
                    estadoBadge = '<span class="badge bg-warning text-dark">Agotado</span>';
                    break;
                case 'cancelado':
                    estadoBadge = '<span class="badge bg-danger">Cancelado</span>';
                    break;
                case 'finalizado':
                    estadoBadge = '<span class="badge bg-info">Finalizado</span>';
                    break;
                default:
                    estadoBadge = `<span class="badge bg-light text-dark">${escapeHtml(ev.estado)}</span>`;
            }

            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${escapeHtml(ev.titulo)}</strong></td>
                <td>${formatearFecha(ev.fecha_evento)}</td>
                <td>${escapeHtml(lugarCiudad)}</td>
                <td>${estadoBadge}</td>
                <td><span class="badge bg-secondary">${ev.stockTotal}</span></td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-info me-1" onclick="gestionarTipos(${ev.id_evento})" title="Gestionar tipos">
                        <i class="bi bi-ticket-perforated"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="editarEvento(${ev.id_evento})" title="Editar">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="eliminarEvento(${ev.id_evento})" title="Eliminar">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

        actualizarStats(eventosConStock);
    } catch (error) {
        console.error(error);
        mostrarToast('Error', 'No se pudieron cargar los eventos', 'error');
        const tbody = document.querySelector('#tablaEventos tbody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-5">Error al cargar datos</td></tr>';
        }
    } finally {
        mostrarLoading(false);
    }
}

function actualizarStats(eventos) {
    const total = eventos.length;
    const publicados = eventos.filter(ev => ev.estado === 'publicado').length;
    const hoy = new Date();
    const proximos = eventos.filter(ev => {
        const f = new Date(ev.fecha_evento);
        return !isNaN(f.getTime()) && f > hoy;
    }).length;

    const totalEventos = document.getElementById('totalEventos');
    const eventosActivos = document.getElementById('eventosActivos');
    const eventosProximos = document.getElementById('eventosProximos');
    const badgeEventos = document.getElementById('badgeEventos');

    if (totalEventos) totalEventos.textContent = total;
    if (eventosActivos) eventosActivos.textContent = publicados;
    if (eventosProximos) eventosProximos.textContent = proximos;
    if (badgeEventos) badgeEventos.textContent = total;
}

async function guardarEvento(event) {
    event.preventDefault();

    if (!formEvento) return;

    const formData = new FormData(formEvento);

    if (!formData.get('titulo') || !formData.get('lugar') || !formData.get('fecha_evento')) {
        mostrarToast('Campos incompletos', 'Título, lugar y fecha inicio son obligatorios', 'error');
        return;
    }

    mostrarLoading(true);
    try {
        let url = API_BASE;
        let method = 'POST';

        if (currentEditId) {
            url = `${API_BASE}/${currentEditId}`;
            method = 'PUT';
        }

        const response = await fetchConCsrf(url, {
            method,
            body: formData
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) throw new Error(result.message || 'Error al guardar');
        if (result.ok === false) throw new Error(result.message || 'Error al guardar');

        mostrarToast('Éxito', currentEditId ? 'Evento actualizado correctamente' : 'Evento creado correctamente');

        if (modalEvento) modalEvento.hide();
        formEvento.reset();
        currentEditId = null;

        const modalTitle = document.getElementById('modalTitle');
        if (modalTitle) modalTitle.textContent = 'Crear Evento';

        const preview = document.getElementById('imagenPreview');
        if (preview) preview.style.display = 'none';

        cargarEventos();
    } catch (error) {
        console.error(error);
        mostrarToast('Error', error.message || 'No se pudo guardar el evento', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function eliminarEvento(id) {
    if (!confirm('¿Estás seguro de eliminar este evento? Esta acción no se puede deshacer.')) return;

    mostrarLoading(true);
    try {
        const response = await fetchConCsrf(`${API_BASE}/${id}`, {
            method: 'DELETE'
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) throw new Error(result.message || 'Error al eliminar');

        mostrarToast('Eliminado', 'Evento eliminado correctamente');
        cargarEventos();
    } catch (error) {
        console.error(error);
        mostrarToast('Error', error.message || 'No se pudo eliminar el evento', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function editarEvento(id) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_BASE}/${id}`, { credentials: 'same-origin' });
        if (!response.ok) throw new Error('Error al obtener evento');

        const evento = await response.json();
        if (!formEvento) return;

        formEvento.titulo.value = evento.titulo || '';
        formEvento.descripcion.value = evento.descripcion || '';
        formEvento.categoria.value = evento.categoria || '';
        formEvento.lugar.value = evento.lugar || '';
        formEvento.direccion.value = evento.direccion || '';
        formEvento.ciudad.value = evento.ciudad || '';
        formEvento.fecha_evento.value = evento.fecha_evento ? evento.fecha_evento.slice(0, 16) : '';
        formEvento.fecha_fin_evento.value = evento.fecha_fin_evento ? evento.fecha_fin_evento.slice(0, 16) : '';
        formEvento.organizador.value = evento.organizador || '';
        formEvento.estado.value = evento.estado || 'borrador';
        formEvento.precio.value = evento.precio || 0;
        formEvento.payphone_token.value = evento.payphone_token || '';
        formEvento.payphone_app_id.value = evento.payphone_app_id || '';

        const previewContainer = document.getElementById('imagenPreview');
        if (previewContainer && evento.imagen_url) {
            const img = previewContainer.querySelector('img');
            if (img) {
                img.src = evento.imagen_url.startsWith('http')
                    ? evento.imagen_url
                    : `${window.location.origin}${evento.imagen_url}`;
                previewContainer.style.display = 'block';
            }
        } else if (previewContainer) {
            previewContainer.style.display = 'none';
        }

        currentEditId = evento.id_evento;

        const modalTitle = document.getElementById('modalTitle');
        if (modalTitle) modalTitle.textContent = 'Editar Evento';

        if (modalEvento) modalEvento.show();
    } catch (error) {
        console.error(error);
        mostrarToast('Error', 'No se pudo cargar el evento para editar', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function abrirModalEvento() {
    currentEditId = null;
    if (formEvento) formEvento.reset();

    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = 'Crear Evento';

    const preview = document.getElementById('imagenPreview');
    if (preview) preview.style.display = 'none';

    if (modalEvento) modalEvento.show();
}

function filtrarEventos() {
    if (!searchInput) return;

    const term = searchInput.value.toLowerCase().trim();
    const rows = document.querySelectorAll('#tablaEventos tbody tr');

    rows.forEach(row => {
        const texto = row.textContent.toLowerCase();
        row.style.display = term === '' || texto.includes(term) ? '' : 'none';
    });
}

// =========================
// GESTIÓN DE TIPOS DE ENTRADA
// =========================
async function gestionarTipos(eventoId) {
    currentEventIdForTipos = eventoId;

    const tiposModalTitle = document.getElementById('tiposModalTitle');
    if (tiposModalTitle) {
        tiposModalTitle.textContent = `Tipos de entrada - Evento #${eventoId}`;
    }

    await cargarTipos(eventoId);
    const modalEl = document.getElementById('modalTipos');
    if (modalEl) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    }
}

async function cargarTipos(eventoId) {
    const tiposListDiv = document.getElementById('tiposList');
    if (tiposListDiv) {
        tiposListDiv.innerHTML = '<div class="alert alert-info">Cargando...</div>';
    }

    try {
        const response = await fetch(`${API_TIPOS}/evento/${eventoId}`, { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);

        const tipos = await response.json();
        tiposCache = Array.isArray(tipos) ? tipos : [];
        renderTiposList(tiposCache);
    } catch (error) {
        console.error('Error al cargar tipos:', error);
        if (tiposListDiv) {
            tiposListDiv.innerHTML = '<div class="alert alert-danger">Error al cargar tipos</div>';
        }
    }
}

function renderTiposList(tipos) {
    const tiposListDiv = document.getElementById('tiposList');
    if (!tiposListDiv) return;

    if (!tipos.length) {
        tiposListDiv.innerHTML = '<div class="alert alert-warning">No hay tipos de entrada para este evento.</div>';
        return;
    }

    let html = '<div class="table-responsive"><table class="table table-sm"><thead><tr><th>Nombre</th><th>Precio</th><th>Stock Total</th><th>Disponible</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>';

    tipos.forEach(tipo => {
        html += `
            <tr>
                <td>${escapeHtml(tipo.nombre)}</td>
                <td>$${parseFloat(tipo.precio || 0).toFixed(2)}</td>
                <td>${Number(tipo.stock_total) || 0}</td>
                <td>${Number(tipo.stock_disponible) || 0}</td>
                <td><span class="badge ${tipo.estado === 'activo' ? 'bg-success' : 'bg-secondary'}">${escapeHtml(tipo.estado)}</span></td>
                <td>
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="editarTipo(${tipo.id_tipo_entrada})">Editar</button>
                    <button class="btn btn-sm btn-outline-danger" onclick="eliminarTipo(${tipo.id_tipo_entrada})">Eliminar</button>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    tiposListDiv.innerHTML = html;
}

function editarTipo(tipoId) {
    const tipo = tiposCache.find(t => t.id_tipo_entrada === tipoId);
    if (!tipo) return;

    document.getElementById('tipoId').value = tipo.id_tipo_entrada;
    document.getElementById('tipoNombre').value = tipo.nombre || '';
    document.getElementById('tipoPrecio').value = tipo.precio || 0;
    document.getElementById('tipoDescripcion').value = tipo.descripcion || '';
    document.getElementById('tipoStockTotal').value = tipo.stock_total || 0;
    document.getElementById('tipoStockDisponible').value = tipo.stock_disponible || 0;
    document.getElementById('tipoEstado').value = tipo.estado || 'activo';
}

function resetTipoForm() {
    const formTipo = document.getElementById('formTipo');
    if (formTipo) formTipo.reset();
    const tipoId = document.getElementById('tipoId');
    if (tipoId) tipoId.value = '';
}

async function guardarTipo(event) {
    event.preventDefault();

    const tipoId = document.getElementById('tipoId').value;
    const nombre = document.getElementById('tipoNombre').value.trim();
    const precio = parseFloat(document.getElementById('tipoPrecio').value);
    const descripcion = document.getElementById('tipoDescripcion').value.trim();
    const stockTotal = parseInt(document.getElementById('tipoStockTotal').value, 10);
    const stockDisponible = parseInt(document.getElementById('tipoStockDisponible').value, 10);
    const estado = document.getElementById('tipoEstado').value;

    if (!nombre || isNaN(precio) || isNaN(stockTotal) || isNaN(stockDisponible)) {
        mostrarToast('Error', 'Todos los campos marcados con * son obligatorios', 'error');
        return;
    }

    if (stockDisponible > stockTotal) {
        mostrarToast('Error', 'El stock disponible no puede ser mayor al stock total', 'error');
        return;
    }

    const data = {
        nombre,
        precio,
        descripcion,
        stock_total: stockTotal,
        stock_disponible: stockDisponible,
        estado,
        id_evento: currentEventIdForTipos
    };

    mostrarLoading(true);
    try {
        let url = API_TIPOS;
        let method = 'POST';

        if (tipoId) {
            url = `${API_TIPOS}/${tipoId}`;
            method = 'PUT';
        }

        const response = await fetchConCsrf(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const responseData = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(responseData.message || 'Error al guardar tipo');
        }

        mostrarToast('Éxito', tipoId ? 'Tipo actualizado' : 'Tipo creado');
        resetTipoForm();
        await cargarTipos(currentEventIdForTipos);
        cargarEventos();
    } catch (error) {
        console.error(error);
        mostrarToast('Error', error.message || 'No se pudo guardar el tipo', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function eliminarTipo(tipoId) {
    if (!confirm('¿Estás seguro de eliminar este tipo de entrada? Esto podría afectar órdenes existentes.')) return;

    mostrarLoading(true);
    try {
        const response = await fetchConCsrf(`${API_TIPOS}/${tipoId}`, {
            method: 'DELETE'
        });

        const errorData = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(errorData.message || 'Error al eliminar tipo');
        }

        mostrarToast('Éxito', 'Tipo eliminado');
        await cargarTipos(currentEventIdForTipos);
        cargarEventos();
    } catch (error) {
        console.error(error);
        mostrarToast('Error', error.message || 'No se pudo eliminar el tipo', 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =========================
// NAVEGACIÓN ENTRE SECCIONES
// =========================
function mostrarSeccion(id) {
    document.querySelectorAll('.seccion').forEach(sec => sec.classList.add('hidden'));
    const sectionEl = document.getElementById(id);
    if (sectionEl) sectionEl.classList.remove('hidden');
}

function descargarCSV() {
    mostrarToast('Información', 'Función en desarrollo', 'info');
}

// =========================
// INICIALIZACIÓN
// =========================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await obtenerCsrfToken();
    } catch (error) {
        console.error('Error inicializando CSRF:', error);
        mostrarToast('Error', 'No se pudo inicializar la seguridad del panel', 'error');
    }

    inicializarLogoutModal();
    cargarEventos();

    if (formEvento) {
        formEvento.addEventListener('submit', guardarEvento);
    }

    if (searchInput) {
        searchInput.addEventListener('input', filtrarEventos);
    }

    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const section = link.getAttribute('data-section');
            if (section) {
                e.preventDefault();
                mostrarSeccion(section);
            }
        });
    });

    if (modalEventoElement) {
        modalEventoElement.addEventListener('hidden.bs.modal', () => {
            if (formEvento) formEvento.reset();
            currentEditId = null;
            const preview = document.getElementById('imagenPreview');
            if (preview) preview.style.display = 'none';
        });
    }

    const formTipo = document.getElementById('formTipo');
    if (formTipo) {
        formTipo.addEventListener('submit', guardarTipo);
    }

    const btnCancelarTipo = document.getElementById('btnCancelarTipo');
    if (btnCancelarTipo) {
        btnCancelarTipo.addEventListener('click', resetTipoForm);
    }

    const modalTipos = document.getElementById('modalTipos');
    if (modalTipos) {
        modalTipos.addEventListener('hidden.bs.modal', () => {
            resetTipoForm();
            currentEventIdForTipos = null;
            tiposCache = [];
        });
    }
});