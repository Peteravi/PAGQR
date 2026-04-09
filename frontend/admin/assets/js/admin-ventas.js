const API = '/api/ventas';

// Elementos del DOM
const loadingOverlay = document.getElementById('loadingOverlay');
let chartInstance = null;
let logoutModalInstance = null;
let adminCsrfToken = '';
let ultimaOrdenSeleccionada = null;

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

async function fetchJson(url, options = {}) {
    const res = await fetch(url, {
        credentials: 'same-origin',
        ...options
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
        const message =
            data?.message ||
            data?.error ||
            `Error HTTP ${res.status}`;
        throw new Error(message);
    }

    return data;
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
    } else if (tipo === 'error') {
        toastElement.classList.add('text-bg-danger');
        if (toastIcon) toastIcon.className = 'bi bi-exclamation-triangle-fill me-2';
    } else if (tipo === 'warning') {
        toastElement.classList.add('text-bg-warning');
        if (toastIcon) toastIcon.className = 'bi bi-exclamation-circle-fill me-2';
    } else {
        toastElement.classList.add('text-bg-primary');
        if (toastIcon) toastIcon.className = 'bi bi-info-circle-fill me-2';
    }

    if (toastTitle) toastTitle.textContent = titulo;
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
    return f.toLocaleString('es-EC');
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

function normalizarEstado(estado) {
    return String(estado || '').trim().toLowerCase();
}

function obtenerBadgeEstado(estado) {
    const e = normalizarEstado(estado);

    const estados = {
        // estados de orden
        pagada: '<span class="badge bg-success">Pagada</span>',
        pendiente: '<span class="badge bg-warning text-dark">Pendiente</span>',
        fallida: '<span class="badge bg-danger">Fallida</span>',
        cancelada: '<span class="badge bg-secondary">Cancelada</span>',
        reembolsada: '<span class="badge bg-info text-dark">Reembolsada</span>',

        // estados de pago
        iniciado: '<span class="badge bg-light text-dark border">Iniciado</span>',
        aprobado: '<span class="badge bg-success">Aprobado</span>',
        rechazado: '<span class="badge bg-danger">Rechazado</span>',
        anulado: '<span class="badge bg-secondary">Anulado</span>',
        reembolsado: '<span class="badge bg-info text-dark">Reembolsado</span>',

        // estados de stock
        activo: '<span class="badge bg-success">Activo</span>',
        inactivo: '<span class="badge bg-secondary">Inactivo</span>',
        agotado: '<span class="badge bg-warning text-dark">Agotado</span>'
    };

    return estados[e] || `<span class="badge bg-light text-dark border">${escapeHtml(estado || '-')}</span>`;
}

function obtenerBadgeEstadoComercial(ordenEstado, pagoEstado) {
    const oe = normalizarEstado(ordenEstado);
    const pe = normalizarEstado(pagoEstado);

    if (oe === 'pagada' || pe === 'aprobado') {
        return '<span class="badge bg-success">Cobrada</span>';
    }

    if (oe === 'reembolsada' || pe === 'reembolsado') {
        return '<span class="badge bg-info text-dark">Reembolsada</span>';
    }

    if (oe === 'fallida' || oe === 'cancelada' || pe === 'rechazado' || pe === 'anulado') {
        return '<span class="badge bg-danger">No aprobada</span>';
    }

    if (oe === 'pendiente' || pe === 'pendiente' || pe === 'iniciado') {
        return '<span class="badge bg-warning text-dark">Pendiente</span>';
    }

    return obtenerBadgeEstado(ordenEstado || pagoEstado || '-');
}

function actualizarUltimaActualizacion() {
    const el = document.getElementById('badgeUltimaActualizacion');
    if (!el) return;
    el.textContent = `Última actualización: ${new Date().toLocaleString('es-EC')}`;
}

function setTexto(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
}

function setHtml(id, valor) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = valor;
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
            confirmLogoutBtn.innerHTML = `Sí, salir`;
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

    inicializarLogoutModal();
    inicializarAcciones();
    await cargarTodosLosDatos();
});

function inicializarAcciones() {
    const btnRecargar = document.getElementById('btnRecargarVentas');
    if (btnRecargar) {
        btnRecargar.addEventListener('click', async () => {
            await cargarTodosLosDatos(true);
        });
    }
}

