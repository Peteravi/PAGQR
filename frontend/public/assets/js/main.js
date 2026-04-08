document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = '/api/eventos-publicos';
    const API_ORDENES = '/api/ordenes';
    const API_PAGOS = '/api/pagos/generar-link';
    const API_CSRF = '/api/admin-auth/csrf';
    const PLACEHOLDER_IMAGE = 'https://placehold.co/800x500?text=Evento';

    const STORAGE_KEYS = {
        lastPurchase: 'pagqr_last_purchase',
        currentTicket: 'pagqr_current_ticket'
    };

    const $ = (id) => document.getElementById(id);

    const eventosContainer = $('eventosContainer');
    const eventosCount = $('eventosCount');
    const searchInput = $('searchInput');
    const categorySelect = $('categorySelect');
    const citySelect = $('citySelect');

    const detailModalEl = $('detalleEventoModal');
    const compraModalEl = $('compraModal');

    let detalleModal = detailModalEl ? new bootstrap.Modal(detailModalEl) : null;
    let compraModal = compraModalEl ? new bootstrap.Modal(compraModalEl) : null;

    let csrfTokenCache = null;
    let pagoEnProceso = false;

    let eventos = [];
    let eventosFiltrados = [];
    let eventoSeleccionado = null;
    let tiposEntradaActuales = [];
    let tipoEntradaSeleccionado = null;

    function escapeHtml(texto = '') {
        const div = document.createElement('div');
        div.textContent = String(texto ?? '');
        return div.innerHTML;
    }

    function formatearMoneda(valor) {
        return `$${Number(valor || 0).toFixed(2)}`;
    }

    function formatearFecha(fechaStr) {
        if (!fechaStr) return '--';
        const fecha = new Date(fechaStr);
        if (Number.isNaN(fecha.getTime())) return '--';

        return fecha.toLocaleDateString('es-EC', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    function formatearHora(fechaStr) {
        if (!fechaStr) return '--';
        const fecha = new Date(fechaStr);
        if (Number.isNaN(fecha.getTime())) return '--';

        return fecha.toLocaleTimeString('es-EC', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function obtenerImagenEvento(imagenUrl) {
        if (!imagenUrl || typeof imagenUrl !== 'string') return PLACEHOLDER_IMAGE;

        if (
            imagenUrl.startsWith('http://') ||
            imagenUrl.startsWith('https://') ||
            imagenUrl.startsWith('/')
        ) {
            return imagenUrl;
        }

        return `/${imagenUrl}`;
    }

    function mostrarAlerta(mensaje) {
        alert(mensaje);
    }

    async function obtenerCsrfToken(forceRefresh = false) {
        if (csrfTokenCache && !forceRefresh) return csrfTokenCache;

        const response = await fetch(API_CSRF, {
            method: 'GET',
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json'
            }
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.ok || !data.csrfToken) {
            throw new Error(data.message || 'No se pudo obtener el token CSRF.');
        }

        csrfTokenCache = data.csrfToken;
        return csrfTokenCache;
    }

    async function fetchJson(url, options = {}) {
        const {
            withCsrf = false,
            retryCsrf = true,
            headers = {},
            ...rest
        } = options;

        const finalHeaders = {
            Accept: 'application/json',
            ...headers
        };

        if (withCsrf) {
            finalHeaders['CSRF-Token'] = await obtenerCsrfToken(false);
        }

        const response = await fetch(url, {
            credentials: 'same-origin',
            ...rest,
            headers: finalHeaders
        });

        let data = null;
        try {
            data = await response.json();
        } catch {
            data = null;
        }

        if (response.status === 403 && withCsrf && retryCsrf) {
            const nuevoToken = await obtenerCsrfToken(true);

            const retryResponse = await fetch(url, {
                credentials: 'same-origin',
                ...rest,
                headers: {
                    ...finalHeaders,
                    'CSRF-Token': nuevoToken
                }
            });

            let retryData = null;
            try {
                retryData = await retryResponse.json();
            } catch {
                retryData = null;
            }

            return { response: retryResponse, data: retryData };
        }

        return { response, data };
    }

    function actualizarResumenCompra() {
        const cantidad = Math.max(1, Number($('cantidad')?.value || 1));

        if ($('resumenEvento')) $('resumenEvento').textContent = `Evento: ${eventoSeleccionado?.titulo || '--'}`;
        if ($('resumenCantidad')) $('resumenCantidad').textContent = `Cantidad: ${cantidad}`;

        if (!tipoEntradaSeleccionado) {
            if ($('resumenTipo')) $('resumenTipo').textContent = 'Tipo: --';
            if ($('resumenPrecioUnitario')) $('resumenPrecioUnitario').textContent = 'Precio unitario: --';
            if ($('resumenTotal')) $('resumenTotal').textContent = 'Total: --';
            return;
        }

        const precio = Number(tipoEntradaSeleccionado.precio || 0);
        const total = precio * cantidad;

        if ($('resumenTipo')) $('resumenTipo').textContent = `Tipo: ${tipoEntradaSeleccionado.nombre || '--'}`;
        if ($('resumenPrecioUnitario')) $('resumenPrecioUnitario').textContent = `Precio unitario: ${formatearMoneda(precio)}`;
        if ($('resumenTotal')) $('resumenTotal').textContent = `Total: ${formatearMoneda(total)}`;
    }

    function actualizarCantidadSegunTipo() {
        const cantidadInput = $('cantidad');
        if (!cantidadInput) return;

        if (!tipoEntradaSeleccionado) {
            cantidadInput.min = 1;
            cantidadInput.max = 1;
            cantidadInput.value = 1;
            actualizarResumenCompra();
            return;
        }

        const stock = Number(tipoEntradaSeleccionado.stock_disponible || 0);
        const maxCompraOriginal = Number(tipoEntradaSeleccionado.max_por_compra || 0);
        const maxPermitido = Math.max(1, Math.min(stock || 1, maxCompraOriginal || stock || 1));

        cantidadInput.min = 1;
        cantidadInput.max = maxPermitido;

        let cantidadActual = Number(cantidadInput.value || 1);

        if (!Number.isFinite(cantidadActual) || cantidadActual < 1) cantidadActual = 1;
        if (cantidadActual > maxPermitido) cantidadActual = maxPermitido;

        cantidadInput.value = cantidadActual;
        actualizarResumenCompra();
    }

    function limpiarFormularioCompra() {
        const form = $('compraForm');
        if (form) form.reset();

        if ($('cantidad')) {
            $('cantidad').value = 1;
            $('cantidad').min = 1;
            $('cantidad').max = 1;
        }

        if ($('tipoSeleccionadoNombre')) $('tipoSeleccionadoNombre').textContent = '--';
        if ($('tipoSeleccionadoPrecio')) $('tipoSeleccionadoPrecio').textContent = '--';
        if ($('tipoSeleccionadoStock')) $('tipoSeleccionadoStock').textContent = '--';
        if ($('tipoSeleccionadoId')) $('tipoSeleccionadoId').value = '';

        tipoEntradaSeleccionado = null;

        document.querySelectorAll('.ticket-option').forEach(card => {
            card.classList.remove('selected');
        });

        actualizarResumenCompra();
    }

    function guardarUltimaCompra(data) {
        try {
            localStorage.setItem(STORAGE_KEYS.lastPurchase, JSON.stringify(data));
        } catch (error) {
            console.warn('No se pudo guardar la última compra:', error);
        }
    }

    function limpiarTicketActual() {
        try {
            localStorage.removeItem(STORAGE_KEYS.currentTicket);
        } catch (error) {
            console.warn('No se pudo limpiar ticket actual:', error);
        }
    }

    function seleccionarTipoEntrada(idTipo) {
        const tipo = tiposEntradaActuales.find(t => Number(t.id_tipo_entrada) === Number(idTipo));
        if (!tipo) return;

        tipoEntradaSeleccionado = tipo;

        if ($('tipoSeleccionadoNombre')) $('tipoSeleccionadoNombre').textContent = tipo.nombre || '--';
        if ($('tipoSeleccionadoPrecio')) $('tipoSeleccionadoPrecio').textContent = formatearMoneda(tipo.precio);
        if ($('tipoSeleccionadoStock')) $('tipoSeleccionadoStock').textContent = tipo.stock_disponible || 0;
        if ($('tipoSeleccionadoId')) $('tipoSeleccionadoId').value = tipo.id_tipo_entrada || '';

        document.querySelectorAll('.ticket-option').forEach(card => {
            card.classList.remove('selected');
        });

        document.querySelectorAll(`.ticket-option[data-id="${tipo.id_tipo_entrada}"]`).forEach(card => {
            card.classList.add('selected');
        });

        $('btnComprarDesdeDetalle')?.removeAttribute('disabled');

        actualizarCantidadSegunTipo();
    }

    function crearCardTipoEntrada(tipo) {
        const stock = Number(tipo.stock_disponible || 0);
        const maxCompra = Number(tipo.max_por_compra || stock || 1);
        const agotado = stock <= 0;

        return `
            <div class="col-md-6">
                <div
                    class="ticket-option ${agotado ? 'disabled' : ''}"
                    data-id="${tipo.id_tipo_entrada}"
                    role="button"
                    tabindex="${agotado ? '-1' : '0'}"
                    onclick="${agotado ? '' : `seleccionarTipoEntrada(${tipo.id_tipo_entrada})`}"
                    onkeypress="${agotado ? '' : `if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); seleccionarTipoEntrada(${tipo.id_tipo_entrada}); }`}"
                >
                    <i class="bi bi-check-circle-fill ticket-option-check"></i>

                    <div class="ticket-option-title">
                        <i class="bi bi-ticket-perforated text-primary me-2"></i>${escapeHtml(tipo.nombre || 'Entrada')}
                    </div>

                    <div class="ticket-price">${formatearMoneda(tipo.precio)}</div>

                    <div class="ticket-option-desc">
                        ${escapeHtml(tipo.descripcion || 'Entrada disponible para este evento')}
                    </div>

                    <div class="ticket-option-meta">
                        <span class="ticket-badge">
                            <i class="bi bi-box-seam"></i> Stock: ${stock}
                        </span>
                        <span class="ticket-badge">
                            <i class="bi bi-cart"></i> Máx: ${maxCompra}
                        </span>
                    </div>

                    <div class="ticket-hint">
                        ${agotado ? 'Agotada' : 'Haz clic para seleccionar esta entrada'}
                    </div>
                </div>
            </div>
        `;
    }

    function renderizarTipos(tipos) {
        const container = $('tiposContainer');
        if (!container) return;

        if (!Array.isArray(tipos) || tipos.length === 0) {
            container.innerHTML = `
                <div class="col-12">
                    <div class="ticket-empty">
                        <i class="bi bi-exclamation-circle me-2"></i>
                        No hay tipos de entrada disponibles en este momento.
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = tipos.map(crearCardTipoEntrada).join('');
    }

    async function cargarTiposEntrada(idEvento) {
        try {
            renderizarTipos([]);

            const { response, data } = await fetchJson(`${API_BASE}/${idEvento}/tipos`);

            if (!response.ok || !data?.ok) {
                throw new Error(data?.message || 'No se pudieron cargar los tipos de entrada');
            }

            tiposEntradaActuales = Array.isArray(data.data) ? data.data : [];
            renderizarTipos(tiposEntradaActuales);

            const primerDisponible = tiposEntradaActuales.find(tipo => Number(tipo.stock_disponible || 0) > 0);

            if (primerDisponible) {
                seleccionarTipoEntrada(primerDisponible.id_tipo_entrada);
            } else {
                $('btnComprarDesdeDetalle')?.setAttribute('disabled', 'disabled');
            }
        } catch (error) {
            console.error('Error cargando tipos:', error);
            tiposEntradaActuales = [];
            renderizarTipos([]);
            $('btnComprarDesdeDetalle')?.setAttribute('disabled', 'disabled');
        }
    }

    function crearCardEvento(evento) {
        const fecha = formatearFecha(evento.fecha_evento);
        const hora = formatearHora(evento.fecha_evento);
        const lugar = [evento.lugar, evento.ciudad].filter(Boolean).join(' - ');
        const imagen = obtenerImagenEvento(evento.imagen_url);
        const precio = evento.precio_desde != null ? formatearMoneda(evento.precio_desde) : 'Próximamente';

        return `
            <div class="col-md-6 col-lg-4">
                <div class="card h-100 shadow-sm border-0 rounded-4 overflow-hidden">
                    <img
                        src="${escapeHtml(imagen)}"
                        alt="${escapeHtml(evento.titulo || 'Evento')}"
                        class="card-img-top"
                        style="height: 220px; object-fit: cover;"
                        onerror="this.src='${PLACEHOLDER_IMAGE}'"
                    >

                    <div class="card-body d-flex flex-column">
                        <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
                            <h5 class="card-title fw-bold mb-0">${escapeHtml(evento.titulo || 'Evento')}</h5>
                            <span class="badge bg-primary-subtle text-primary border">${escapeHtml(evento.categoria || 'General')}</span>
                        </div>

                        <p class="text-muted small mb-2">
                            <i class="bi bi-calendar-date me-1"></i>${fecha}
                            <br>
                            <i class="bi bi-clock me-1"></i>${hora}
                            <br>
                            <i class="bi bi-geo-alt me-1"></i>${escapeHtml(lugar || 'Ubicación por confirmar')}
                        </p>

                        <p class="card-text text-muted flex-grow-1">
                            ${escapeHtml((evento.descripcion || 'Sin descripción').slice(0, 140))}
                            ${(evento.descripcion || '').length > 140 ? '...' : ''}
                        </p>

                        <div class="d-flex justify-content-between align-items-center mt-3">
                            <div>
                                <small class="text-muted d-block">Desde</small>
                                <span class="fw-bold text-primary fs-5">${precio}</span>
                            </div>

                            <button
                                type="button"
                                class="btn btn-outline-primary rounded-pill px-3"
                                onclick="abrirDetalleEvento(${Number(evento.id_evento)})"
                            >
                                <i class="bi bi-eye me-1"></i> Ver detalle
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderizarEventos(lista) {
        if (!eventosContainer) return;

        if (!Array.isArray(lista) || lista.length === 0) {
            eventosContainer.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-light border text-center py-4 rounded-4 mb-0">
                        <i class="bi bi-calendar-x fs-1 d-block mb-2 text-muted"></i>
                        No se encontraron eventos con esos filtros.
                    </div>
                </div>
            `;

            if (eventosCount) eventosCount.textContent = '0 eventos';
            return;
        }

        eventosContainer.innerHTML = lista.map(crearCardEvento).join('');

        if (eventosCount) {
            eventosCount.textContent = `${lista.length} evento${lista.length === 1 ? '' : 's'}`;
        }
    }

    function poblarSelect(selectId, valores, placeholder) {
        const select = $(selectId);
        if (!select) return;

        const unicos = [...new Set(
            valores
                .map(v => String(v || '').trim())
                .filter(Boolean)
        )].sort((a, b) => a.localeCompare(b, 'es'));

        select.innerHTML = `<option value="">${placeholder}</option>`;

        unicos.forEach(valor => {
            const option = document.createElement('option');
            option.value = valor;
            option.textContent = valor;
            select.appendChild(option);
        });
    }

    function aplicarFiltros() {
        const texto = String(searchInput?.value || '').trim().toLowerCase();
        const categoria = String(categorySelect?.value || '').trim().toLowerCase();
        const ciudad = String(citySelect?.value || '').trim().toLowerCase();

        eventosFiltrados = eventos.filter(evento => {
            const coincideTexto =
                !texto ||
                String(evento.titulo || '').toLowerCase().includes(texto) ||
                String(evento.descripcion || '').toLowerCase().includes(texto) ||
                String(evento.lugar || '').toLowerCase().includes(texto) ||
                String(evento.ciudad || '').toLowerCase().includes(texto) ||
                String(evento.categoria || '').toLowerCase().includes(texto);

            const coincideCategoria =
                !categoria ||
                String(evento.categoria || '').trim().toLowerCase() === categoria;

            const coincideCiudad =
                !ciudad ||
                String(evento.ciudad || '').trim().toLowerCase() === ciudad;

            return coincideTexto && coincideCategoria && coincideCiudad;
        });

        renderizarEventos(eventosFiltrados);
    }

    async function cargarEventos() {
        if (eventosContainer) {
            eventosContainer.innerHTML = `
                <div class="col-12 text-center py-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Cargando eventos...</span>
                    </div>
                </div>
            `;
        }

        try {
            const { response, data } = await fetchJson(API_BASE);

            if (!response.ok || !data?.ok) {
                throw new Error(data?.message || 'No se pudieron cargar los eventos');
            }

            eventos = Array.isArray(data.data) ? data.data : [];
            eventosFiltrados = [...eventos];

            poblarSelect('categorySelect', eventos.map(e => e.categoria), 'Todas las categorías');
            poblarSelect('citySelect', eventos.map(e => e.ciudad), 'Todas las ciudades');

            renderizarEventos(eventosFiltrados);
        } catch (error) {
            console.error('Error cargando eventos:', error);

            if (eventosContainer) {
                eventosContainer.innerHTML = `
                    <div class="col-12">
                        <div class="alert alert-danger text-center rounded-4 mb-0">
                            <i class="bi bi-exclamation-triangle me-2"></i>
                            ${escapeHtml(error.message || 'No se pudieron cargar los eventos')}
                        </div>
                    </div>
                `;
            }

            if (eventosCount) eventosCount.textContent = 'Error';
        }
    }

    async function abrirDetalleEvento(idEvento) {
        try {
            const { response, data } = await fetchJson(`${API_BASE}/${idEvento}`);

            if (!response.ok || !data?.ok) {
                throw new Error(data?.message || 'No se pudo cargar el evento');
            }

            const evento = data.data;
            eventoSeleccionado = evento;
            tipoEntradaSeleccionado = null;
            tiposEntradaActuales = [];
            limpiarFormularioCompra();

            if ($('detalleTitulo')) $('detalleTitulo').textContent = evento.titulo || 'Evento';
            if ($('detalleFecha')) $('detalleFecha').textContent = formatearFecha(evento.fecha_evento);
            if ($('detalleHora')) $('detalleHora').textContent = formatearHora(evento.fecha_evento);
            if ($('detalleLugar')) $('detalleLugar').textContent = [evento.lugar, evento.ciudad].filter(Boolean).join(' - ') || '--';
            if ($('detalleDescripcion')) $('detalleDescripcion').textContent = evento.descripcion || 'Sin descripción';

            const imagen = $('detalleImagen');
            if (imagen) {
                imagen.src = obtenerImagenEvento(evento.imagen_url);
                imagen.alt = evento.titulo || 'Evento';
                imagen.onerror = () => {
                    imagen.src = PLACEHOLDER_IMAGE;
                };
            }

            await cargarTiposEntrada(evento.id_evento);
            actualizarResumenCompra();

            detalleModal?.show();
        } catch (error) {
            console.error('Error abriendo detalle:', error);
            mostrarAlerta(error.message || 'No se pudo abrir el detalle del evento');
        }
    }

    function abrirCompraDesdeDetalle() {
        if (!eventoSeleccionado) {
            mostrarAlerta('Primero debes seleccionar un evento.');
            return;
        }

        if (!tipoEntradaSeleccionado) {
            mostrarAlerta('Debes seleccionar un tipo de entrada.');
            return;
        }

        actualizarResumenCompra();
        detalleModal?.hide();
        compraModal?.show();
    }

    function validarFormularioCompra() {
        const campos = [
            { id: 'nombres', label: 'nombres' },
            { id: 'apellidos', label: 'apellidos' },
            { id: 'email', label: 'correo electrónico' },
            { id: 'telefono', label: 'teléfono' },
            { id: 'documento', label: 'cédula o RUC' },
            { id: 'direccion', label: 'dirección' }
        ];

        for (const campo of campos) {
            const input = $(campo.id);
            if (!input || !String(input.value || '').trim()) {
                mostrarAlerta(`Debes ingresar ${campo.label}.`);
                input?.focus();
                return false;
            }
        }

        if (!tipoEntradaSeleccionado) {
            mostrarAlerta('Debes seleccionar un tipo de entrada.');
            return false;
        }

        const stock = Number(tipoEntradaSeleccionado.stock_disponible || 0);
        if (stock <= 0) {
            mostrarAlerta('El tipo de entrada seleccionado ya no tiene stock.');
            return false;
        }

        const cantidad = Number($('cantidad')?.value || 0);
        const maxCompra = Number(tipoEntradaSeleccionado.max_por_compra || stock || 1);
        const maxPermitido = Math.max(1, Math.min(stock || 1, maxCompra || 1));

        if (!Number.isInteger(cantidad) || cantidad < 1) {
            mostrarAlerta('La cantidad debe ser al menos 1.');
            return false;
        }

        if (cantidad > maxPermitido) {
            mostrarAlerta(`Solo puedes comprar hasta ${maxPermitido} entrada(s) de este tipo.`);
            $('cantidad').value = maxPermitido;
            actualizarResumenCompra();
            return false;
        }

        return true;
    }

    function construirPayloadOrden() {
        const cantidad = Number($('cantidad')?.value || 1);
        const precioUnitario = Number(tipoEntradaSeleccionado?.precio || 0);
        const subtotal = Number((cantidad * precioUnitario).toFixed(2));
        const iva = 0;
        const total = Number((subtotal + iva).toFixed(2));

        return {
            cliente: {
                nombres: $('nombres')?.value.trim(),
                apellidos: $('apellidos')?.value.trim(),
                email: $('email')?.value.trim(),
                telefono: $('telefono')?.value.trim(),
                cedula_ruc: $('documento')?.value.trim(),
                direccion: $('direccion')?.value.trim()
            },
            items: [
                {
                    id_tipo_entrada: Number(tipoEntradaSeleccionado.id_tipo_entrada),
                    cantidad
                }
            ],
            subtotal,
            iva,
            total
        };
    }

    function setEstadoBotonPago(cargando) {
        const boton = $('btnPagarPayPhone');
        if (!boton) return;

        boton.disabled = cargando;

        if (cargando) {
            boton.dataset.originalText = boton.innerHTML;
            boton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Generando orden...';
        } else {
            boton.innerHTML = boton.dataset.originalText || '<i class="bi bi-phone me-2"></i>Pagar con PayPhone';
        }
    }

    async function crearOrden(payloadOrden) {
        const { response, data } = await fetchJson(API_ORDENES, {
            method: 'POST',
            withCsrf: true,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payloadOrden)
        });

        if (!response.ok || !data?.ok || !data.orden?.id_orden) {
            throw new Error(data?.message || 'No se pudo crear la orden.');
        }

        return data.orden;
    }

    async function generarLinkPago(idOrden) {
        const { response, data } = await fetchJson(API_PAGOS, {
            method: 'POST',
            withCsrf: false,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id_orden: idOrden })
        });

        if (!response.ok || !data?.ok || !data.paymentUrl) {
            throw new Error(data?.message || 'No se pudo generar el link de pago.');
        }

        return data;
    }

    async function manejarPagoPayPhone() {
        if (pagoEnProceso) return;
        if (!validarFormularioCompra()) return;

        try {
            pagoEnProceso = true;
            setEstadoBotonPago(true);
            limpiarTicketActual();

            const payloadOrden = construirPayloadOrden();
            const orden = await crearOrden(payloadOrden);
            const pago = await generarLinkPago(orden.id_orden);
            const url =
                pago.paymentUrl ||
                pago.payWithPayPhone ||
                pago.payWithCard;

            if (!url) {
                throw new Error("No se pudo obtener URL de pago");
            }

            guardarUltimaCompra({
                id_orden: orden.id_orden,
                codigo_orden: orden.codigo_orden,
                total: orden.total,
                estado: orden.estado,
                evento: {
                    id_evento: eventoSeleccionado?.id_evento || null,
                    titulo: eventoSeleccionado?.titulo || ''
                },
                tipoEntrada: {
                    id_tipo_entrada: tipoEntradaSeleccionado?.id_tipo_entrada || null,
                    nombre: tipoEntradaSeleccionado?.nombre || '',
                    precio: Number(tipoEntradaSeleccionado?.precio || 0)
                },
                cantidad: Number($('cantidad')?.value || 1),
                comprador: {
                    nombres: $('nombres')?.value.trim(),
                    apellidos: $('apellidos')?.value.trim(),
                    email: $('email')?.value.trim(),
                    telefono: $('telefono')?.value.trim(),
                    documento: $('documento')?.value.trim(),
                    direccion: $('direccion')?.value.trim()
                },
                payment: {
                    provider: 'PayPhone',
                    transactionId: pago.transactionId || null,
                    payUrl: pago.paymentUrl || pago.payWithCard || pago.payWithPayPhone || ''
                },
                createdAt: new Date().toISOString()
            });

            limpiarFormularioCompra();
            window.location.href = url;
        } catch (error) {
            console.error('Error iniciando pago:', error);
            limpiarFormularioCompra();
            mostrarAlerta(error.message || 'No se pudo iniciar el pago con PayPhone.');
        } finally {
            pagoEnProceso = false;
            setEstadoBotonPago(false);
        }
    }

    searchInput?.addEventListener('input', aplicarFiltros);
    categorySelect?.addEventListener('change', aplicarFiltros);
    citySelect?.addEventListener('change', aplicarFiltros);

    $('btnComprarDesdeDetalle')?.addEventListener('click', abrirCompraDesdeDetalle);

    $('cantidad')?.addEventListener('input', () => {
        if (!tipoEntradaSeleccionado) {
            $('cantidad').value = 1;
            actualizarResumenCompra();
            return;
        }

        const stock = Number(tipoEntradaSeleccionado.stock_disponible || 0);
        const maxCompra = Number(tipoEntradaSeleccionado.max_por_compra || stock || 1);
        const maxPermitido = Math.max(1, Math.min(stock || 1, maxCompra || 1));

        let valor = Number($('cantidad').value || 1);
        if (!Number.isFinite(valor) || valor < 1) valor = 1;
        if (valor > maxPermitido) valor = maxPermitido;

        $('cantidad').value = valor;
        actualizarResumenCompra();
    });

    $('compraForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await manejarPagoPayPhone();
    });

    $('btnPagarPayPhone')?.addEventListener('click', async () => {
        await manejarPagoPayPhone();
    });

    cargarEventos();
    window.abrirDetalleEvento = abrirDetalleEvento;
    window.seleccionarTipoEntrada = seleccionarTipoEntrada;
});