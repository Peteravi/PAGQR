document.addEventListener("DOMContentLoaded", () => {
    const STORAGE_KEYS = {
        currentEvent: "pagqr_current_event",
        lastPurchase: "pagqr_last_purchase",
        purchases: "pagqr_purchases"
    };

    const eventsData = [
        {
            id: 1,
            nombre: "Festival Music Night",
            fecha: "20 de abril de 2026",
            hora: "20:00",
            lugar: "Guayaquil",
            lugarCompleto: "Coliseo Principal, Guayaquil",
            precio: 25.0,
            categoria: "Conciertos",
            ciudad: "Guayaquil",
            descripcion:
                "Disfruta de una noche inolvidable con artistas invitados, luces, shows en vivo y una experiencia única para todos los asistentes.",
            imagen: "assets/img/evento1.jpg"
        },
        {
            id: 2,
            nombre: "Conferencia Tech Future",
            fecha: "05 de mayo de 2026",
            hora: "09:00",
            lugar: "Quito",
            lugarCompleto: "Centro de Convenciones, Quito",
            precio: 15.0,
            categoria: "Conferencias",
            ciudad: "Quito",
            descripcion:
                "Un encuentro para conocer las nuevas tendencias tecnológicas, innovación digital y oportunidades de networking.",
            imagen: "assets/img/evento2.jpg"
        },
        {
            id: 3,
            nombre: "Obra de Teatro Clásico",
            fecha: "12 de mayo de 2026",
            hora: "19:30",
            lugar: "Cuenca",
            lugarCompleto: "Teatro Central, Cuenca",
            precio: 12.0,
            categoria: "Teatro",
            ciudad: "Cuenca",
            descripcion:
                "Vive una presentación escénica de gran nivel con una puesta en escena elegante, cultural y emocionante.",
            imagen: "assets/img/evento3.jpg"
        }
    ];

    let selectedEvent = null;

    const cards = Array.from(document.querySelectorAll("#eventos .card"));
    const counterText = document.querySelector("#eventos .text-muted");

    const searchInput = document.querySelector('section.border-bottom input[type="text"]');
    const selects = document.querySelectorAll("section.border-bottom select");
    const categorySelect = selects[0] || null;
    const citySelect = selects[1] || null;

    const detailModal = document.getElementById("detalleEventoModal");
    const detailTitle = detailModal?.querySelector(".modal-body h3");
    const detailImage = detailModal?.querySelector(".modal-body img");
    const detailParagraphs = detailModal?.querySelectorAll(".modal-body .col-md-6 p");
    const buyButtonFromDetail = detailModal?.querySelector(".btn-success");

    const purchaseModal = document.getElementById("compraModal");
    const purchaseForm = purchaseModal?.querySelector("form");
    const payButton = purchaseModal?.querySelector(".btn.btn-primary.btn-lg");
    const quantityInput = purchaseForm?.querySelector('input[type="number"]') || null;
    const summaryParagraphs = purchaseModal?.querySelectorAll(".row .col-md-6:first-child p");

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

    function generateTicketCode() {
        const randomPart = Math.floor(100000 + Math.random() * 900000);
        return `PAGQR-2026-${randomPart}`;
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
        if (!data.cantidad || data.cantidad < 1) {
            return { valid: false, message: "La cantidad debe ser mayor a 0." };
        }

        return { valid: true, message: "" };
    }

    function updateDetailModal(eventData) {
        if (!detailModal || !eventData) return;

        selectedEvent = eventData;
        saveJSON(STORAGE_KEYS.currentEvent, eventData);

        if (detailTitle) detailTitle.textContent = eventData.nombre;

        if (detailImage) {
            detailImage.src = eventData.imagen;
            detailImage.alt = eventData.nombre;
        }

        if (detailParagraphs && detailParagraphs.length >= 5) {
            detailParagraphs[0].innerHTML = `<strong>Fecha:</strong> ${eventData.fecha}`;
            detailParagraphs[1].innerHTML = `<strong>Hora:</strong> ${eventData.hora}`;
            detailParagraphs[2].innerHTML = `<strong>Lugar:</strong> ${eventData.lugarCompleto}`;
            detailParagraphs[3].innerHTML = `<strong>Precio:</strong> ${formatPrice(eventData.precio)}`;
            detailParagraphs[4].innerHTML = `<strong>Descripción:</strong> ${eventData.descripcion}`;
        }

        updatePurchaseSummary();
    }

    function updatePurchaseSummary() {
        if (!selectedEvent || !summaryParagraphs || summaryParagraphs.length < 4) return;

        const quantity = Math.max(1, Number(quantityInput?.value || 1));
        const total = selectedEvent.precio * quantity;

        summaryParagraphs[0].textContent = `Evento: ${selectedEvent.nombre}`;
        summaryParagraphs[1].textContent = `Cantidad: ${quantity}`;
        summaryParagraphs[2].textContent = `Precio unitario: ${formatPrice(selectedEvent.precio)}`;
        summaryParagraphs[3].textContent = `Total: ${formatPrice(total)}`;
        summaryParagraphs[3].classList.add("fw-bold");
    }

    function extractEventFromCard(index, card) {
        const title = card.querySelector(".card-title")?.textContent?.trim() || "";
        return (
            eventsData[index] || {
                id: index + 1,
                nombre: title,
                fecha: "",
                hora: "",
                lugar: "",
                lugarCompleto: "",
                precio: 0,
                categoria: "",
                ciudad: "",
                descripcion: "",
                imagen: card.querySelector("img")?.getAttribute("src") || ""
            }
        );
    }

    function bindEventCards() {
        cards.forEach((card, index) => {
            const button = card.querySelector('button[data-bs-target="#detalleEventoModal"]');
            const eventData = extractEventFromCard(index, card);

            card.dataset.eventId = String(eventData.id);
            card.dataset.nombre = (eventData.nombre || "").toLowerCase();
            card.dataset.categoria = (eventData.categoria || "").toLowerCase();
            card.dataset.ciudad = (eventData.ciudad || "").toLowerCase();

            if (button) {
                button.addEventListener("click", () => {
                    updateDetailModal(eventData);
                });
            }
        });
    }

    function filterCards() {
        const searchValue = (searchInput?.value || "").trim().toLowerCase();
        const selectedCategory = (categorySelect?.value || "").trim().toLowerCase();
        const selectedCity = (citySelect?.value || "").trim().toLowerCase();

        let visibleCount = 0;

        cards.forEach((card) => {
            const name = card.dataset.nombre || "";
            const category = card.dataset.categoria || "";
            const city = card.dataset.ciudad || "";

            const matchSearch = !searchValue || name.includes(searchValue);
            const matchCategory =
                !selectedCategory ||
                selectedCategory === "filtrar por categoría" ||
                category === selectedCategory;
            const matchCity =
                !selectedCity ||
                selectedCity === "filtrar por ciudad" ||
                city === selectedCity;

            const visible = matchSearch && matchCategory && matchCity;

            if (card.parentElement) {
                card.parentElement.style.display = visible ? "" : "none";
            }

            if (visible) visibleCount++;
        });

        if (counterText) {
            counterText.textContent = `${visibleCount} evento${visibleCount !== 1 ? "s" : ""} encontrado${visibleCount !== 1 ? "s" : ""}`;
        }
    }

    function savePurchase() {
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

        const total = selectedEvent.precio * formData.cantidad;
        const ticketCode = generateTicketCode();

        const purchaseData = {
            idCompra: `ORD-${Date.now()}`,
            fechaCompra: new Date().toISOString(),
            estadoPago: "Pagado",
            metodoPago: "PayPhone",
            evento: selectedEvent,
            comprador: formData,
            ticket: {
                codigo: ticketCode,
                qr: "assets/img/qr-demo.png"
            },
            resumen: {
                cantidad: formData.cantidad,
                precioUnitario: selectedEvent.precio,
                total
            }
        };

        saveJSON(STORAGE_KEYS.lastPurchase, purchaseData);

        const allPurchases = safeParseJSON(STORAGE_KEYS.purchases, []);
        allPurchases.push(purchaseData);
        saveJSON(STORAGE_KEYS.purchases, allPurchases);

        window.location.href = "confirmacion.html";
    }

    function preloadFirstEvent() {
        if (eventsData.length > 0) {
            updateDetailModal(eventsData[0]);
        }
    }

    function bindEvents() {
        searchInput?.addEventListener("input", filterCards);
        categorySelect?.addEventListener("change", filterCards);
        citySelect?.addEventListener("change", filterCards);

        buyButtonFromDetail?.addEventListener("click", updatePurchaseSummary);

        quantityInput?.addEventListener("input", updatePurchaseSummary);
        quantityInput?.addEventListener("change", updatePurchaseSummary);

        payButton?.addEventListener("click", savePurchase);
    }

    bindEventCards();
    bindEvents();
    preloadFirstEvent();
    filterCards();
});