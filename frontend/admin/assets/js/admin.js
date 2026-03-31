// Configuración de la API (ajusta la URL según tu backend)
const API_BASE = 'http://localhost:3000/api/eventos';

// Elementos del DOM
const loadingOverlay = document.getElementById('loadingOverlay');
const toastElement = document.getElementById('toastNotification');
const toast = new bootstrap.Toast(toastElement);
const modalEventoElement = document.getElementById('modalEvento');
const modalEvento = new bootstrap.Modal(modalEventoElement);
const formEvento = document.getElementById('formEvento');
const searchInput = document.getElementById('searchEventos');

let currentEditId = null;

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
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted">No hay eventos registrados</td></tr>';
            actualizarStats(eventos);
            return;
        }

        eventos.forEach(ev => {
            const fecha = ev.fecha_evento || ev.fecha_inicio;
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
                <td class="text-end">
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
        document.querySelector('#tablaEventos tbody').innerHTML = '<tr><td colspan="5" class="text-center text-danger py-5">Error al cargar datos</td></tr>';
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

// =========================
// GUARDAR EVENTO (con FormData para imagen)
// =========================
async function guardarEvento(event) {
    event.preventDefault();

    const formData = new FormData(formEvento);

    // Validación básica
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

        const response = await fetch(url, {
            method,
            body: formData  // No establecer headers, fetch los maneja automáticamente
        });

        if (!response.ok) throw new Error('Error al guardar');

        const result = await response.json();
        if (result.ok === false) throw new Error(result.message);

        mostrarToast('Éxito', currentEditId ? 'Evento actualizado correctamente' : 'Evento creado correctamente');
        modalEvento.hide();
        formEvento.reset();
        currentEditId = null;
        document.getElementById('modalTitle').textContent = 'Crear Evento';
        // Limpiar preview de imagen si existe
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

// =========================
// ELIMINAR EVENTO
// =========================
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

// =========================
// EDITAR EVENTO (con preview de imagen y precio)
// =========================
async function editarEvento(id) {
    mostrarLoading(true);
    try {
        const response = await fetch(`${API_BASE}/${id}`);
        if (!response.ok) throw new Error('Error al obtener evento');
        const evento = await response.json();

        // Llenar formulario (excluyendo el input file)
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
        formEvento.precio.value = evento.precio || 0;  // Añadir el precio

        // Mostrar preview de la imagen actual si existe
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
    // Ocultar preview
    const preview = document.getElementById('imagenPreview');
    if (preview) preview.style.display = 'none';
    modalEvento.show();
}

// =========================
// FILTRO DE BÚSQUEDA
// =========================
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
// NAVEGACIÓN ENTRE SECCIONES
// =========================
function mostrarSeccion(id) {
    document.querySelectorAll('.seccion').forEach(sec => sec.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');

    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('data-section') === id) {
            link.classList.add('active');
        }
    });
}

// =========================
// DESCARGA CSV (placeholder)
// =========================
function descargarCSV() {
    mostrarToast('Información', 'Función en desarrollo', 'info');
}

// =========================
// ESCAPE HTML (seguridad)
// =========================
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
// INICIALIZACIÓN
// =========================
document.addEventListener('DOMContentLoaded', () => {
    cargarEventos();
    formEvento.addEventListener('submit', guardarEvento);
    searchInput.addEventListener('input', filtrarEventos);

    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.getAttribute('data-section');
            if (section) mostrarSeccion(section);
        });
    });

    modalEventoElement.addEventListener('hidden.bs.modal', () => {
        formEvento.reset();
        currentEditId = null;
        const preview = document.getElementById('imagenPreview');
        if (preview) preview.style.display = 'none';
    });
});