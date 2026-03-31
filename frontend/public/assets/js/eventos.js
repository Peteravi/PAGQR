document.addEventListener("DOMContentLoaded", () => {
    // Configuración
    const API_EVENTOS = "http://localhost:3000/api/eventos";
    const STORAGE_KEYS = {
        currentEvent: "pagqr_current_event",
        lastPurchase: "pagqr_last_purchase",
        purchases: "pagqr_purchases"
    };

    // Elementos del DOM
    const eventosContainer = document.getElementById("eventosContainer");
    const counterText = document.getElementById("eventosCount");
    const searchInput = document.getElementById("searchInput");
    const categorySelect = document.getElementById("categorySelect");
    const citySelect = document.getElementById("citySelect");
    const detailModal = document.getElementById("detalleEventoModal");
    const detailTitle = detailModal?.querySelector(".modal-body h3");
    const detailImage = detailModal?.querySelector(".modal-body img");
    const detailParagraphs = detailModal?.querySelectorAll(".modal-body .col-md-6 p");
    const buyButtonFromDetail = detailModal?.querySelector(".btn-success");
    const purchaseModal = document.getElementById("compraModal");
    const purchaseForm = purchaseModal?.querySelector("form");
    const payButton = purchaseModal?.querySelector(".btn-primary");
    const quantityInput = purchaseForm?.querySelector('input[type="number"]') || null;
    const summaryParagraphs = purchaseModal?.querySelectorAll(".row .col-md-6:first-child p");

    let eventosGlobales = [];
    let selectedEvent = null;

    // Utilidades
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

    // Renderizado de tarjetas
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
                        <p class="card-text mb-3"><strong>Precio:</strong> ${formatPrice(ev.precio || 0)}</p>
                        <button class="btn btn-primary w-100" data-bs-toggle="modal" data-bs-target="#detalleEventoModal">
                            Ver detalle
                        </button>
                    </div>
                </div>
            `;

            const button = col.querySelector("button");
            button.addEventListener("click", () => {
                selectedEvent = ev;
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

        if (detailParagraphs && detailParagraphs.length >= 5) {
            detailParagraphs[0].innerHTML = `<strong>Fecha:</strong> ${fechaFormateada}`;
            detailParagraphs[1].innerHTML = `<strong>Hora:</strong> ${horaFormateada}`;
            detailParagraphs[2].innerHTML = `<strong>Lugar:</strong> ${escapeHtml(lugarCompleto)}`;
            detailParagraphs[3].innerHTML = `<strong>Precio:</strong> ${formatPrice(evento.precio || 0)}`;
            detailParagraphs[4].innerHTML = `<strong>Descripción:</strong> ${escapeHtml(evento.descripcion || "Sin descripción")}`;
        }

        updatePurchaseSummary();
    }

    function updatePurchaseSummary() {
        if (!selectedEvent || !summaryParagraphs || summaryParagraphs.length < 4) return;
        const quantity = Math.max(1, Number(quantityInput?.value || 1));
        const total = (selectedEvent.precio || 0) * quantity;

        summaryParagraphs[0].textContent = `Evento: ${selectedEvent.titulo}`;
        summaryParagraphs[1].textContent = `Cantidad: ${quantity}`;
        summaryParagraphs[2].textContent = `Precio unitario: ${formatPrice(selectedEvent.precio || 0)}`;
        summaryParagraphs[3].textContent = `Total: ${formatPrice(total)}`;
        summaryParagraphs[3].classList.add("fw-bold");
    }

    // Filtros
    function populateFilters(eventos) {
        if (!categorySelect || !citySelect) return;

        const categorias = [...new Set(eventos.map(ev => ev.categoria).filter(Boolean))];
        const ciudades = [...new Set(eventos.map(ev => ev.ciudad).filter(Boolean))];

        categorySelect.innerHTML = '<option selected>Todas las categorías</option>';
        categorias.forEach(cat => {
            const option = document.createElement("option");
            option.value = cat;
            option.textContent = cat;
            categorySelect.appendChild(option);
        });

        citySelect.innerHTML = '<option selected>Todas las ciudades</option>';
        ciudades.forEach(ciudad => {
            const option = document.createElement("option");
            option.value = ciudad;
            option.textContent = ciudad;
            citySelect.appendChild(option);
        });
    }

    function filterEvents() {
        const searchTerm = (searchInput?.value || "").trim().toLowerCase();
        const selectedCategory = (categorySelect?.value || "").trim();
        const selectedCity = (citySelect?.value || "").trim();

        const filtered = eventosGlobales.filter(ev => {
            const matchSearch = !searchTerm || ev.titulo?.toLowerCase().includes(searchTerm);
            const matchCategory = !selectedCategory || selectedCategory === "Todas las categorías" || ev.categoria === selectedCategory;
            const matchCity = !selectedCity || selectedCity === "Todas las ciudades" || ev.ciudad === selectedCity;
            return matchSearch && matchCategory && matchCity;
        });

        renderEventos(filtered);
    }

    // Carga de datos
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

    // Compra (pago)
    async function savePurchase() {
        if (!selectedEvent) {
            alert("Primero selecciona un evento.");
            return;
        }

        const formData = getFormData();
        const validation = validatePurchaseData(formData);
        if (!validation.valid) {
            alert(validation.message);
            return;
        }

        const datosParaBackend = {
            cantidad: formData.cantidad,
            precioUnitario: selectedEvent.precio,
            cliente: formData,
            evento: selectedEvent
        };

        const botonOriginal = payButton.textContent;
        payButton.textContent = "Conectando con PayPhone...";
        payButton.disabled = true;

        try {
            const respuesta = await fetch('/api/pagos/generar-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(datosParaBackend)
            });

            const data = await respuesta.json();

            if (data.ok && data.payUrl) {
                const purchaseData = {
                    idCompra: data.codigoOrden,
                    fechaCompra: new Date().toISOString(),
                    estadoPago: "Pendiente",
                    metodoPago: "PayPhone",
                    evento: selectedEvent,
                    comprador: formData,
                    resumen: {
                        cantidad: formData.cantidad,
                        precioUnitario: selectedEvent.precio,
                        total: selectedEvent.precio * formData.cantidad
                    }
                };
                saveJSON(STORAGE_KEYS.lastPurchase, purchaseData);
                window.location.href = data.payUrl;
            } else {
                alert('Error al generar el link: ' + (data.message || 'Desconocido'));
                payButton.textContent = botonOriginal;
                payButton.disabled = false;
            }
        } catch (error) {
            console.error('Error de conexión:', error);
            alert('Hubo un problema al intentar conectar con el servidor.');
            payButton.textContent = botonOriginal;
            payButton.disabled = false;
        }
    }

    // Event Listeners
    function bindEvents() {
        searchInput?.addEventListener("input", filterEvents);
        categorySelect?.addEventListener("change", filterEvents);
        citySelect?.addEventListener("change", filterEvents);
        buyButtonFromDetail?.addEventListener("click", () => {
            updatePurchaseSummary();
            const modal = new bootstrap.Modal(document.getElementById('compraModal'));
            modal.show();
        });
        quantityInput?.addEventListener("input", updatePurchaseSummary);
        quantityInput?.addEventListener("change", updatePurchaseSummary);
        payButton?.addEventListener("click", savePurchase);
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

    cargarEventos();
    bindEvents();
});