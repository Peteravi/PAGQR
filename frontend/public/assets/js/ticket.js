document.addEventListener("DOMContentLoaded", async () => {
    const API_ENTRADAS = "/api/entradas";
    const STORAGE_KEYS = {
        currentTicket: "pagqr_current_ticket"
    };

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

    function getCodigo() {
        const params = new URLSearchParams(window.location.search);
        const codigoUrl = params.get("codigo");
        if (codigoUrl) return codigoUrl;

        const raw = localStorage.getItem(STORAGE_KEYS.currentTicket);
        if (!raw) return null;

        try {
            const parsed = JSON.parse(raw);
            return parsed?.codigo || null;
        } catch {
            return null;
        }
    }

    async function cargarTicket(codigo) {
        const response = await fetch(`${API_ENTRADAS}/codigo/${encodeURIComponent(codigo)}`);
        const data = await response.json();

        if (!response.ok || !data.ok) {
            throw new Error(data.message || "No se pudo cargar el ticket");
        }

        return data.entrada;
    }

    const codigo = getCodigo();

    if (!codigo) {
        alert("No se encontró el código del ticket.");
        window.location.href = "mis-entradas.html";
        return;
    }

    try {
        const ticket = await cargarTicket(codigo);
        localStorage.setItem(STORAGE_KEYS.currentTicket, JSON.stringify(ticket));

        const title = document.querySelector(".ticket-left h1");
        const description = document.querySelector(".ticket-description");
        const dataRows = document.querySelectorAll(".ticket-data div");
        const qrImage = document.querySelector(".qr-block img");
        const visualCode = document.querySelector(".visual-code");
        const miniInfo = document.querySelectorAll(".mini-info p");
        const modalQRImage = document.querySelector(".big-qr-box img");
        const modalTitle = document.querySelector("#qrLargeModal h4");
        const modalCode = document.querySelector(".modal-code");
        const badgeStatus = document.querySelector(".badge-status");

        const comprador = `${ticket.comprador.nombres || ""} ${ticket.comprador.apellidos || ""}`.trim();

        if (badgeStatus) {
            badgeStatus.textContent = ticket.estado === "usada" ? "Usado" : "Válido";
        }

        if (title) {
            title.textContent = ticket.evento.nombre || "Evento";
        }

        if (description) {
            description.textContent =
                `Presenta este código QR en el acceso del evento "${ticket.evento.nombre}". ` +
                `Este ticket es único y válido para un solo ingreso.`;
        }

        if (dataRows.length >= 6) {
            dataRows[0].innerHTML = `<span>Fecha</span><strong>${formatDate(ticket.evento.fecha_evento)}</strong>`;
            dataRows[1].innerHTML = `<span>Hora</span><strong>${formatTime(ticket.evento.fecha_evento)}</strong>`;
            dataRows[2].innerHTML = `<span>Lugar</span><strong>${ticket.evento.lugar || "No disponible"}</strong>`;
            dataRows[3].innerHTML = `<span>Asistente</span><strong>${comprador || "No disponible"}</strong>`;
            dataRows[4].innerHTML = `<span>Documento</span><strong>${ticket.comprador.documento || "No disponible"}</strong>`;
            dataRows[5].innerHTML = `<span>Código</span><strong>${ticket.codigo}</strong>`;
        }

        if (qrImage) {
            qrImage.src = ticket.qr_image;
            qrImage.alt = ticket.codigo;
        }

        if (visualCode) {
            visualCode.textContent = ticket.codigo;
        }

        if (miniInfo.length >= 3) {
            miniInfo[0].innerHTML = `<strong>Tipo:</strong> ${ticket.tipo.nombre || "General"}`;
            miniInfo[1].innerHTML = `<strong>Cantidad:</strong> 1`;
            miniInfo[2].innerHTML = `<strong>Valor:</strong> ${formatPrice(ticket.tipo.precio)}`;
        }

        if (modalQRImage) {
            modalQRImage.src = ticket.qr_image;
            modalQRImage.alt = ticket.codigo;
        }

        if (modalTitle) {
            modalTitle.textContent = ticket.evento.nombre || "Evento";
        }

        if (modalCode) {
            modalCode.textContent = ticket.codigo;
        }
    } catch (error) {
        console.error(error);
        alert(error.message);
        window.location.href = "mis-entradas.html";
    }
});