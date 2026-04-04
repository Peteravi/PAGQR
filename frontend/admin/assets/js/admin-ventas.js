const API = '/api/ventas';

// Elementos del DOM
const loadingOverlay = document.getElementById('loadingOverlay');
let chartInstance = null;
let logoutModalInstance = null;
let adminCsrfToken = '';

// ===============================
// CSRF
// ===============================
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

// ===============================
// UTILIDADES
// ===============================
function mostrarLoading(show) {
    if (!loadingOverlay) return;
    if (show) loadingOverlay.classList.add('active');
    else loadingOverlay.classList.remove('active');
}

function mostrarToast(titulo, mensaje, tipo = 'success') {
    const toastElement = document.getElementById('toastNotification');
    const toastIcon = document.getElementById('toastIcon');
    const toastTitle = document.getElementById('toastTitle');
    const toastMessage = document.getElementById('toastMessage');

    if (!toastElement || typeof bootstrap === 'undefined') return;

    toastElement.className = 'toast border-0';

    if (tipo === 'success') {
        toastElement.classList.add('text-bg-success');
        if (toastIcon) toastIcon.className = 'bi bi-check-circle-fill me-2';
        if (toastTitle) toastTitle.textContent = titulo;
    } else if (tipo === 'error') {
        toastElement.classList.add('text-bg-danger');
        if (toastIcon) toastIcon.className = 'bi bi-exclamation-triangle-fill me-2';
        if (toastTitle) toastTitle.textContent = titulo;
    } else if (tipo === 'warning') {
        toastElement.classList.add('text-bg-warning');
        if (toastIcon) toastIcon.className = 'bi bi-exclamation-circle-fill me-2';
        if (toastTitle) toastTitle.textContent = titulo;
    } else {
        toastElement.classList.add('text-bg-primary');
        if (toastIcon) toastIcon.className = 'bi bi-info-circle-fill me-2';
        if (toastTitle) toastTitle.textContent = titulo;
    }

    if (toastMessage) toastMessage.textContent = mensaje;

    const toast = new bootstrap.Toast(toastElement, { autohide: true, delay: 4000 });
    toast.show();
}

function formatearMoneda(valor) {
    return new Intl.NumberFormat('es-EC', {
        style: 'currency',
        currency: 'USD'
    }).format(Number(valor) || 0);
}

function formatearFecha(fecha) {
    if (!fecha) return '-';
    const f = new Date(fecha);
    if (isNaN(f.getTime())) return '-';
    return f.toLocaleString('es-ES');
}

function obtenerBadgeEstado(estado) {
    const estados = {
        pagada: '<span class="badge bg-success">Pagada</span>',
        pendiente: '<span class="badge bg-warning text-dark">Pendiente</span>',
        fallida: '<span class="badge bg-danger">Fallida</span>',
        cancelada: '<span class="badge bg-secondary">Cancelada</span>',
        reembolsada: '<span class="badge bg-info">Reembolsada</span>',
        activo: '<span class="badge bg-success">Activo</span>',
        inactivo: '<span class="badge bg-secondary">Inactivo</span>',
        agotado: '<span class="badge bg-warning text-dark">Agotado</span>'
    };
    return estados[estado] || `<span class="badge bg-light text-dark">${escapeHtml(estado || '-')}</span>`;
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

// ===============================
// LOGOUT MODAL
// ===============================
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

        mostrarToast('Error', 'No se pudo cerrar la sesión', 'error');
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

// ===============================
// INICIALIZACIÓN
// ===============================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await obtenerCsrfToken();
    } catch (error) {
        console.error('Error inicializando CSRF:', error);
        mostrarToast('Error', 'No se pudo inicializar la seguridad del panel', 'error');
    }

    cargarTodosLosDatos();
    inicializarLogoutModal();
});

async function cargarTodosLosDatos() {
    mostrarLoading(true);
    try {
        await Promise.all([
            cargarResumen(),
            cargarOrdenes(),
            cargarVentasPorEvento(),
            cargarStock(),
            cargarPagos(),
            cargarVentasPorDia()
        ]);
    } catch (error) {
        console.error('Error al cargar datos:', error);
        mostrarToast('Error', 'Ocurrió un error al cargar los datos', 'error');
    } finally {
        mostrarLoading(false);
        aplicarAnimaciones();
    }
}

