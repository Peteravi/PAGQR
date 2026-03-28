document.addEventListener("DOMContentLoaded", () => {
    const STORAGE_KEYS = {
        lastPurchase: "pagqr_last_purchase"
    };

    function safeParseJSON(key, fallback = null) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (error) {
            console.error(`Error leyendo localStorage: ${key}`, error);
            return fallback;
        }
    }

    function safeText(value, fallback = "No disponible") {
        return value ?? fallback;
    }

    function formatPrice(value) {
        return `$${Number(value || 0).toFixed(2)}`;
    }

    const purchase = safeParseJSON(STORAGE_KEYS.lastPurchase, null);

    if (!purchase) {
        alert("No se encontró una compra reciente. Serás redirigido al inicio.");
        window.location.href = "index.html";
        return;
    }

    const statusBadge = document.querySelector(".status-badge");
    const heroTitle = document.querySelector(".hero-left h1");
    const heroText = document.querySelector(".hero-left p");
    const qrImage = document.querySelector(".qr-box img");
    const ticketCode = document.querySelector(".ticket-code");

    const detailCards = document.querySelectorAll(".info-card");

    const ticketModalTitle = document.querySelector("#ticketModal .ticket-modal-left h3");
    const ticketModalParagraphs = document.querySelectorAll("#ticketModal .ticket-modal-left p");
    const ticketModalQR = document.querySelector("#ticketModal .modal-qr-box img");

    const resumenRows = document.querySelectorAll("#resumenModal .resume-list div");

    if (statusBadge) {
        statusBadge.innerHTML = `<span class="dot"></span>${safeText(purchase.estadoPago, "Pagado")}`;
    }

    if (heroTitle) {
        heroTitle.textContent = "¡Compra realizada con éxito!";
    }

    if (heroText) {
        heroText.textContent =
            `Tu compra para "${safeText(purchase.evento?.nombre)}" fue registrada correctamente. ` +
            `Tu entrada digital ya está disponible con un código QR único para el acceso.`;
    }

    if (qrImage) {
        qrImage.src = safeText(purchase.ticket?.qr, "assets/img/qr-demo.png");
        qrImage.alt = `QR de ${safeText(purchase.evento?.nombre)}`;
    }

    if (ticketCode) {
        ticketCode.textContent = safeText(purchase.ticket?.codigo);
    }

    if (detailCards.length >= 2) {
        const eventCardRows = detailCards[0].querySelectorAll(".detail-item");
        const buyerCardRows = detailCards[1].querySelectorAll(".detail-item");

        if (eventCardRows.length >= 5) {
            eventCardRows[0].innerHTML = `<span>Evento</span><strong>${safeText(purchase.evento?.nombre)}</strong>`;
            eventCardRows[1].innerHTML = `<span>Fecha</span><strong>${safeText(purchase.evento?.fecha)}</strong>`;
            eventCardRows[2].innerHTML = `<span>Hora</span><strong>${safeText(purchase.evento?.hora)}</strong>`;
            eventCardRows[3].innerHTML = `<span>Lugar</span><strong>${safeText(purchase.evento?.lugarCompleto)}</strong>`;
            eventCardRows[4].innerHTML = `<span>Cantidad</span><strong>${safeText(purchase.resumen?.cantidad)} entrada${Number(purchase.resumen?.cantidad) > 1 ? "s" : ""}</strong>`;
        }

        if (buyerCardRows.length >= 5) {
            const fullName = `${safeText(purchase.comprador?.nombres, "")} ${safeText(purchase.comprador?.apellidos, "")}`.trim();

            buyerCardRows[0].innerHTML = `<span>Nombre</span><strong>${fullName || "No disponible"}</strong>`;
            buyerCardRows[1].innerHTML = `<span>Correo</span><strong>${safeText(purchase.comprador?.email)}</strong>`;
            buyerCardRows[2].innerHTML = `<span>Teléfono</span><strong>${safeText(purchase.comprador?.telefono)}</strong>`;
            buyerCardRows[3].innerHTML = `<span>Documento</span><strong>${safeText(purchase.comprador?.documento)}</strong>`;
            buyerCardRows[4].innerHTML = `<span>Total pagado</span><strong>${formatPrice(purchase.resumen?.total)}</strong>`;
        }
    }

    if (ticketModalTitle) {
        ticketModalTitle.textContent = safeText(purchase.evento?.nombre);
    }

    if (ticketModalParagraphs.length >= 5) {
        const fullName = `${safeText(purchase.comprador?.nombres, "")} ${safeText(purchase.comprador?.apellidos, "")}`.trim();

        ticketModalParagraphs[0].innerHTML = `<strong>Fecha:</strong> ${safeText(purchase.evento?.fecha)}`;
        ticketModalParagraphs[1].innerHTML = `<strong>Hora:</strong> ${safeText(purchase.evento?.hora)}`;
        ticketModalParagraphs[2].innerHTML = `<strong>Lugar:</strong> ${safeText(purchase.evento?.lugarCompleto)}`;
        ticketModalParagraphs[3].innerHTML = `<strong>Asistente:</strong> ${fullName || "No disponible"}`;
        ticketModalParagraphs[4].innerHTML = `<strong>Código:</strong> ${safeText(purchase.ticket?.codigo)}`;
    }

    if (ticketModalQR) {
        ticketModalQR.src = safeText(purchase.ticket?.qr, "assets/img/qr-demo.png");
        ticketModalQR.alt = `QR de ${safeText(purchase.ticket?.codigo)}`;
    }

    if (resumenRows.length >= 6) {
        resumenRows[0].innerHTML = `<span>Evento</span><strong>${safeText(purchase.evento?.nombre)}</strong>`;
        resumenRows[1].innerHTML = `<span>Cantidad</span><strong>${safeText(purchase.resumen?.cantidad)}</strong>`;
        resumenRows[2].innerHTML = `<span>Precio unitario</span><strong>${formatPrice(purchase.resumen?.precioUnitario)}</strong>`;
        resumenRows[3].innerHTML = `<span>Método de pago</span><strong>${safeText(purchase.metodoPago)}</strong>`;
        resumenRows[4].innerHTML = `<span>Estado</span><strong class="success-text">${safeText(purchase.estadoPago)}</strong>`;
        resumenRows[5].innerHTML = `<span>Total</span><strong>${formatPrice(purchase.resumen?.total)}</strong>`;
    }

    const downloadButton = document.querySelector("#ticketModal .btn-main");
    if (downloadButton) {
        downloadButton.addEventListener("click", () => {
            alert("Aquí luego se conectará la descarga real del ticket.");
        });
    }
});