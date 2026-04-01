const API = 'http://localhost:3000/api/ventas';

// Elementos del DOM
const loadingOverlay = document.getElementById('loadingOverlay');
let chartInstance = null; // Para poder destruir el gráfico si se recarga

// ===============================
// UTILIDADES
// ===============================
function mostrarLoading(show) {
    if (show) {
        loadingOverlay.classList.add('active');
    } else {
        loadingOverlay.classList.remove('active');
    }
}

function mostrarToast(titulo, mensaje, tipo = 'success') {
    const toastElement = document.getElementById('toastNotification');
    const toastIcon = document.getElementById('toastIcon');
    const toastTitle = document.getElementById('toastTitle');
    const toastMessage = document.getElementById('toastMessage');

    if (!toastElement) return;

    // Configurar icono y clase según tipo
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

    const toast = new bootstrap.Toast(toastElement, { autohide: true, delay: 4000 });
    toast.show();
}

function formatearMoneda(valor) {
    return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(valor);
}

function formatearFecha(fecha) {
    if (!fecha) return '-';
    return new Date(fecha).toLocaleString('es-ES');
}

function obtenerBadgeEstado(estado) {
    const estados = {
        'pagada': '<span class="badge bg-success">Pagada</span>',
        'pendiente': '<span class="badge bg-warning text-dark">Pendiente</span>',
        'fallida': '<span class="badge bg-danger">Fallida</span>',
        'cancelada': '<span class="badge bg-secondary">Cancelada</span>',
        'reembolsada': '<span class="badge bg-info">Reembolsada</span>',
        'activo': '<span class="badge bg-success">Activo</span>',
        'inactivo': '<span class="badge bg-secondary">Inactivo</span>',
        'agotado': '<span class="badge bg-warning text-dark">Agotado</span>'
    };
    return estados[estado] || `<span class="badge bg-light text-dark">${estado}</span>`;
}

// ===============================
// INICIALIZACIÓN
// ===============================
document.addEventListener('DOMContentLoaded', () => {
    cargarTodosLosDatos();

    // Opcional: recargar cada 30 segundos (descomentar si se desea)
    // setInterval(cargarTodosLosDatos, 30000);
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
        // Aplicar animaciones después de cargar
        aplicarAnimaciones();
    }
}

// ===============================
// 1. RESUMEN (KPIs)
// ===============================
async function cargarResumen() {
    try {
        const res = await fetch(`${API}/resumen`);
        if (!res.ok) throw new Error('Error en la respuesta del servidor');
        const data = await res.json();

        document.getElementById('totalVendido').innerText = formatearMoneda(data.total_vendido);
        document.getElementById('totalOrdenes').innerText = data.total_ordenes;
        document.getElementById('ingresosReales').innerText = formatearMoneda(data.ingresos_reales);
        document.getElementById('ventasFallidas').innerText = data.ventas_fallidas;
    } catch (error) {
        console.error('Error cargando resumen:', error);
        mostrarToast('Error', 'No se pudo cargar el resumen de ventas', 'error');
        // Mostrar valores por defecto
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
        const res = await fetch(`${API}/ordenes`);
        if (!res.ok) throw new Error('Error al obtener órdenes');
        const data = await res.json();

        const tabla = document.getElementById('tablaOrdenes');
        if (!data.length) {
            tabla.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No hay órdenes registradas</td></tr>';
            return;
        }

        tabla.innerHTML = data.map(orden => `
            <tr class="fade-in-row">
                <td>${escapeHtml(orden.codigo_orden)}</td>
                <td>${escapeHtml(orden.cliente)}</td>
                <td>${formatearMoneda(orden.total)}</td>
                <td>${obtenerBadgeEstado(orden.estado)}</td>
                <td>${orden.metodo_pago || '-'}</td>
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
        const res = await fetch(`${API}/ordenes/${id}`);
        if (!res.ok) throw new Error('Error al obtener detalle');
        const data = await res.json();

        const tabla = document.getElementById('tablaDetalleOrden');
        if (!data.length) {
            tabla.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay detalles para esta orden</td></tr>';
            return;
        }

        tabla.innerHTML = data.map(item => `
            <tr class="fade-in-row">
                <td>${escapeHtml(item.evento)}</td>
                <td>${escapeHtml(item.tipo_entrada)}</td>
                <td>${item.cantidad}</td>
                <td>${formatearMoneda(item.precio_unitario)}</td>
                <td>${formatearMoneda(item.subtotal)}</td>
            </tr>
        `).join('');

        // Desplazar suavemente a la tabla de detalle
        document.getElementById('tablaDetalleOrden').scrollIntoView({ behavior: 'smooth' });
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
        const res = await fetch(`${API}/ventas-por-evento`);
        if (!res.ok) throw new Error('Error al obtener ventas por evento');
        const data = await res.json();

        const tabla = document.getElementById('tablaVentasEvento');
        if (!data.length) {
            tabla.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No hay ventas registradas</td></tr>';
            return;
        }

        tabla.innerHTML = data.map(item => `
            <tr class="fade-in-row">
                <td>${escapeHtml(item.titulo)}</td>
                <td>${item.entradas_vendidas}</td>
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
        const res = await fetch(`${API}/stock`);
        if (!res.ok) throw new Error('Error al obtener stock');
        const data = await res.json();

        const tabla = document.getElementById('tablaStock');
        if (!data.length) {
            tabla.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay tipos de entrada registrados</td></tr>';
            return;
        }

        tabla.innerHTML = data.map(item => `
            <tr class="fade-in-row">
                <td>${escapeHtml(item.evento)}</td>
                <td>${escapeHtml(item.tipo_entrada)}</td>
                <td>${item.stock_total}</td>
                <td>${item.stock_disponible}</td>
                <td>${item.vendidos}</td>
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
        const res = await fetch(`${API}/pagos`);
        if (!res.ok) throw new Error('Error al obtener pagos');
        const data = await res.json();

        const tabla = document.getElementById('tablaPagos');
        if (!data.length) {
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
        const res = await fetch(`${API}/ventas-por-dia`);
        if (!res.ok) throw new Error('Error al obtener datos del gráfico');
        const data = await res.json();

        const labels = data.map(item => item.fecha);
        const valores = data.map(item => item.total_dia);

        const ctx = document.getElementById('graficoVentas').getContext('2d');

        // Destruir gráfico anterior si existe
        if (chartInstance) {
            chartInstance.destroy();
        }

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
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
// ANIMACIONES Y UTILIDADES
// ===============================
function aplicarAnimaciones() {
    // Agregar clase fade-in a todas las tarjetas y tablas
    const elementosAnimados = document.querySelectorAll('.stats-card, .chart-card, .table-card');
    elementosAnimados.forEach((el, index) => {
        el.style.animation = `fadeInUp 0.5s ease forwards ${index * 0.05}s`;
        el.style.opacity = '0';
    });

    // Definir la animación si no existe en CSS
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

// Función para escapar HTML (seguridad)
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function (m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}