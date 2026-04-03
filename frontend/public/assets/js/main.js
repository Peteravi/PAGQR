document.addEventListener("DOMContentLoaded", () => {
    const API_EVENTOS = "http://localhost:3000/api/eventos";
    const API_ORDENES = "http://localhost:3000/api/ordenes";
    const STORAGE_KEYS = {
        currentEvent: "pagqr_current_event",
        lastPurchase: "pagqr_last_purchase",
        purchases: "pagqr_purchases"
    };

    // Elementos DOM
    const eventosContainer = document.querySelector("#eventos .row");
    const counterText = document.querySelector("#eventos .text-muted");
    const searchInput = document.getElementById("searchInput");
    const categorySelect = document.getElementById("categorySelect");
    const citySelect = document.getElementById("citySelect");
    const detailTitle = document.getElementById("detalleTitulo");
    const detailImage = document.getElementById("detalleImagen");
    const detalleFecha = document.getElementById("detalleFecha");
    const detalleHora = document.getElementById("detalleHora");
    const detalleLugar = document.getElementById("detalleLugar");
    const detalleDescripcion = document.getElementById("detalleDescripcion");
    const tiposContainer = document.getElementById("tiposContainer");
    const buyButtonFromDetail = document.getElementById("btnComprarDesdeDetalle");
    const quantityInput = document.getElementById("cantidad");
    const summaryEvento = document.getElementById("resumenEvento");
    const summaryTipo = document.getElementById("resumenTipo");
    const summaryCantidad = document.getElementById("resumenCantidad");
    const summaryPrecioUnitario = document.getElementById("resumenPrecioUnitario");
    const summaryTotal = document.getElementById("resumenTotal");
    const tipoSeleccionadoNombre = document.getElementById("tipoSeleccionadoNombre");
    const tipoSeleccionadoPrecio = document.getElementById("tipoSeleccionadoPrecio");
    const tipoSeleccionadoStock = document.getElementById("tipoSeleccionadoStock");
    const tipoSeleccionadoId = document.getElementById("tipoSeleccionadoId");
    const payButton = document.getElementById("btnPagarPayPhone");

    let eventosGlobales = [];
    let selectedEvent = null;
    let selectedTipo = null;
    let tiposCache = [];

    function formatPrice(value) {
        return `$${Number(value || 0).toFixed(2)}`;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
    }

    async function renderTiposContainer(eventoId) {
        if (!tiposContainer) return;
        tiposContainer.innerHTML = '<div class="col-12 text-center"><div class="spinner-border spinner-border-sm text-primary"></div> Cargando tipos...</div>';

        try {
            const response = await fetch(`${API_EVENTOS}/${eventoId}/tipos`);
            if (!response.ok) throw new Error("Error al cargar tipos");
            const tipos = await response.json();
            tiposCache = tipos;

            if (tipos.length === 0) {
                tiposContainer.innerHTML = '<div class="col-12 text-center text-muted">No hay tipos de entrada disponibles.</div>';
                return;
            }

            tiposContainer.innerHTML = '';
            tipos.forEach(tipo => {
                const col = document.createElement('div');
                col.className = 'col-12 col-sm-6';
                const isDisabled = tipo.stock_disponible === 0;
                const cardClass = isDisabled ? 'border-secondary bg-light' : 'border-primary cursor-pointer';
                col.innerHTML = `
                    <div class="card h-100 ${cardClass} tipo-card" data-tipo-id="${tipo.id_tipo_entrada}" style="${!isDisabled ? 'cursor:pointer;' : ''}">
                        <div class="card-body p-2 p-md-3">
                            <h6 class="card-title fw-bold mb-1">${escapeHtml(tipo.nombre)}</h6>
                            <p class="card-text mb-1"><i class="bi bi-tag"></i> ${formatPrice(tipo.precio)}</p>
                            <p class="card-text small ${tipo.stock_disponible < 5 ? 'text-danger' : 'text-muted'}">
                                <i class="bi bi-box-seam"></i> Stock: ${tipo.stock_disponible}
                            </p>
                            ${isDisabled ? '<span class="badge bg-secondary w-100">Agotado</span>' : '<button class="btn btn-sm btn-outline-primary w-100 seleccionar-tipo-btn">Seleccionar</button>'}
                        </div>
                    </div>
                `;

                if (!isDisabled) {
                    const btn = col.querySelector('.seleccionar-tipo-btn');
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        seleccionarTipo(tipo);
                    });
                    col.querySelector('.tipo-card').addEventListener('click', () => seleccionarTipo(tipo));
                }
                tiposContainer.appendChild(col);
            });

            if (selectedTipo && selectedTipo.id_evento === eventoId) {
                resaltarTipoSeleccionado(selectedTipo.id_tipo_entrada);
            } else {
                selectedTipo = null;
                if (buyButtonFromDetail) buyButtonFromDetail.disabled = true;
            }
        } catch (error) {
            console.error(error);
            tiposContainer.innerHTML = '<div class="col-12 text-center text-danger">Error al cargar tipos.</div>';
        }
    }

    function seleccionarTipo(tipo) {
        if (tipo.stock_disponible === 0) {
            alert("Este tipo de entrada está agotado.");
            return;
        }
        selectedTipo = tipo;
        if (buyButtonFromDetail) buyButtonFromDetail.disabled = false;
        resaltarTipoSeleccionado(tipo.id_tipo_entrada);

        tipoSeleccionadoNombre.textContent = tipo.nombre;
        tipoSeleccionadoPrecio.textContent = formatPrice(tipo.precio);
        tipoSeleccionadoStock.textContent = tipo.stock_disponible;
        tipoSeleccionadoId.value = tipo.id_tipo_entrada;

        const modalCompra = document.getElementById("compraModal");
        if (modalCompra && modalCompra.classList.contains('show')) {
            updatePurchaseSummary();
        }
    }

    function resaltarTipoSeleccionado(tipoId) {
        document.querySelectorAll('#tiposContainer .tipo-card').forEach(card => {
            const id = card.getAttribute('data-tipo-id');
            if (id == tipoId) {
                card.classList.add('border-success', 'bg-success-subtle');
                card.classList.remove('border-primary');
            } else {
                card.classList.remove('border-success', 'bg-success-subtle');
                card.classList.add('border-primary');
            }
        });
    }

    function updateDetailModal(evento) {
        if (!evento) return;
        detailTitle.textContent = evento.titulo;
        const fechaObj = new Date(evento.fecha_evento);
        detalleFecha.textContent = fechaObj.toLocaleDateString("es-ES");
        detalleHora.textContent = fechaObj.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
        detalleLugar.textContent = escapeHtml(evento.lugar);
        detalleDescripcion.textContent = escapeHtml(evento.descripcion || "Sin descripción");
        detailImage.src = evento.imagen_url || "assets/img/placeholder.jpg";
        detailImage.alt = evento.titulo;
    }

    function updatePurchaseSummary() {
        if (!selectedTipo) return;
        const quantity = Math.max(1, Number(quantityInput?.value || 1));
        const total = selectedTipo.precio * quantity;
        summaryEvento.textContent = `Evento: ${selectedEvent?.titulo || "--"}`;
        summaryTipo.textContent = `Tipo: ${selectedTipo.nombre}`;
        summaryCantidad.textContent = `Cantidad: ${quantity}`;
        summaryPrecioUnitario.textContent = `Precio unitario: ${formatPrice(selectedTipo.precio)}`;
        summaryTotal.textContent = `Total: ${formatPrice(total)}`;
    }

    function renderEventos(eventos) {
        if (!eventosContainer) return;
        eventosContainer.innerHTML = "";
        if (eventos.length === 0) {
            eventosContainer.innerHTML = `<div class="col-12 text-center py-5"><p class="text-muted">No hay eventos disponibles.</p></div>`;
            if (counterText) counterText.textContent = "0 eventos encontrados";
            return;
        }
        eventos.forEach(ev => {
            const col = document.createElement("div");
            col.className = "col-md-6 col-lg-4";
            const fechaObj = new Date(ev.fecha_evento);
            const fechaFormateada = fechaObj.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
            const horaFormateada = fechaObj.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
            col.innerHTML = `
                <div class="card h-100 shadow-sm">
                    <img src="${ev.imagen_url || 'assets/img/placeholder.jpg'}" class="card-img-top" alt="${escapeHtml(ev.titulo)}" style="height: 200px; object-fit: cover;">
                    <div class="card-body">
                        <h5 class="card-title">${escapeHtml(ev.titulo)}</h5>
                        <p class="card-text mb-1"><strong>Fecha:</strong> ${fechaFormateada}</p>
                        <p class="card-text mb-1"><strong>Hora:</strong> ${horaFormateada}</p>
                        <p class="card-text mb-1"><strong>Lugar:</strong> ${escapeHtml(ev.lugar)}</p>
                        <button class="btn btn-primary w-100 ver-detalle" data-id="${ev.id_evento}">Ver detalle</button>
                    </div>
                </div>
            `;
            const btn = col.querySelector('.ver-detalle');
            btn.addEventListener('click', async () => {
                selectedEvent = ev;
                selectedTipo = null;
                buyButtonFromDetail.disabled = true;
                await renderTiposContainer(ev.id_evento);
                updateDetailModal(ev);
                const modal = new bootstrap.Modal(document.getElementById('detalleEventoModal'));
                modal.show();
            });
            eventosContainer.appendChild(col);
        });
        if (counterText) counterText.textContent = `${eventos.length} evento${eventos.length !== 1 ? "s" : ""} encontrado${eventos.length !== 1 ? "s" : ""}`;
    }

    function populateFilters(eventos) {
        if (!categorySelect || !citySelect) return;
        const categorias = [...new Set(eventos.map(ev => ev.categoria).filter(Boolean))];
        const ciudades = [...new Set(eventos.map(ev => ev.ciudad).filter(Boolean))];
        categorySelect.innerHTML = '<option selected>Filtrar por categoría</option>';
        categorias.forEach(cat => { const opt = document.createElement("option"); opt.value = cat; opt.textContent = cat; categorySelect.appendChild(opt); });
        citySelect.innerHTML = '<option selected>Filtrar por ciudad</option>';
        ciudades.forEach(ciudad => { const opt = document.createElement("option"); opt.value = ciudad; opt.textContent = ciudad; citySelect.appendChild(opt); });
    }

    function filterEvents() {
        const searchTerm = (searchInput?.value || "").trim().toLowerCase();
        const selectedCategory = (categorySelect?.value || "").trim().toLowerCase();
        const selectedCity = (citySelect?.value || "").trim().toLowerCase();
        const filtered = eventosGlobales.filter(ev => {
            const matchSearch = !searchTerm || ev.titulo?.toLowerCase().includes(searchTerm);
            const matchCategory = !selectedCategory || selectedCategory === "filtrar por categoría" || ev.categoria?.toLowerCase() === selectedCategory;
            const matchCity = !selectedCity || selectedCity === "filtrar por ciudad" || ev.ciudad?.toLowerCase() === selectedCity;
            return matchSearch && matchCategory && matchCity;
        });
        renderEventos(filtered);
    }

    async function cargarEventos() {
        try {
            const response = await fetch(API_EVENTOS);
            if (!response.ok) throw new Error("Error al cargar eventos");
            eventosGlobales = await response.json();
            populateFilters(eventosGlobales);
            renderEventos(eventosGlobales);
        } catch (error) {
            console.error(error);
            eventosContainer.innerHTML = `<div class="col-12 text-center py-5 text-danger"><i class="bi bi-exclamation-triangle"></i> Error al cargar eventos.</div>`;
        }
    }

    function getFormData() {
        return {
            nombres: document.getElementById("nombres")?.value.trim() || "",
            apellidos: document.getElementById("apellidos")?.value.trim() || "",
            email: document.getElementById("email")?.value.trim() || "",
            telefono: document.getElementById("telefono")?.value.trim() || "",
            documento: document.getElementById("documento")?.value.trim() || "",
            cantidad: Math.max(1, Number(quantityInput?.value || 1)),
            direccion: document.getElementById("direccion")?.value.trim() || ""
        };
    }

    async function savePurchase() {
        if (!selectedEvent) { alert("Selecciona un evento."); return; }
        if (!selectedTipo) { alert("Selecciona un tipo de entrada."); return; }
        const formData = getFormData();
        if (!formData.nombres || !formData.apellidos || !formData.email || !formData.telefono || !formData.documento || !formData.direccion) {
            alert("Completa todos los campos del formulario.");
            return;
        }
        if (selectedTipo.stock_disponible < formData.cantidad) {
            alert(`Stock insuficiente. Solo quedan ${selectedTipo.stock_disponible} entradas.`);
            return;
        }

        const precioUnitario = Number(selectedTipo.precio || 0);
        const subtotal = precioUnitario * formData.cantidad;
        const iva = 0;
        const total = subtotal + iva;

        const datosOrden = {
            cliente: {
                nombres: formData.nombres,
                apellidos: formData.apellidos,
                email: formData.email,
                telefono: formData.telefono,
                cedula_ruc: formData.documento,
                direccion: formData.direccion
            },
            items: [
                {
                    id_tipo_entrada: selectedTipo.id_tipo_entrada,
                    cantidad: formData.cantidad
                }
            ],
            subtotal,
            iva,
            total
        };

        const botonOriginal = payButton.textContent;
        payButton.textContent = "Creando orden...";
        payButton.disabled = true;

        try {
            const ordenResponse = await fetch(API_ORDENES, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(datosOrden)
            });
            const ordenData = await ordenResponse.json();
            if (!ordenData.ok) throw new Error(ordenData.message);

            payButton.textContent = "Conectando con PayPhone...";
            const pagoResponse = await fetch('/api/pagos/generar-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_orden: ordenData.orden.id_orden })
            });
            const pagoData = await pagoResponse.json();
            if (!pagoData.ok) throw new Error(pagoData.message);

            localStorage.setItem(STORAGE_KEYS.lastPurchase, JSON.stringify({
                id_orden: ordenData.orden.id_orden,
                codigo_orden: ordenData.orden.codigo_orden,
                evento: selectedEvent,
                tipo: selectedTipo,
                comprador: datosOrden.cliente,
                resumen: {
                    cantidad: formData.cantidad,
                    precioUnitario: selectedTipo.precio,
                    total: ordenData.orden.total
                }
            }));
            window.location.href = pagoData.payUrl;
        } catch (error) {
            alert('Error al procesar la compra: ' + error.message);
            payButton.textContent = botonOriginal;
            payButton.disabled = false;
        }
    }

    function bindEvents() {
        searchInput?.addEventListener("input", filterEvents);
        categorySelect?.addEventListener("change", filterEvents);
        citySelect?.addEventListener("change", filterEvents);
        buyButtonFromDetail?.addEventListener("click", () => {
            if (!selectedTipo) { alert("Selecciona un tipo de entrada."); return; }
            updatePurchaseSummary();
            new bootstrap.Modal(document.getElementById('compraModal')).show();
        });
        quantityInput?.addEventListener("input", updatePurchaseSummary);
        payButton?.addEventListener("click", savePurchase);
    }

    cargarEventos();
    bindEvents();
});