// ===============================
// 1. RESUMEN (KPIs)
// ===============================
async function cargarResumen() {
    try {
        const res = await fetch(`${API}/resumen`, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('Error en la respuesta del servidor');

        const data = await res.json();

        document.getElementById('totalVendido').innerText = formatearMoneda(data.total_vendido);
        document.getElementById('totalOrdenes').innerText = data.total_ordenes ?? '0';
        document.getElementById('ingresosReales').innerText = formatearMoneda(data.ingresos_reales);
        document.getElementById('ventasFallidas').innerText = data.ventas_fallidas ?? '0';
    } catch (error) {
        console.error('Error cargando resumen:', error);
        mostrarToast('Error', 'No se pudo cargar el resumen de ventas', 'error');

        document.getElementById('totalVendido').innerText = formatearMoneda(0);
        document.getElementById('totalOrdenes').innerText = '0';
        document.getElementById('ingresosReales').innerText = formatearMoneda(0);
        document.getElementById('ventasFallidas').innerText = '0';
    }
}

// ===============================
// 2. ÓRDENES
// ===============================
async function cargarOrdenes() {
    try {
        const res = await fetch(`${API}/ordenes`, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('Error al obtener órdenes');

        const data = await res.json();
        const tabla = document.getElementById('tablaOrdenes');

        if (!Array.isArray(data) || !data.length) {
            tabla.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No hay órdenes registradas</td></tr>';
            return;
        }

        tabla.innerHTML = data.map(orden => `
            <tr class="fade-in-row">
                <td>${escapeHtml(orden.codigo_orden)}</td>
                <td>${escapeHtml(orden.cliente)}</td>
                <td>${formatearMoneda(orden.total)}</td>
                <td>${obtenerBadgeEstado(orden.estado)}</td>
                <td>${escapeHtml(orden.metodo_pago || '-')}</td>
                <td>${formatearFecha(orden.fecha_creacion)}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="verDetalle(${orden.id_orden})">
                        <i class="bi bi-eye"></i> Ver
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error cargando órdenes:', error);
        document.getElementById('tablaOrdenes').innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error al cargar órdenes</td></tr>';
        mostrarToast('Error', 'No se pudieron cargar las órdenes', 'error');
    }
}

// ===============================
// 3. DETALLE DE ORDEN
// ===============================
window.verDetalle = async function (id) {
    try {
        const res = await fetch(`${API}/ordenes/${id}`, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('Error al obtener detalle');

        const data = await res.json();
        const tabla = document.getElementById('tablaDetalleOrden');

        if (!Array.isArray(data) || !data.length) {
            tabla.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay detalles para esta orden</td></tr>';
            return;
        }

        tabla.innerHTML = data.map(item => `
            <tr class="fade-in-row">
                <td>${escapeHtml(item.evento)}</td>
                <td>${escapeHtml(item.tipo_entrada)}</td>
                <td>${Number(item.cantidad) || 0}</td>
                <td>${formatearMoneda(item.precio_unitario)}</td>
                <td>${formatearMoneda(item.subtotal)}</td>
            </tr>
        `).join('');

        tabla.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        console.error('Error cargando detalle:', error);
        mostrarToast('Error', 'No se pudo cargar el detalle de la orden', 'error');
    }
};

// ===============================
// 4. VENTAS POR EVENTO
// ===============================
async function cargarVentasPorEvento() {
    try {
        const res = await fetch(`${API}/ventas-por-evento`, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('Error al obtener ventas por evento');

        const data = await res.json();
        const tabla = document.getElementById('tablaVentasEvento');

        if (!Array.isArray(data) || !data.length) {
            tabla.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No hay ventas registradas</td></tr>';
            return;
        }

        tabla.innerHTML = data.map(item => `
            <tr class="fade-in-row">
                <td>${escapeHtml(item.titulo)}</td>
                <td>${Number(item.entradas_vendidas) || 0}</td>
                <td>${formatearMoneda(item.total_generado)}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error ventas por evento:', error);
        document.getElementById('tablaVentasEvento').innerHTML = '<tr><td colspan="3" class="text-center text-danger">Error al cargar datos</td></tr>';
        mostrarToast('Error', 'No se pudieron cargar las ventas por evento', 'error');
    }
}

// ===============================
// 5. STOCK
// ===============================
async function cargarStock() {
    try {
        const res = await fetch(`${API}/stock`, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('Error al obtener stock');

        const data = await res.json();
        const tabla = document.getElementById('tablaStock');

        if (!Array.isArray(data) || !data.length) {
            tabla.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay tipos de entrada registrados</td></tr>';
            return;
        }

        tabla.innerHTML = data.map(item => `
            <tr class="fade-in-row">
                <td>${escapeHtml(item.evento)}</td>
                <td>${escapeHtml(item.tipo_entrada)}</td>
                <td>${Number(item.stock_total) || 0}</td>
                <td>${Number(item.stock_disponible) || 0}</td>
                <td>${Number(item.vendidos) || 0}</td>
                <td>${obtenerBadgeEstado(item.estado)}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error cargando stock:', error);
        document.getElementById('tablaStock').innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error al cargar stock</td></tr>';
        mostrarToast('Error', 'No se pudo cargar el control de stock', 'error');
    }
}

// ===============================
// 6. PAGOS
// ===============================
async function cargarPagos() {
    try {
        const res = await fetch(`${API}/pagos`, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('Error al obtener pagos');

        const data = await res.json();
        const tabla = document.getElementById('tablaPagos');

        if (!Array.isArray(data) || !data.length) {
            tabla.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay pagos registrados</td></tr>';
            return;
        }

        tabla.innerHTML = data.map(pago => `
            <tr class="fade-in-row">
                <td>${escapeHtml(pago.codigo_orden)}</td>
                <td>${escapeHtml(pago.proveedor_pago)}</td>
                <td>${obtenerBadgeEstado(pago.estado)}</td>
                <td>${formatearMoneda(pago.monto)}</td>
                <td>${formatearFecha(pago.fecha_pago)}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error cargando pagos:', error);
        document.getElementById('tablaPagos').innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error al cargar pagos</td></tr>';
        mostrarToast('Error', 'No se pudieron cargar los pagos', 'error');
    }
}

// ===============================
// 7. VENTAS POR DÍA (GRÁFICO)
// ===============================
async function cargarVentasPorDia() {
    try {
        const res = await fetch(`${API}/ventas-por-dia`, { credentials: 'same-origin' });
        if (!res.ok) throw new Error('Error al obtener datos del gráfico');

        const data = await res.json();
        const labels = Array.isArray(data) ? data.map(item => item.fecha) : [];
        const valores = Array.isArray(data) ? data.map(item => item.total_dia) : [];

        const canvas = document.getElementById('graficoVentas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        if (chartInstance) {
            chartInstance.destroy();
        }

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Ventas por día',
                    data: valores,
                    borderColor: '#0d6efd',
                    backgroundColor: 'rgba(13, 110, 253, 0.1)',
                    tension: 0.3,
                    fill: true,
                    pointBackgroundColor: '#0d6efd',
                    pointBorderColor: '#fff',
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${formatearMoneda(ctx.raw)}`
                        }
                    },
                    legend: {
                        display: true,
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: (value) => formatearMoneda(value)
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error gráfico ventas:', error);
        mostrarToast('Error', 'No se pudo cargar el gráfico de ventas', 'error');
    }
}

// ===============================
// ANIMACIONES
// ===============================
function aplicarAnimaciones() {
    const elementosAnimados = document.querySelectorAll('.stats-card, .chart-card, .table-card');

    elementosAnimados.forEach((el, index) => {
        el.style.animation = `fadeInUp 0.5s ease forwards ${index * 0.05}s`;
        el.style.opacity = '0';
    });

    if (!document.querySelector('#animacionesStyle')) {
        const style = document.createElement('style');
        style.id = 'animacionesStyle';
        style.textContent = `
            @keyframes fadeInUp {
                from {
                    opacity: 0;
                    transform: translateY(20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            .fade-in-row {
                animation: fadeInUp 0.3s ease forwards;
            }
            .stats-card, .chart-card, .table-card {
                opacity: 0;
            }
        `;
        document.head.appendChild(style);
    }
}