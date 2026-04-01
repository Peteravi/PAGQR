// Configuración de la API
const API_BASE = 'http://localhost:3000/api/eventos';
const API_TIPOS = 'http://localhost:3000/api/tipos-entrada';

// Elementos del DOM
const loadingOverlay = document.getElementById('loadingOverlay');
const toastElement = document.getElementById('toastNotification');
const toast = new bootstrap.Toast(toastElement);
const modalEventoElement = document.getElementById('modalEvento');
const modalEvento = new bootstrap.Modal(modalEventoElement);
const formEvento = document.getElementById('formEvento');
const searchInput = document.getElementById('searchEventos');

let currentEditId = null;
let currentEventIdForTipos = null;      // ID del evento cuyos tipos se están gestionando
let tiposCache = [];                     // Para almacenar los tipos del evento actual

// =========================
// UTILIDADES
// =========================
function mostrarLoading(show) {
    if (show) loadingOverlay.classList.add('active');
    else loadingOverlay.classList.remove('active');
}

function mostrarToast(titulo, mensaje, tipo = 'success') {
    const toastIcon = document.getElementById('toastIcon');
    const toastTitle = document.getElementById('toastTitle');
    const toastMessage = document.getElementById('toastMessage');

    if (tipo === 'success') {
        toastIcon.className = 'bi bi-check-circle-fill text-success me-2';
        toastTitle.textContent = titulo;
    } else if (tipo === 'error') {
        toastIcon.className = 'bi bi-exclamation-triangle-fill text-danger me-2';
        toastTitle.textContent = titulo;
    } else {
        toastIcon.className = 'bi bi-info-circle-fill text-info me-2';
        toastTitle.textContent = titulo;
    }
    toastMessage.textContent = mensaje;
    toast.show();
}

