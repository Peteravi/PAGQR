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

    function normalizeString(value) {
        return typeof value === "string" ? value.trim() : "";
    }

    function normalizeLower(value) {
        return normalizeString(value).toLowerCase();
    }

    function getFriendlyStatusText(ordenEstado, pagoEstado) {
        const estadoOrden = normalizeLower(ordenEstado);
        const estadoPago = normalizeLower(pagoEstado);

        if (estadoOrden === "pagada" || estadoOrden === "aprobada") return "Pagado";
        if (estadoOrden === "fallida") return "Fallida";
        if (estadoOrden === "pendiente") return "Pendiente";

        if (estadoPago === "aprobado" || estadoPago === "pagado" || estadoPago === "completed") return "Pagado";
        if (estadoPago === "rechazado" || estadoPago === "anulado") return "Fallida";
        if (estadoPago === "pendiente" || estadoPago === "iniciado") return "Pendiente";

        return ordenEstado || pagoEstado || "Desconocido";
    }

    function setStatusBadge(statusBadge, text) {
        if (!statusBadge) return;
        statusBadge.innerHTML = `<span class="dot"></span>${text}`;
    }

    function setHeroMessage(heroTitle, heroText, mode, data) {
        if (!heroTitle || !heroText) return;

        const ticket = data?.entradas?.[0];
        const orden = data?.orden || {};
        const eventoNombre = ticket?.evento?.nombre || "tu evento";
        const backendMessage = data?.message || "";

        if (mode === "ready") {
            heroTitle.textContent = "¡Compra realizada con éxito!";
            heroText.textContent = `Tu compra para "${eventoNombre}" fue registrada correctamente. Tu entrada digital ya está disponible con un código QR único para el acceso.`;
            return;
        }

        if (mode === "processing") {
            heroTitle.textContent = "Pago confirmado, procesando entradas";
            heroText.textContent = backendMessage || `Tu pago fue confirmado correctamente. Estamos generando tus entradas digitales para la orden ${orden.codigo_orden || ""}.`;
            return;
        }

        if (mode === "pending") {
            heroTitle.textContent = "Pago en proceso";
            heroText.textContent = backendMessage || "Tu pago todavía está pendiente de confirmación. Esta página se actualizará automáticamente cuando tengamos respuesta.";
            return;
        }

        if (mode === "failed") {
            heroTitle.textContent = "No se pudo completar la compra";
            heroText.textContent = backendMessage || "La orden no fue aprobada y no se generaron entradas.";
            return;
        }

        heroTitle.textContent = "Estado de tu compra";
        heroText.textContent = backendMessage || "Estamos consultando el estado de tu orden.";
    }

    function clearQrBox(qrBoxElement) {
        if (qrBoxElement) {
            qrBoxElement.innerHTML = "";
        }
    }

    function renderQr(qrBoxElement, text, size) {
        if (!qrBoxElement || !text || typeof QRCode === "undefined") return;

        qrBoxElement.innerHTML = "";
        new QRCode(qrBoxElement, {
            text,
            width: size,
            height: size,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    }

    function renderSummaryWithoutTickets(data) {
        const statusBadge = document.querySelector(".status-badge");
        const heroTitle = document.querySelector(".hero-left h1");
        const heroText = document.querySelector(".hero-left p");
        const ticketCode = document.querySelector(".ticket-code");
        const detailCards = document.querySelectorAll(".info-card");
        const ticketModalTitle = document.querySelector("#ticketModal .ticket-modal-left h3");
        const ticketModalParagraphs = document.querySelectorAll("#ticketModal .ticket-modal-left p");
        const resumenRows = document.querySelectorAll("#resumenModal .resume-list div");
        const qrBoxPrincipal = document.getElementById("qrContenedorPrincipal");
        const qrBoxModal = document.getElementById("qrContenedorModal");

        const orden = data?.orden || {};
        const pago = data?.pago || null;
        const comprador = orden?.comprador || {};
        const estadoConsulta = data?.estado_consulta || {};
        const fullName = `${comprador.nombres || ""} ${comprador.apellidos || ""}`.trim();
        const friendlyStatus = getFriendlyStatusText(orden.estado, pago?.estado);

        let mode = "generic";
        if (estadoConsulta.esperando_generacion) mode = "processing";
        else if (estadoConsulta.pago_pendiente) mode = "pending";
        else if (estadoConsulta.pago_fallido) mode = "failed";

        setStatusBadge(statusBadge, friendlyStatus);
        setHeroMessage(heroTitle, heroText, mode, data);

        if (ticketCode) {
            ticketCode.textContent = orden.codigo_orden || "Procesando...";
        }

        clearQrBox(qrBoxPrincipal);
        clearQrBox(qrBoxModal);

        if (detailCards.length >= 2) {
            const eventCardRows = detailCards[0].querySelectorAll(".detail-item");
            const buyerCardRows = detailCards[1].querySelectorAll(".detail-item");

            if (eventCardRows.length >= 5) {
                eventCardRows[0].innerHTML = `<span>Evento</span><strong>${mode === "processing" ? "Generando entradas..." : "No disponible aún"}</strong>`;
                eventCardRows[1].innerHTML = `<span>Fecha</span><strong>No disponible</strong>`;
                eventCardRows[2].innerHTML = `<span>Hora</span><strong>No disponible</strong>`;
                eventCardRows[3].innerHTML = `<span>Lugar</span><strong>No disponible</strong>`;
                eventCardRows[4].innerHTML = `<span>Cantidad</span><strong>${Number(estadoConsulta.total_entradas || 0)} entrada${Number(estadoConsulta.total_entradas || 0) !== 1 ? "s" : ""}</strong>`;
            }

            if (buyerCardRows.length >= 5) {
                buyerCardRows[0].innerHTML = `<span>Nombre</span><strong>${fullName || "No disponible"}</strong>`;
                buyerCardRows[1].innerHTML = `<span>Correo</span><strong>${comprador.email || "No disponible"}</strong>`;
                buyerCardRows[2].innerHTML = `<span>Teléfono</span><strong>${comprador.telefono || "No disponible"}</strong>`;
                buyerCardRows[3].innerHTML = `<span>Documento</span><strong>${comprador.documento || "No disponible"}</strong>`;
                buyerCardRows[4].innerHTML = `<span>Total pagado</span><strong>${formatPrice(orden.total)}</strong>`;
            }
        }

        if (ticketModalTitle) {
            ticketModalTitle.textContent = mode === "failed"
                ? "Compra no aprobada"
                : mode === "pending"
                    ? "Pago pendiente"
                    : "Generando entradas";
        }

        if (ticketModalParagraphs.length >= 5) {
            ticketModalParagraphs[0].innerHTML = `<strong>Orden:</strong> ${orden.codigo_orden || "No disponible"}`;
            ticketModalParagraphs[1].innerHTML = `<strong>Estado orden:</strong> ${orden.estado || "No disponible"}`;
            ticketModalParagraphs[2].innerHTML = `<strong>Estado pago:</strong> ${pago?.estado || "No disponible"}`;
            ticketModalParagraphs[3].innerHTML = `<strong>Comprador:</strong> ${fullName || "No disponible"}`;
            ticketModalParagraphs[4].innerHTML = `<strong>Mensaje:</strong> ${data?.message || "Sin novedades"}`;
        }

        if (resumenRows.length >= 6) {
            resumenRows[0].innerHTML = `<span>Evento</span><strong>${mode === "processing" ? "Generando..." : "No disponible"}</strong>`;
            resumenRows[1].innerHTML = `<span>Cantidad</span><strong>${Number(estadoConsulta.total_entradas || 0)}</strong>`;
            resumenRows[2].innerHTML = `<span>Precio unitario</span><strong>No disponible</strong>`;
            resumenRows[3].innerHTML = `<span>Método de pago</span><strong>${pago?.proveedor_pago || "Payphone"}</strong>`;
            resumenRows[4].innerHTML = `<span>Estado</span><strong class="${mode === "failed" ? "" : "success-text"}">${friendlyStatus}</strong>`;
            resumenRows[5].innerHTML = `<span>Total</span><strong>${formatPrice(orden.total)}</strong>`;
        }
    }

    function renderReadyState(data) {
        const orden = data.orden;
        const ticket = data.entradas?.[0];

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
        const friendlyStatus = getFriendlyStatusText(orden.estado, data?.pago?.estado);

        setStatusBadge(statusBadge, friendlyStatus);
        setHeroMessage(heroTitle, heroText, "ready", data);

        if (ticketCode) ticketCode.textContent = ticket.codigo;

        renderQr(qrBoxPrincipal, ticket.codigo, 160);
        renderQr(qrBoxModal, ticket.codigo, 200);

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
            resumenRows[3].innerHTML = `<span>Método de pago</span><strong>${data?.pago?.proveedor_pago || "Payphone"}</strong>`;
            resumenRows[4].innerHTML = `<span>Estado</span><strong class="success-text">${friendlyStatus}</strong>`;
            resumenRows[5].innerHTML = `<span>Total</span><strong>${formatPrice(orden.total)}</strong>`;
        }
    }

    async function cargarOrdenConPolling(idOrden) {
        const totalIntentos = 10;
        let ultimoData = null;
        let ultimoError = null;

        for (let intento = 0; intento < totalIntentos; intento++) {
            try {
                const response = await fetch(`/api/ordenes/${idOrden}/entradas`, {
                    cache: "no-store"
                });

                let data = null;
                try {
                    data = await response.json();
                } catch {
                    data = null;
                }

                if (!response.ok || !data?.ok) {
                    ultimoError = new Error(data?.message || "No se pudo consultar la orden.");
                    await sleep(2000);
                    continue;
                }

                ultimoData = data;

                const entradas = Array.isArray(data.entradas) ? data.entradas : [];
                const estadoConsulta = data.estado_consulta || {};
                const ordenEstado = normalizeLower(data?.orden?.estado);
                const pagoEstado = normalizeLower(data?.pago?.estado);

                if (entradas.length > 0) {
                    return {
                        mode: "ready",
                        data
                    };
                }

                if (estadoConsulta.pago_fallido || ordenEstado === "fallida") {
                    return {
                        mode: "failed",
                        data
                    };
                }

                if (estadoConsulta.esperando_generacion) {
                    if (intento < totalIntentos - 1) {
                        await sleep(2000);
                        continue;
                    }

                    return {
                        mode: "processing",
                        data
                    };
                }

                if (
                    estadoConsulta.pago_pendiente ||
                    ordenEstado === "pendiente" ||
                    pagoEstado === "pendiente" ||
                    pagoEstado === "iniciado"
                ) {
                    if (intento < totalIntentos - 1) {
                        await sleep(2000);
                        continue;
                    }

                    return {
                        mode: "pending",
                        data
                    };
                }

                if (
                    ordenEstado === "pagada" ||
                    ordenEstado === "aprobada" ||
                    pagoEstado === "aprobado" ||
                    pagoEstado === "pagado" ||
                    pagoEstado === "completed"
                ) {
                    if (intento < totalIntentos - 1) {
                        await sleep(2000);
                        continue;
                    }

                    return {
                        mode: "processing",
                        data
                    };
                }

                if (intento < totalIntentos - 1) {
                    await sleep(2000);
                    continue;
                }

                return {
                    mode: "generic",
                    data
                };
            } catch (error) {
                ultimoError = error;
                if (intento < totalIntentos - 1) {
                    await sleep(2000);
                }
            }
        }

        if (ultimoData) {
            return {
                mode: "generic",
                data: ultimoData
            };
        }

        throw ultimoError || new Error("No se pudo consultar el estado de tu compra.");
    }

    const purchase = getLastPurchase();

    if (!purchase?.id_orden) {
        alert("No se encontró una compra reciente.");
        window.location.href = "index.html";
        return;
    }

    try {
        const result = await cargarOrdenConPolling(purchase.id_orden);

        if (result.mode === "ready") {
            renderReadyState(result.data);
            return;
        }

        if (
            result.mode === "processing" ||
            result.mode === "pending" ||
            result.mode === "failed" ||
            result.mode === "generic"
        ) {
            renderSummaryWithoutTickets(result.data);

            if (result.mode === "failed") {
                console.warn(result.data?.message || "La orden no fue aprobada.");
            }

            return;
        }

        throw new Error("No se pudo determinar el estado de la orden.");
    } catch (error) {
        console.error(error);
        alert(error.message || "No se pudo cargar la confirmación de la compra.");
    }
});