async function cargarTodosLosDatos(mostrarMensaje = false) {
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

        actualizarUltimaActualizacion();

        if (mostrarMensaje) {
            mostrarToast('Actualizado', 'Los datos del panel se actualizaron correctamente', 'success');
        }

        if (ultimaOrdenSeleccionada) {
            await cargarResumenOrdenSeleccionada(ultimaOrdenSeleccionada);
            await cargarDetalleOrden(ultimaOrdenSeleccionada);
        }
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
        const data = await fetchJson(`${API}/resumen`);

        setTexto('totalVendido', formatearMoneda(data.total_vendido));
        setTexto('totalOrdenes', String(data.total_ordenes ?? 0));
        setTexto('ingresosReales', formatearMoneda(data.monto_pendiente ?? 0));
        setTexto('ventasFallidas', String(data.ventas_fallidas ?? 0));
    } catch (error) {
        console.error('Error cargando resumen:', error);
        mostrarToast('Error', 'No se pudo cargar el resumen de ventas', 'error');

        setTexto('totalVendido', formatearMoneda(0));
        setTexto('totalOrdenes', '0');
        setTexto('ingresosReales', formatearMoneda(0));
        setTexto('ventasFallidas', '0');
    }
}

// ===============================
// 2. ÓRDENES
// ===============================
async function cargarOrdenes() {
    try {
        const data = await fetchJson(`${API}/ordenes`);
        const tabla = document.getElementById('tablaOrdenes');

        if (!tabla) return;

        if (!Array.isArray(data) || !data.length) {
            tabla.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No hay órdenes registradas</td></tr>';
            return;
        }

        tabla.innerHTML = data.map(orden => {
            const badgeComercial = obtenerBadgeEstadoComercial(orden.estado, orden.pago_estado);

            const metodoPago = escapeHtml(orden.metodo_pago || orden.proveedor_pago || '-');

            return `
                <tr class="fade-in-row">
                    <td>
                        <strong>${escapeHtml(orden.codigo_orden)}</strong>
                    </td>
                    <td>${escapeHtml(orden.cliente || '-')}</td>
                    <td>${formatearMoneda(orden.total)}</td>
                    <td>
                        <div class="d-flex flex-column gap-1">
                            <div>${badgeComercial}</div>
                            <small class="text-muted">
                                Orden: ${escapeHtml(orden.estado || '-')}
                            </small>
                            <small class="text-muted">
                                Pago: ${escapeHtml(orden.pago_estado || '-')}
                            </small>
                        </div>
                    </td>
                    <td>${metodoPago}</td>
                    <td>${formatearFecha(orden.fecha_creacion)}</td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="verDetalle(${Number(orden.id_orden)})">
                            <i class="bi bi-eye"></i> Ver
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Error cargando órdenes:', error);
        const tabla = document.getElementById('tablaOrdenes');
        if (tabla) {
            tabla.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error al cargar órdenes</td></tr>';
        }
        mostrarToast('Error', 'No se pudieron cargar las órdenes', 'error');
    }
}

// ===============================
// 3. DETALLE DE ORDEN
// ===============================
async function cargarDetalleOrden(id) {
    try {
        const data = await fetchJson(`${API}/ordenes/${id}`);
        const tabla = document.getElementById('tablaDetalleOrden');

        if (!tabla) return;

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
    } catch (error) {
        console.error('Error cargando detalle:', error);
        const tabla = document.getElementById('tablaDetalleOrden');
        if (tabla) {
            tabla.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error al cargar detalle</td></tr>';
        }
        mostrarToast('Error', 'No se pudo cargar el detalle de la orden', 'error');
    }
}

async function cargarResumenOrdenSeleccionada(id) {
    try {
        const data = await fetchJson(`${API}/ordenes/${id}/resumen`);

        const orden = data?.orden || {};
        const pago = data?.pago || {};
        const cliente = orden?.cliente || {};
        const totales = data?.totales || {};
        const entradas = data?.entradas || {};

        setTexto('badgeOrdenSeleccionada', orden.codigo_orden ? `Orden seleccionada: ${orden.codigo_orden}` : 'Orden seleccionada');
        setTexto('ordenResumenCodigo', orden.codigo_orden || '-');
        setTexto('ordenResumenCliente', `${cliente.nombres || ''} ${cliente.apellidos || ''}`.trim() || '-');
        setHtml('ordenResumenEstadoOrden', obtenerBadgeEstado(orden.estado));
        setHtml('ordenResumenEstadoPago', obtenerBadgeEstado(pago.estado || '-'));
        setTexto('ordenResumenEntradas', String(entradas.total_generadas ?? 0));
        setTexto('ordenResumenTotal', formatearMoneda(totales.total ?? 0));
        setTexto('ordenResumenMetodoPago', orden.metodo_pago || pago.proveedor_pago || '-');
        setTexto('ordenResumenFechaCreacion', formatearFecha(orden.fecha_creacion));
        setTexto('ordenResumenFechaActualizacion', formatearFecha(orden.fecha_actualizacion));
    } catch (error) {
        console.error('Error cargando resumen de orden:', error);
        mostrarToast('Error', 'No se pudo cargar el resumen de la orden', 'error');
        limpiarResumenOrdenSeleccionada();
    }
}

function limpiarResumenOrdenSeleccionada() {
    setTexto('badgeOrdenSeleccionada', 'Ninguna orden seleccionada');
    setTexto('ordenResumenCodigo', '-');
    setTexto('ordenResumenCliente', '-');
    setHtml('ordenResumenEstadoOrden', '-');
    setHtml('ordenResumenEstadoPago', '-');
    setTexto('ordenResumenEntradas', '0');
    setTexto('ordenResumenTotal', formatearMoneda(0));
    setTexto('ordenResumenMetodoPago', '-');
    setTexto('ordenResumenFechaCreacion', '-');
    setTexto('ordenResumenFechaActualizacion', '-');
}

window.verDetalle = async function (id) {
    ultimaOrdenSeleccionada = id;
    mostrarLoading(true);

    try {
        await Promise.all([
            cargarDetalleOrden(id),
            cargarResumenOrdenSeleccionada(id)
        ]);

        const resumen = document.getElementById('resumenOrdenSeleccionada');
        if (resumen) {
            resumen.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    } catch (error) {
        console.error('Error cargando vista de orden:', error);
    } finally {
        mostrarLoading(false);
    }
};

// ===============================
// 4. VENTAS POR EVENTO
// ===============================
async function cargarVentasPorEvento() {
    try {
        const data = await fetchJson(`${API}/ventas-por-evento`);
        const tabla = document.getElementById('tablaVentasEvento');

        if (!tabla) return;

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
        const tabla = document.getElementById('tablaVentasEvento');
        if (tabla) {
            tabla.innerHTML = '<tr><td colspan="3" class="text-center text-danger">Error al cargar datos</td></tr>';
        }
        mostrarToast('Error', 'No se pudieron cargar las ventas por evento', 'error');
    }
}

// ===============================
// 5. STOCK
// ===============================
async function cargarStock() {
    try {
        const data = await fetchJson(`${API}/stock`);
        const tabla = document.getElementById('tablaStock');

        if (!tabla) return;

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
        const tabla = document.getElementById('tablaStock');
        if (tabla) {
            tabla.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error al cargar stock</td></tr>';
        }
        mostrarToast('Error', 'No se pudo cargar el control de stock', 'error');
    }
}

// ===============================
// 6. PAGOS
// ===============================
async function cargarPagos() {
    try {
        const data = await fetchJson(`${API}/pagos`);
        const tabla = document.getElementById('tablaPagos');

        if (!tabla) return;

        if (!Array.isArray(data) || !data.length) {
            tabla.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay pagos registrados</td></tr>';
            return;
        }

        tabla.innerHTML = data.map(pago => `
            <tr class="fade-in-row">
                <td>${escapeHtml(pago.codigo_orden)}</td>
                <td>${escapeHtml(pago.proveedor_pago || '-')}</td>
                <td>
                    <div class="d-flex flex-column gap-1">
                        <div>${obtenerBadgeEstado(pago.estado)}</div>
                        ${pago.estado_orden ? `<small class="text-muted">Orden: ${escapeHtml(pago.estado_orden)}</small>` : ''}
                    </div>
                </td>
                <td>${formatearMoneda(pago.monto)}</td>
                <td>${formatearFecha(pago.fecha_pago || pago.fecha_creacion)}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Error cargando pagos:', error);
        const tabla = document.getElementById('tablaPagos');
        if (tabla) {
            tabla.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error al cargar pagos</td></tr>';
        }
        mostrarToast('Error', 'No se pudieron cargar los pagos', 'error');
    }
}

// ===============================
// 7. VENTAS POR DÍA (GRÁFICO)
// ===============================
async function cargarVentasPorDia() {
    try {
        const data = await fetchJson(`${API}/ventas-por-dia`);
        const labels = Array.isArray(data) ? data.map(item => item.fecha) : [];
        const valores = Array.isArray(data) ? data.map(item => Number(item.total_dia) || 0) : [];

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
                    label: 'Ventas cobradas por día',
                    data: valores,
                    borderColor: '#0d6efd',
                    backgroundColor: 'rgba(13, 110, 253, 0.10)',
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
                        beginAtZero: true,
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