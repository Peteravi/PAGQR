document.addEventListener("DOMContentLoaded", async () => {
    const STORAGE_KEYS = {
        lastPurchase: "pagqr_last_purchase",
        currentTicket: "pagqr_current_ticket"
    };

    function getLastPurchase() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.lastPurchase);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    function formatDate(value) {
        if (!value) return "No disponible";
        return new Date(value).toLocaleDateString("es-EC", {
            day: "2-digit",
            month: "long",
            year: "numeric"
        });
    }

    function formatTime(value) {
        if (!value) return "No disponible";
        return new Date(value).toLocaleTimeString("es-EC", {
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function formatPrice(value) {
        return `$${Number(value || 0).toFixed(2)}`;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function cargarOrdenConPolling(idOrden) {
        for (let intento = 0; intento < 8; intento++) {
            const response = await fetch(`/api/ordenes/${idOrden}/entradas`);
            const data = await response.json();

            if (response.ok && data.ok) {
                if ((data.entradas || []).length > 0 || data.orden?.estado === "fallida") {
                    return data;
                }
            }
            await sleep(2000);
        }
        throw new Error("Todavía no se generaron las entradas. Recarga la página en unos segundos.");
    }

    const purchase = getLastPurchase();

    if (!purchase?.id_orden) {
        alert("No se encontró una compra reciente.");
        window.location.href = "index.html";
        return;
    }

    try {
        const data = await cargarOrdenConPolling(purchase.id_orden);
        const orden = data.orden;
        const ticket = data.entradas?.[0]; // Tomamos la primera entrada para mostrarla

        if (!ticket) {
            throw new Error("La orden existe, pero aún no tiene entradas generadas.");
        }

        localStorage.setItem(STORAGE_KEYS.currentTicket, JSON.stringify(ticket));

        const statusBadge = document.querySelector(".status-badge");
        const heroTitle = document.querySelector(".hero-left h1");
        const heroText = document.querySelector(".hero-left p");
        const ticketCode = document.querySelector(".ticket-code");
        const detailCards = document.querySelectorAll(".info-card");
        const ticketModalTitle = document.querySelector("#ticketModal .ticket-modal-left h3");
        const ticketModalParagraphs = document.querySelectorAll("#ticketModal .ticket-modal-left p");
        const resumenRows = document.querySelectorAll("#resumenModal .resume-list div");
        const qrBoxPrincipal = document.querySelector(".qr-box");
        const qrBoxModal = document.querySelector("#ticketModal .modal-qr-box");

        const comprador = orden.comprador;
        const fullName = `${comprador.nombres || ""} ${comprador.apellidos || ""}`.trim();

        if (statusBadge) statusBadge.innerHTML = `<span class="dot"></span>${orden.estado === "pagada" ? "Pagado" : orden.estado}`;
        if (heroTitle) heroTitle.textContent = "¡Compra realizada con éxito!";
        if (heroText) {
            heroText.textContent = `Tu compra para "${ticket.evento.nombre}" fue registrada correctamente. Tu entrada digital ya está disponible con un código QR único para el acceso.`;
        }

        if (ticketCode) ticketCode.textContent = ticket.codigo;
        if (qrBoxPrincipal) {
            qrBoxPrincipal.innerHTML = ""; // Limpiamos la imagen quemada
            new QRCode(qrBoxPrincipal, {
                text: ticket.codigo, // Pasamos el código secreto del ticket
                width: 160,
                height: 160,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
        }
        if (qrBoxModal) {
            qrBoxModal.innerHTML = ""; // Limpiamos la imagen quemada
            new QRCode(qrBoxModal, {
                text: ticket.codigo,
                width: 200,
                height: 200,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
        }

        if (detailCards.length >= 2) {
            const eventCardRows = detailCards[0].querySelectorAll(".detail-item");
            const buyerCardRows = detailCards[1].querySelectorAll(".detail-item");

            if (eventCardRows.length >= 5) {
                eventCardRows[0].innerHTML = `<span>Evento</span><strong>${ticket.evento.nombre}</strong>`;
                eventCardRows[1].innerHTML = `<span>Fecha</span><strong>${formatDate(ticket.evento.fecha_evento)}</strong>`;
                eventCardRows[2].innerHTML = `<span>Hora</span><strong>${formatTime(ticket.evento.fecha_evento)}</strong>`;
                eventCardRows[3].innerHTML = `<span>Lugar</span><strong>${ticket.evento.lugar || "No disponible"}</strong>`;
                eventCardRows[4].innerHTML = `<span>Cantidad</span><strong>${data.entradas.length} entrada${data.entradas.length > 1 ? "s" : ""}</strong>`;
            }

            if (buyerCardRows.length >= 5) {
                buyerCardRows[0].innerHTML = `<span>Nombre</span><strong>${fullName || "No disponible"}</strong>`;
                buyerCardRows[1].innerHTML = `<span>Correo</span><strong>${comprador.email || "No disponible"}</strong>`;
                buyerCardRows[2].innerHTML = `<span>Teléfono</span><strong>${comprador.telefono || "No disponible"}</strong>`;
                buyerCardRows[3].innerHTML = `<span>Documento</span><strong>${comprador.documento || "No disponible"}</strong>`;
                buyerCardRows[4].innerHTML = `<span>Total pagado</span><strong>${formatPrice(orden.total)}</strong>`;
            }
        }

        if (ticketModalTitle) ticketModalTitle.textContent = ticket.evento.nombre;

        if (ticketModalParagraphs.length >= 5) {
            ticketModalParagraphs[0].innerHTML = `<strong>Fecha:</strong> ${formatDate(ticket.evento.fecha_evento)}`;
            ticketModalParagraphs[1].innerHTML = `<strong>Hora:</strong> ${formatTime(ticket.evento.fecha_evento)}`;
            ticketModalParagraphs[2].innerHTML = `<strong>Lugar:</strong> ${ticket.evento.lugar || "No disponible"}`;
            ticketModalParagraphs[3].innerHTML = `<strong>Asistente:</strong> ${fullName || "No disponible"}`;
            ticketModalParagraphs[4].innerHTML = `<strong>Código:</strong> ${ticket.codigo}`;
        }

        if (resumenRows.length >= 6) {
            resumenRows[0].innerHTML = `<span>Evento</span><strong>${ticket.evento.nombre}</strong>`;
            resumenRows[1].innerHTML = `<span>Cantidad</span><strong>${data.entradas.length}</strong>`;
            resumenRows[2].innerHTML = `<span>Precio unitario</span><strong>${formatPrice(ticket.tipo.precio)}</strong>`;
            resumenRows[3].innerHTML = `<span>Método de pago</span><strong>PayPhone</strong>`;
            resumenRows[4].innerHTML = `<span>Estado</span><strong class="success-text">${orden.estado === 'pagada' ? 'Pagado' : orden.estado}</strong>`;
            resumenRows[5].innerHTML = `<span>Total</span><strong>${formatPrice(orden.total)}</strong>`;
        }
    } catch (error) {
        console.error(error);
        alert(error.message);
    }
});