document.addEventListener("DOMContentLoaded", () => {
    const API_ENTRADAS = "/api/entradas";
    const STORAGE_KEYS = {
        currentTicket: "pagqr_current_ticket"
    };

    const emailInput = document.getElementById("correo");
    const docInput = document.getElementById("documento");
    const searchButton = document.querySelector(".button-group .btn-main");
    const resultHeaderCount = document.querySelector(".result-header span");
    const ticketsGrid = document.querySelector(".tickets-grid");
    const qrModal = document.getElementById("qrModal");

    function formatDateTime(value) {
        if (!value) return { fecha: "No disponible", hora: "No disponible" };
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

    function saveCurrentTicket(ticket) {
        localStorage.setItem(STORAGE_KEYS.currentTicket, JSON.stringify(ticket));
    }

    function updateResultCount(count) {
        if (resultHeaderCount) {
            resultHeaderCount.textContent = `${count} resultado${count !== 1 ? "s" : ""}`;
        }
    }

    function fillQRModal(ticket) {
        if (!qrModal || !ticket) return;

        const qrImage = qrModal.querySelector(".qr-container img");
        const title = qrModal.querySelector(".qr-modal-body h4");
        const code = qrModal.querySelector(".ticket-code");
        const ticketLink = qrModal.querySelector(".btn-main");

        if (qrImage) {
            qrImage.src = ticket.qr_image;
            qrImage.alt = ticket.codigo;
        }

        if (title) {
            title.textContent = ticket.evento.nombre;
        }

        if (code) {
            code.textContent = ticket.codigo;
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

        const { fecha, hora } = formatDateTime(ticket.evento.fecha_evento);
        const comprador = `${ticket.comprador.nombres || ""} ${ticket.comprador.apellidos || ""}`.trim();

        article.innerHTML = `
            <div class="ticket-top">
                <span class="badge-valid">${ticket.estado === "usada" ? "Usado" : "Válido"}</span>
                <span class="ticket-number">#${ticket.codigo}</span>
            </div>

            <h3>${ticket.evento.nombre || "Evento no disponible"}</h3>

            <div class="ticket-info">
                <p><strong>Fecha:</strong> ${fecha}</p>
                <p><strong>Hora:</strong> ${hora}</p>
                <p><strong>Lugar:</strong> ${ticket.evento.lugar || "No disponible"}</p>
                <p><strong>Comprador:</strong> ${comprador || "No disponible"}</p>
            </div>

            <div class="ticket-actions">
                <button class="btn-main btn-open-qr">Ver QR</button>
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

    function renderTickets(entradas) {
        if (!ticketsGrid) return;

        ticketsGrid.innerHTML = "";

        if (!entradas.length) {
            ticketsGrid.innerHTML = `
                <article class="ticket-card">
                    <h3>No se encontraron entradas</h3>
                    <div class="ticket-info">
                        <p>Intenta buscar con otro correo o documento.</p>
                    </div>
                </article>
            `;
            updateResultCount(0);
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
            alert("Ingresa un correo o un documento.");
            return;
        }

        try {
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

            renderTickets(data.entradas || []);
        } catch (error) {
            console.error(error);
            alert(error.message);
            renderTickets([]);
        } finally {
            searchButton.disabled = false;
            searchButton.textContent = "Buscar entradas";
        }
    }

    searchButton?.addEventListener("click", buscarEntradas);
});