document.addEventListener("DOMContentLoaded", () => {
    // Configuración
    const API_EVENTOS = "http://localhost:3000/api/eventos";
    const API_ORDENES = "http://localhost:3000/api/ordenes";
    const STORAGE_KEYS = {
        currentEvent: "pagqr_current_event",
        lastPurchase: "pagqr_last_purchase",
        purchases: "pagqr_purchases"
    };

    // Elementos del DOM
    const eventosContainer = document.querySelector("#eventos .row");
    const counterText = document.querySelector("#eventos .text-muted");
    const searchInput = document.querySelector('section.border-bottom input[type="text"]');
    const categorySelect = document.querySelectorAll('section.border-bottom select')[0];
    const citySelect = document.querySelectorAll('section.border-bottom select')[1];
    const detailModal = document.getElementById("detalleEventoModal");
    const detailTitle = document.getElementById("detalleTitulo");
    const detailImage = document.getElementById("detalleImagen");
    const detalleFecha = document.getElementById("detalleFecha");
    const detalleHora = document.getElementById("detalleHora");
    const detalleLugar = document.getElementById("detalleLugar");
    const detalleDescripcion = document.getElementById("detalleDescripcion");
    const buyButtonFromDetail = document.getElementById("btnComprarDesdeDetalle");
    const purchaseModal = document.getElementById("compraModal");
    const purchaseForm = document.getElementById("compraForm");
    const payButton = document.getElementById("btnPagarPayPhone");
    const quantityInput = document.getElementById("cantidad");
    const summaryEvento = document.getElementById("resumenEvento");
    const summaryTipo = document.getElementById("resumenTipo");
    const summaryCantidad = document.getElementById("resumenCantidad");
    const summaryPrecioUnitario = document.getElementById("resumenPrecioUnitario");
    const summaryTotal = document.getElementById("resumenTotal");
    const detalleTipoSelect = document.getElementById("detalleTipoEntrada");
    const compraTipoSelect = document.getElementById("compraTipoEntrada");
    const detalleStockInfo = document.getElementById("detalleStockInfo");
    const compraStockInfo = document.getElementById("compraStockInfo");

    let eventosGlobales = [];
    let selectedEvent = null;
    let tiposCache = [];

    // =========================
    // UTILIDADES
    // =========================
    function formatPrice(value) {
        return `$${Number(value || 0).toFixed(2)}`;
    }

    function safeParseJSON(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (error) {
            console.error(`Error leyendo localStorage: ${key}`, error);
            return fallback;
        }
    }

    function saveJSON(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.error(`Error guardando localStorage: ${key}`, error);
        }
    }

    function getFormData() {
        if (!purchaseForm) return null;
        const inputs = purchaseForm.querySelectorAll("input");
        if (inputs.length < 7) return null;
        return {
            nombres: inputs[0]?.value.trim() || "",
            apellidos: inputs[1]?.value.trim() || "",
            email: inputs[2]?.value.trim() || "",
            telefono: inputs[3]?.value.trim() || "",
            documento: inputs[4]?.value.trim() || "",
            cantidad: Math.max(1, Number(quantityInput?.value || 1)),
            direccion: inputs[6]?.value.trim() || ""
        };
    }

    function validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function validatePurchaseData(data) {
        if (!data) return { valid: false, message: "No se pudo leer el formulario." };
        if (!data.nombres) return { valid: false, message: "Ingrese los nombres." };
        if (!data.apellidos) return { valid: false, message: "Ingrese los apellidos." };
        if (!data.email) return { valid: false, message: "Ingrese el correo electrónico." };
        if (!validateEmail(data.email)) return { valid: false, message: "Ingrese un correo electrónico válido." };
        if (!data.telefono) return { valid: false, message: "Ingrese el teléfono." };
        if (!data.documento) return { valid: false, message: "Ingrese la cédula o RUC." };
        if (!data.direccion) return { valid: false, message: "Ingrese la dirección." };
        if (!data.cantidad || data.cantidad < 1) return { valid: false, message: "La cantidad debe ser mayor a 0." };
        return { valid: true, message: "" };
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
    // CARGAR TIPOS DE ENTRADA
    // =========================
    async function cargarTipos(eventoId) {
        try {
            const response = await fetch(`${API_EVENTOS}/${eventoId}/tipos`);
            if (!response.ok) throw new Error("Error al cargar tipos");
            const tipos = await response.json();
            tiposCache = tipos;
            const optionsHtml = tipos.map(tipo => {
                const disabled = tipo.stock_disponible === 0 ? "disabled" : "";
                return `<option value="${tipo.id_tipo_entrada}" data-precio="${tipo.precio}" data-stock="${tipo.stock_disponible}" ${disabled}>
                            ${tipo.nombre} - ${formatPrice(tipo.precio)} (${tipo.stock_disponible} disponibles)
                        </option>`;
            }).join("");
            if (detalleTipoSelect) detalleTipoSelect.innerHTML = `<option value="">Selecciona un tipo</option>${optionsHtml}`;
            if (compraTipoSelect) compraTipoSelect.innerHTML = `<option value="">Selecciona un tipo</option>${optionsHtml}`;
        } catch (error) {
            console.error("Error cargando tipos:", error);
        }
    }

    function actualizarInfoTipo(select, stockInfoSpan) {
        const selectedOption = select.options[select.selectedIndex];
        if (!selectedOption || !selectedOption.value) {
            if (stockInfoSpan) stockInfoSpan.textContent = "Stock disponible: --";
            return null;
        }
        const stock = selectedOption.getAttribute("data-stock");
        const precio = selectedOption.getAttribute("data-precio");
        if (stockInfoSpan) stockInfoSpan.textContent = `Stock disponible: ${stock}`;
        return { id: selectedOption.value, precio: parseFloat(precio), stock: parseInt(stock) };
    }

    // =========================
    // RENDERIZADO DE TARJETAS
    // =========================
    function renderEventos(eventos) {
        if (!eventosContainer) return;
        eventosContainer.innerHTML = "";

        if (eventos.length === 0) {
            eventosContainer.innerHTML = `
                <div class="col-12 text-center py-5">
                    <p class="text-muted">No hay eventos disponibles en este momento.</p>
                </div>
            `;
            if (counterText) counterText.textContent = "0 eventos encontrados";
            return;
        }

        eventos.forEach(ev => {
            const col = document.createElement("div");
            col.className = "col-md-6 col-lg-4";

            const fechaObj = new Date(ev.fecha_evento);
            const fechaFormateada = fechaObj.toLocaleDateString("es-ES", {
                day: "numeric", month: "long", year: "numeric"
            });
            const horaFormateada = fechaObj.toLocaleTimeString("es-ES", {
                hour: "2-digit", minute: "2-digit"
            });

            col.innerHTML = `
                <div class="card h-100 shadow-sm">
                    <img src="${ev.imagen_url || 'assets/img/placeholder.jpg'}" class="card-img-top" alt="${escapeHtml(ev.titulo)}" style="height: 200px; object-fit: cover;">
                    <div class="card-body">
                        <h5 class="card-title">${escapeHtml(ev.titulo)}</h5>
                        <p class="card-text mb-1"><strong>Fecha:</strong> ${fechaFormateada}</p>
                        <p class="card-text mb-1"><strong>Hora:</strong> ${horaFormateada}</p>
                        <p class="card-text mb-1"><strong>Lugar:</strong> ${escapeHtml(ev.lugar)}</p>
                        <p class="card-text mb-3"><strong>Desde:</strong> ${formatPrice(ev.precio || 0)}</p>
                        <button class="btn btn-primary w-100" data-bs-toggle="modal" data-bs-target="#detalleEventoModal">
                            Ver detalle
                        </button>
                    </div>
                </div>
            `;

            const button = col.querySelector("button");
            button.addEventListener("click", async () => {
                selectedEvent = ev;
                await cargarTipos(ev.id_evento);
                updateDetailModal(ev);
            });

            eventosContainer.appendChild(col);
        });

        if (counterText) {
            counterText.textContent = `${eventos.length} evento${eventos.length !== 1 ? "s" : ""} encontrado${eventos.length !== 1 ? "s" : ""}`;
        }
    }

    function updateDetailModal(evento) {
        if (!detailModal) return;
        selectedEvent = evento;
        saveJSON(STORAGE_KEYS.currentEvent, evento);

        if (detailTitle) detailTitle.textContent = evento.titulo;

        const fechaObj = new Date(evento.fecha_evento);
        const fechaFormateada = fechaObj.toLocaleDateString("es-ES");
        const horaFormateada = fechaObj.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
        const lugarCompleto = [evento.lugar, evento.direccion].filter(Boolean).join(", ") || evento.lugar;

        if (detailImage) {
            detailImage.src = evento.imagen_url || "assets/img/placeholder.jpg";
            detailImage.alt = evento.titulo;
        }

        // Asignar valores usando IDs específicos
        if (detalleFecha) detalleFecha.textContent = fechaFormateada;
        if (detalleHora) detalleHora.textContent = horaFormateada;
        if (detalleLugar) detalleLugar.textContent = escapeHtml(lugarCompleto);
        if (detalleDescripcion) detalleDescripcion.textContent = escapeHtml(evento.descripcion || "Sin descripción");

        // También actualizar el precio en el detalle (si hay un elemento)
        const detallePrecio = document.getElementById("detallePrecio");
        if (detallePrecio) detallePrecio.textContent = formatPrice(evento.precio || 0);
    }

    function updatePurchaseSummary() {
        const tipoId = compraTipoSelect?.value;
        const tipo = tiposCache.find(t => t.id_tipo_entrada == tipoId);
        const quantity = Math.max(1, Number(quantityInput?.value || 1));
        if (!tipo) {
            if (summaryEvento) summaryEvento.textContent = `Evento: ${selectedEvent?.titulo || "--"}`;
            if (summaryTipo) summaryTipo.textContent = `Tipo: --`;
            if (summaryPrecioUnitario) summaryPrecioUnitario.textContent = `Precio unitario: --`;
            if (summaryTotal) summaryTotal.textContent = `Total: --`;
            return;
        }
        const total = tipo.precio * quantity;
        if (summaryEvento) summaryEvento.textContent = `Evento: ${selectedEvent?.titulo || "--"}`;
        if (summaryTipo) summaryTipo.textContent = `Tipo: ${tipo.nombre}`;
        if (summaryCantidad) summaryCantidad.textContent = `Cantidad: ${quantity}`;
        if (summaryPrecioUnitario) summaryPrecioUnitario.textContent = `Precio unitario: ${formatPrice(tipo.precio)}`;
        if (summaryTotal) summaryTotal.textContent = `Total: ${formatPrice(total)}`;
        if (summaryTotal) summaryTotal.classList.add("fw-bold");
    }

    // =========================
    // FILTROS
    // =========================
    function populateFilters(eventos) {
        if (!categorySelect || !citySelect) return;
        const categorias = [...new Set(eventos.map(ev => ev.categoria).filter(Boolean))];
        const ciudades = [...new Set(eventos.map(ev => ev.ciudad).filter(Boolean))];

        categorySelect.innerHTML = '<option selected>Filtrar por categoría</option>';
        categorias.forEach(cat => {
            const option = document.createElement("option");
            option.value = cat;
            option.textContent = cat;
            categorySelect.appendChild(option);
        });

        citySelect.innerHTML = '<option selected>Filtrar por ciudad</option>';
        ciudades.forEach(ciudad => {
            const option = document.createElement("option");
            option.value = ciudad;
            option.textContent = ciudad;
            citySelect.appendChild(option);
        });
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

    // =========================
    // CARGA DE DATOS
    // =========================
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
            const response = await fetch(API_EVENTOS);
            if (!response.ok) throw new Error("Error al cargar eventos");
            const eventos = await response.json();

            eventosGlobales = eventos;
            populateFilters(eventos);
            renderEventos(eventos);
            if (eventos.length > 0 && !selectedEvent) {
                selectedEvent = eventos[0];
                await cargarTipos(selectedEvent.id_evento);
                updateDetailModal(eventos[0]);
            }
        } catch (error) {
            console.error("Error cargando eventos:", error);
            if (eventosContainer) {
                eventosContainer.innerHTML = `
                    <div class="col-12 text-center py-5 text-danger">
                        <i class="bi bi-exclamation-triangle"></i> Error al cargar eventos. Intenta nuevamente más tarde.
                    </div>
                `;
            }
        }
    }

    // =========================
    // COMPRA CON STOCK REAL
    // =========================
    async function savePurchase() {
        if (!selectedEvent) {
            alert("Primero selecciona un evento.");
            return;
        }

        const tipoId = compraTipoSelect?.value;
        if (!tipoId) {
            alert("Selecciona un tipo de entrada.");
            return;
        }

        const formData = getFormData();
        const validation = validatePurchaseData(formData);
        if (!validation.valid) {
            alert(validation.message);
            return;
        }

        const cantidad = formData.cantidad;
        const tipo = tiposCache.find(t => t.id_tipo_entrada == tipoId);
        if (!tipo) {
            alert("Tipo de entrada no válido.");
            return;
        }
        if (tipo.stock_disponible < cantidad) {
            alert(`Stock insuficiente. Solo quedan ${tipo.stock_disponible} entradas de este tipo.`);
            return;
        }

        const datosOrden = {
            id_evento: selectedEvent.id_evento,
            id_tipo_entrada: tipoId,
            cantidad,
            cliente: {
                nombres: formData.nombres,
                apellidos: formData.apellidos,
                email: formData.email,
                telefono: formData.telefono,
                documento: formData.documento,
                direccion: formData.direccion
            }
        };

        const botonOriginal = payButton.textContent;
        payButton.textContent = "Creando orden...";
        payButton.disabled = true;

        try {
            // 1. Crear orden
            const ordenResponse = await fetch(API_ORDENES, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(datosOrden)
            });
            const ordenData = await ordenResponse.json();
            if (!ordenData.ok) throw new Error(ordenData.message);

            // 2. Generar link de pago con el id_orden
            payButton.textContent = "Conectando con PayPhone...";
            const pagoResponse = await fetch('/api/pagos/generar-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_orden: ordenData.id_orden })
            });
            const pagoData = await pagoResponse.json();
            if (!pagoData.ok) throw new Error(pagoData.message);

            // 3. Guardar en localStorage para mostrar en confirmación
            const purchaseData = {
                id_orden: ordenData.id_orden,
                codigo_orden: ordenData.codigo_orden,
                evento: selectedEvent,
                tipo: tipo,
                comprador: datosOrden.cliente,
                resumen: {
                    cantidad,
                    precioUnitario: tipo.precio,
                    total: ordenData.total
                }
            };
            saveJSON(STORAGE_KEYS.lastPurchase, purchaseData);

            // 4. Redirigir a PayPhone
            window.location.href = pagoData.payUrl;
        } catch (error) {
            console.error('Error:', error);
            alert('Error al procesar la compra: ' + error.message);
            payButton.textContent = botonOriginal;
            payButton.disabled = false;
        }
    }

    // =========================
    // EVENT LISTENERS
    // =========================
    function bindEvents() {
        searchInput?.addEventListener("input", filterEvents);
        categorySelect?.addEventListener("change", filterEvents);
        citySelect?.addEventListener("change", filterEvents);
        buyButtonFromDetail?.addEventListener("click", () => {
            const tipoId = detalleTipoSelect?.value;
            if (compraTipoSelect && tipoId) {
                compraTipoSelect.value = tipoId;
            }
            updatePurchaseSummary();
            const modal = new bootstrap.Modal(document.getElementById('compraModal'));
            modal.show();
        });
        quantityInput?.addEventListener("input", updatePurchaseSummary);
        quantityInput?.addEventListener("change", updatePurchaseSummary);
        payButton?.addEventListener("click", savePurchase);
        if (detalleTipoSelect) {
            detalleTipoSelect.addEventListener("change", () => {
                const tipoInfo = actualizarInfoTipo(detalleTipoSelect, detalleStockInfo);
                if (compraTipoSelect && tipoInfo) {
                    compraTipoSelect.value = tipoInfo.id;
                    updatePurchaseSummary();
                }
            });
        }
        if (compraTipoSelect) {
            compraTipoSelect.addEventListener("change", () => {
                actualizarInfoTipo(compraTipoSelect, compraStockInfo);
                updatePurchaseSummary();
            });
        }
    }

    // Inicialización
    cargarEventos();
    bindEvents();
});