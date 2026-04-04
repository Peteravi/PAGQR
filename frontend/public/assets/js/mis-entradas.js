document.addEventListener("DOMContentLoaded", () => {
    const API_ENTRADAS = "/api/entradas";
    const STORAGE_KEYS = {
        currentTicket: "pagqr_current_ticket"
    };

    const emailInput = document.getElementById("correo");
    const docInput = document.getElementById("documento");
    const searchButton = document.getElementById("btnBuscarEntradas");
    const resultHeaderCount = document.getElementById("resultCount");
    const ticketsGrid = document.getElementById("ticketsGrid");
    const searchMessage = document.getElementById("searchMessage");
    const qrModal = document.getElementById("qrModal");

    function formatDateTime(value) {
        if (!value) {
            return {
                fecha: "No disponible",
                hora: "No disponible"
            };
        }

        const date = new Date(value);

        return {
            fecha: date.toLocaleDateString("es-EC", {
                day: "2-digit",
                month: "long",
                year: "numeric"
            }),
            hora: date.toLocaleTimeString("es-EC", {
                hour: "2-digit",
                minute: "2-digit"
            })
        };
    }

    function getBadgeText(estado) {
        switch (estado) {
            case "usada":
                return "Usado";
            case "cancelada":
                return "Cancelado";
            case "enviada":
            case "generada":
            default:
                return "Válido";
        }
    }

    function getBadgeClass(estado) {
        switch (estado) {
            case "usada":
                return "badge-used";
            case "cancelada":
                return "badge-cancelled";
            case "enviada":
            case "generada":
            default:
                return "badge-valid";
        }
    }

    function saveCurrentTicket(ticket) {
        localStorage.setItem(STORAGE_KEYS.currentTicket, JSON.stringify(ticket));
    }

    function updateResultCount(count) {
        if (resultHeaderCount) {
            resultHeaderCount.textContent = `${count} resultado${count !== 1 ? "s" : ""}`;
        }
    }

    function setMessage(message = "", type = "info") {
        if (!searchMessage) return;

        searchMessage.textContent = message;
        searchMessage.className = `search-message ${type}`;

        if (!message) {
            searchMessage.classList.add("d-none");
        } else {
            searchMessage.classList.remove("d-none");
        }
    }

    function fillQRModal(ticket) {
        if (!qrModal || !ticket) return;

        const qrImage = qrModal.querySelector(".qr-container img");
        const title = qrModal.querySelector(".qr-modal-body h4");
        const code = qrModal.querySelector(".ticket-code");
        const ticketLink = qrModal.querySelector(".btn-open-full-ticket");

        if (qrImage) {
            qrImage.src = ticket.qr_image;
            qrImage.alt = ticket.codigo;
        }

        if (title) {
            title.textContent = ticket.evento?.nombre || "Evento";
        }

        if (code) {
            code.textContent = ticket.codigo || "";
        }

        if (ticketLink) {
            ticketLink.onclick = () => {
                saveCurrentTicket(ticket);
                window.location.href = `ticket.html?codigo=${encodeURIComponent(ticket.codigo)}`;
            };
        }
    }

    function createTicketCard(ticket) {
        const article = document.createElement("article");
        article.className = "ticket-card";

        const { fecha, hora } = formatDateTime(ticket.evento?.fecha_evento);
        const comprador = `${ticket.comprador?.nombres || ""} ${ticket.comprador?.apellidos || ""}`.trim();
        const badgeText = getBadgeText(ticket.estado);
        const badgeClass = getBadgeClass(ticket.estado);

        article.innerHTML = `
            <div class="ticket-top">
                <span class="${badgeClass}">${badgeText}</span>
                <span class="ticket-number">#${ticket.codigo}</span>
            </div>

            <h3>${ticket.evento?.nombre || "Evento no disponible"}</h3>

            <div class="ticket-info">
                <p><strong>Fecha:</strong> ${fecha}</p>
                <p><strong>Hora:</strong> ${hora}</p>
                <p><strong>Lugar:</strong> ${ticket.evento?.lugar || "No disponible"}</p>
                <p><strong>Tipo:</strong> ${ticket.tipo?.nombre || "No disponible"}</p>
                <p><strong>Comprador:</strong> ${comprador || "No disponible"}</p>
            </div>

            <div class="ticket-actions">
                <button type="button" class="btn-main btn-open-qr">Ver QR</button>
                <a href="ticket.html?codigo=${encodeURIComponent(ticket.codigo)}" class="btn-secondary-custom btn-open-ticket">Ver ticket</a>
            </div>
        `;

        article.querySelector(".btn-open-qr")?.addEventListener("click", () => {
            saveCurrentTicket(ticket);
            fillQRModal(ticket);

            if (qrModal && window.bootstrap) {
                bootstrap.Modal.getOrCreateInstance(qrModal).show();
            }
        });

        article.querySelector(".btn-open-ticket")?.addEventListener("click", () => {
            saveCurrentTicket(ticket);
        });

        return article;
    }

    function renderEmptyState(message) {
        if (!ticketsGrid) return;

        ticketsGrid.innerHTML = `
            <article class="ticket-card">
                <h3>Sin resultados</h3>
                <div class="ticket-info">
                    <p>${message}</p>
                </div>
            </article>
        `;

        updateResultCount(0);
    }

    function renderTickets(entradas) {
        if (!ticketsGrid) return;

        ticketsGrid.innerHTML = "";

        if (!Array.isArray(entradas) || !entradas.length) {
            renderEmptyState("No se encontraron entradas con los datos ingresados.");
            return;
        }

        entradas.forEach((ticket) => {
            ticketsGrid.appendChild(createTicketCard(ticket));
        });

        updateResultCount(entradas.length);
    }

    async function buscarEntradas() {
        const email = (emailInput?.value || "").trim();
        const documento = (docInput?.value || "").trim();

        if (!email && !documento) {
            setMessage("Ingresa tu correo o tu cédula/RUC para consultar tus entradas.", "warning");
            renderEmptyState("Ingresa un correo o documento para realizar la búsqueda.");
            return;
        }

        try {
            setMessage("", "info");
            searchButton.disabled = true;
            searchButton.textContent = "Buscando...";

            const params = new URLSearchParams();
            if (email) params.append("email", email);
            if (documento) params.append("documento", documento);

            const response = await fetch(`${API_ENTRADAS}?${params.toString()}`);
            const data = await response.json();

            if (!response.ok || !data.ok) {
                throw new Error(data.message || "No se pudieron obtener las entradas");
            }

            if (!data.entradas?.length) {
                setMessage("No encontramos entradas con esos datos.", "warning");
            } else {
                setMessage(`Se encontraron ${data.entradas.length} entrada(s).`, "success");
            }

            renderTickets(data.entradas || []);
        } catch (error) {
            console.error(error);
            setMessage(error.message || "Ocurrió un error al consultar las entradas.", "error");
            renderEmptyState("Ocurrió un error al consultar las entradas.");
        } finally {
            searchButton.disabled = false;
            searchButton.textContent = "Buscar entradas";
        }
    }

    searchButton?.addEventListener("click", buscarEntradas);

    [emailInput, docInput].forEach((input) => {
        input?.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                buscarEntradas();
            }
        });
    });

    updateResultCount(0);
    ticketsGrid.innerHTML = `
        <article class="ticket-card">
            <h3>Consulta tus entradas</h3>
            <div class="ticket-info">
                <p>Ingresa tu correo electrónico o tu cédula/RUC para ver los tickets asociados a tu compra.</p>
            </div>
        </article>
    `;
});