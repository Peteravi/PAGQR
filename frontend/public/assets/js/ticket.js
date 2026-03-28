document.addEventListener("DOMContentLoaded", () => {
    const STORAGE_KEYS = {
        currentTicket: "pagqr_current_ticket",
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

    const ticketData =
        safeParseJSON(STORAGE_KEYS.currentTicket, null) ||
        safeParseJSON(STORAGE_KEYS.lastPurchase, null);

    if (!ticketData) {
        alert("No se encontró información del ticket. Serás redirigido al inicio.");
        window.location.href = "index.html";
        return;
    }

    const title = document.querySelector(".ticket-left h1");
    const description = document.querySelector(".ticket-description");
    const dataRows = document.querySelectorAll(".ticket-data div");

    const qrImage = document.querySelector(".qr-block img");
    const visualCode = document.querySelector(".visual-code");
    const miniInfo = document.querySelectorAll(".mini-info p");

    const modalQRImage = document.querySelector(".big-qr-box img");
    const modalTitle = document.querySelector("#qrLargeModal h4");
    const modalCode = document.querySelector(".modal-code");

    if (title) {
        title.textContent = safeText(ticketData.evento?.nombre);
    }

    if (description) {
        description.textContent =
            `Presenta este código QR en el acceso del evento "${safeText(ticketData.evento?.nombre)}". ` +
            `Este ticket es único y válido para un solo ingreso.`;
    }

    if (dataRows.length >= 6) {
        const fullName = `${safeText(ticketData.comprador?.nombres, "")} ${safeText(ticketData.comprador?.apellidos, "")}`.trim();

        dataRows[0].innerHTML = `<span>Fecha</span><strong>${safeText(ticketData.evento?.fecha)}</strong>`;
        dataRows[1].innerHTML = `<span>Hora</span><strong>${safeText(ticketData.evento?.hora)}</strong>`;
        dataRows[2].innerHTML = `<span>Lugar</span><strong>${safeText(ticketData.evento?.lugarCompleto)}</strong>`;
        dataRows[3].innerHTML = `<span>Asistente</span><strong>${fullName || "No disponible"}</strong>`;
        dataRows[4].innerHTML = `<span>Documento</span><strong>${safeText(ticketData.comprador?.documento)}</strong>`;
        dataRows[5].innerHTML = `<span>Código</span><strong>${safeText(ticketData.ticket?.codigo)}</strong>`;
    }

    if (qrImage) {
        qrImage.src = safeText(ticketData.ticket?.qr, "assets/img/qr-demo.png");
        qrImage.alt = safeText(ticketData.ticket?.codigo);
    }

    if (visualCode) {
        visualCode.textContent = safeText(ticketData.ticket?.codigo);
    }

    if (miniInfo.length >= 3) {
        miniInfo[0].innerHTML = `<strong>Zona:</strong> General`;
        miniInfo[1].innerHTML = `<strong>Cantidad:</strong> ${safeText(ticketData.resumen?.cantidad)}`;
        miniInfo[2].innerHTML = `<strong>Total:</strong> ${formatPrice(ticketData.resumen?.total)}`;
    }

    if (modalQRImage) {
        modalQRImage.src = safeText(ticketData.ticket?.qr, "assets/img/qr-demo.png");
        modalQRImage.alt = safeText(ticketData.ticket?.codigo);
    }

    if (modalTitle) {
        modalTitle.textContent = safeText(ticketData.evento?.nombre);
    }

    if (modalCode) {
        modalCode.textContent = safeText(ticketData.ticket?.codigo);
    }

    const downloadButton = document.querySelector("#qrLargeModal .btn-main");
    if (downloadButton) {
        downloadButton.addEventListener("click", () => {
            alert("Aquí luego se conectará la descarga real del ticket.");
        });
    }
});