function formatearFecha(fecha) {
    if (!fecha) return 'No definida';
    return new Date(fecha).toLocaleString();
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function (m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// =========================
// CRUD EVENTOS
// =========================
async function cargarEventos() {
    mostrarLoading(true);
    try {
        const response = await fetch(API_BASE);
        if (!response.ok) throw new Error('Error al cargar eventos');
        const eventos = await response.json();

        const tbody = document.querySelector('#tablaEventos tbody');
        tbody.innerHTML = '';

        if (eventos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-5 text-muted">No hay eventos registrados</td></tr>';
            actualizarStats(eventos);
            return;
        }

        // Para cada evento, obtenemos el stock total (suma de stock_disponible de sus tipos)
        const eventosConStock = await Promise.all(eventos.map(async ev => {
            try {
                const resTipos = await fetch(`${API_BASE}/${ev.id_evento}/tipos`);
                if (resTipos.ok) {
                    const tipos = await resTipos.json();
                    const stockTotal = tipos.reduce((sum, t) => sum + (t.stock_disponible || 0), 0);
                    return { ...ev, stockTotal };
                }
            } catch (e) {
                console.error(`Error al obtener tipos para evento ${ev.id_evento}`, e);
            }
            return { ...ev, stockTotal: 0 };
        }));

        eventosConStock.forEach(ev => {
            const fecha = ev.fecha_evento;
            const lugarCiudad = [ev.lugar, ev.ciudad].filter(Boolean).join(', ') || ev.lugar || 'Sin lugar';
            let estadoBadge = '';
            switch (ev.estado) {
                case 'publicado': estadoBadge = '<span class="badge bg-success">Publicado</span>'; break;
                case 'borrador': estadoBadge = '<span class="badge bg-secondary">Borrador</span>'; break;
                case 'agotado': estadoBadge = '<span class="badge bg-warning text-dark">Agotado</span>'; break;
                case 'cancelado': estadoBadge = '<span class="badge bg-danger">Cancelado</span>'; break;
                case 'finalizado': estadoBadge = '<span class="badge bg-info">Finalizado</span>'; break;
                default: estadoBadge = `<span class="badge bg-light text-dark">${ev.estado}</span>`;
            }

            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${escapeHtml(ev.titulo)}</strong></td>
                <td>${formatearFecha(fecha)}</td>
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

        actualizarStats(eventos);
    } catch (error) {
        console.error(error);
        mostrarToast('Error', 'No se pudieron cargar los eventos', 'error');
        document.querySelector('#tablaEventos tbody').innerHTML = '<tr><td colspan="6" class="text-center text-danger py-5">Error al cargar datos</td></tr>';
    } finally {
        mostrarLoading(false);
    }
}

function actualizarStats(eventos) {
    const total = eventos.length;
    const publicados = eventos.filter(ev => ev.estado === 'publicado').length;
    const hoy = new Date();
    const proximos = eventos.filter(ev => new Date(ev.fecha_evento) > hoy).length;

    document.getElementById('totalEventos').textContent = total;
    document.getElementById('eventosActivos').textContent = publicados;
    document.getElementById('eventosProximos').textContent = proximos;
    document.getElementById('badgeEventos').textContent = total;
}

async function guardarEvento(event) {
    event.preventDefault();

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

        const response = await fetch(url, { method, body: formData });
        if (!response.ok) throw new Error('Error al guardar');

        const result = await response.json();
        if (result.ok === false) throw new Error(result.message);

        mostrarToast('Éxito', currentEditId ? 'Evento actualizado correctamente' : 'Evento creado correctamente');
        modalEvento.hide();
        formEvento.reset();
        currentEditId = null;
        document.getElementById('modalTitle').textContent = 'Crear Evento';
        const preview = document.getElementById('imagenPreview');
        if (preview) preview.style.display = 'none';
        cargarEventos();
    } catch (error) {
        console.error(error);
        mostrarToast('Error', 'No se pudo guardar el evento', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function eliminarEvento(id) {
    if (!confirm('¿Estás seguro de eliminar este evento? Esta acción no se puede deshacer.')) return;

    mostrarLoading(true);
    try {
        const response = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Error al eliminar');
        mostrarToast('Eliminado', 'Evento eliminado correctamente');
        cargarEventos();
    } catch (error) {
        console.error(error);
        mostrarToast('Error', 'No se pudo eliminar el evento', 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function editarEvento(id) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_BASE}/${id}`);
        if (!response.ok) throw new Error('Error al obtener evento');
        const evento = await response.json();

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

        const previewContainer = document.getElementById('imagenPreview');
        if (previewContainer && evento.imagen_url) {
            const img = previewContainer.querySelector('img');
            if (img) {
                img.src = evento.imagen_url.startsWith('http') ? evento.imagen_url : `http://localhost:3000${evento.imagen_url}`;
                previewContainer.style.display = 'block';
            }
        } else if (previewContainer) {
            previewContainer.style.display = 'none';
        }

        currentEditId = evento.id_evento;
        document.getElementById('modalTitle').textContent = 'Editar Evento';
        modalEvento.show();
    } catch (error) {
        console.error(error);
        mostrarToast('Error', 'No se pudo cargar el evento para editar', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function abrirModalEvento() {
    currentEditId = null;
    formEvento.reset();
    document.getElementById('modalTitle').textContent = 'Crear Evento';
    const preview = document.getElementById('imagenPreview');
    if (preview) preview.style.display = 'none';
    modalEvento.show();
}

function filtrarEventos() {
    const term = searchInput.value.toLowerCase().trim();
    const rows = document.querySelectorAll('#tablaEventos tbody tr');
    rows.forEach(row => {
        const texto = row.textContent.toLowerCase();
        if (term === '' || texto.includes(term)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

// =========================
// GESTIÓN DE TIPOS DE ENTRADA
// =========================
async function gestionarTipos(eventoId) {
    currentEventIdForTipos = eventoId;
    document.getElementById('tiposModalTitle').textContent = `Tipos de entrada - Evento #${eventoId}`;
    await cargarTipos(eventoId);
    const modal = new bootstrap.Modal(document.getElementById('modalTipos'));
    modal.show();
}

async function cargarTipos(eventoId) {
    const tiposListDiv = document.getElementById('tiposList');
    tiposListDiv.innerHTML = '<div class="alert alert-info">Cargando...</div>';
    try {
        const response = await fetch(`${API_TIPOS}/evento/${eventoId}`);
        if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
        const tipos = await response.json();
        tiposCache = tipos;
        renderTiposList(tipos);
    } catch (error) {
        console.error('Error al cargar tipos:', error);
        tiposListDiv.innerHTML = '<div class="alert alert-danger">Error al cargar tipos</div>';
    }
}

function renderTiposList(tipos) {
    const tiposListDiv = document.getElementById('tiposList');
    if (!tipos.length) {
        tiposListDiv.innerHTML = '<div class="alert alert-warning">No hay tipos de entrada para este evento.</div>';
        return;
    }

    let html = '<div class="table-responsive"><table class="table table-sm"><thead><tr><th>Nombre</th><th>Precio</th><th>Stock Total</th><th>Disponible</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>';
    tipos.forEach(tipo => {
        html += `
            <tr>
                <td>${escapeHtml(tipo.nombre)}</td>
                <td>$${parseFloat(tipo.precio).toFixed(2)}</td>
                <td>${tipo.stock_total}</td>
                <td>${tipo.stock_disponible}</td>
                <td><span class="badge ${tipo.estado === 'activo' ? 'bg-success' : 'bg-secondary'}">${tipo.estado}</span></td>
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
    document.getElementById('tipoNombre').value = tipo.nombre;
    document.getElementById('tipoPrecio').value = tipo.precio;
    document.getElementById('tipoDescripcion').value = tipo.descripcion || '';
    document.getElementById('tipoStockTotal').value = tipo.stock_total;
    document.getElementById('tipoStockDisponible').value = tipo.stock_disponible;
    document.getElementById('tipoEstado').value = tipo.estado;
}

function resetTipoForm() {
    document.getElementById('formTipo').reset();
    document.getElementById('tipoId').value = '';
}

async function guardarTipo(event) {
    event.preventDefault();

    const tipoId = document.getElementById('tipoId').value;
    const nombre = document.getElementById('tipoNombre').value.trim();
    const precio = parseFloat(document.getElementById('tipoPrecio').value);
    const descripcion = document.getElementById('tipoDescripcion').value.trim();
    const stockTotal = parseInt(document.getElementById('tipoStockTotal').value);
    const stockDisponible = parseInt(document.getElementById('tipoStockDisponible').value);
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

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Error al guardar tipo');
        }

        mostrarToast('Éxito', tipoId ? 'Tipo actualizado' : 'Tipo creado');
        resetTipoForm();
        await cargarTipos(currentEventIdForTipos);
        // Actualizar la tabla de eventos para refrescar el stock mostrado
        cargarEventos();
    } catch (error) {
        console.error(error);
        mostrarToast('Error', error.message, 'error');
    } finally {
        mostrarLoading(false);
    }
}

async function eliminarTipo(tipoId) {
    if (!confirm('¿Estás seguro de eliminar este tipo de entrada? Esto podría afectar órdenes existentes.')) return;

    mostrarLoading(true);
    try {
        const response = await fetch(`${API_TIPOS}/${tipoId}`, { method: 'DELETE' });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Error al eliminar tipo');
        }
        mostrarToast('Éxito', 'Tipo eliminado');
        await cargarTipos(currentEventIdForTipos);
        cargarEventos();
    } catch (error) {
        console.error(error);
        mostrarToast('Error', error.message, 'error');
    } finally {
        mostrarLoading(false);
    }
}

// =========================
// NAVEGACIÓN ENTRE SECCIONES
// =========================
function mostrarSeccion(id) {
    document.querySelectorAll('.seccion').forEach(sec => sec.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');

    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const section = link.getAttribute('data-section');

            // SOLO prevenir si es navegación interna
            if (section && link.getAttribute('href') === '#') {
                e.preventDefault();
                mostrarSeccion(section);
            }
        });
    });
}

function descargarCSV() {
    mostrarToast('Información', 'Función en desarrollo', 'info');
}

// =========================
// INICIALIZACIÓN
// =========================
document.addEventListener('DOMContentLoaded', () => {
    cargarEventos();
    formEvento.addEventListener('submit', guardarEvento);
    searchInput.addEventListener('input', filtrarEventos);

    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const section = link.getAttribute('data-section');
            if (section) {
                e.preventDefault();
                mostrarSeccion(section);
            }
            // Si no tiene data-section, permitir navegación normal
        });
    });

    modalEventoElement.addEventListener('hidden.bs.modal', () => {
        formEvento.reset();
        currentEditId = null;
        const preview = document.getElementById('imagenPreview');
        if (preview) preview.style.display = 'none';
    });

    // Gestión de tipos
    document.getElementById('formTipo').addEventListener('submit', guardarTipo);
    document.getElementById('btnCancelarTipo').addEventListener('click', resetTipoForm);

    const modalTipos = document.getElementById('modalTipos');
    modalTipos.addEventListener('hidden.bs.modal', () => {
        resetTipoForm();
        currentEventIdForTipos = null;
        tiposCache = [];
    });
});