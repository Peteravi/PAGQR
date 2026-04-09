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

    function normalizeString(value) {
        return typeof value === "string" ? value.trim() : "";
    }

    function normalizeLower(value) {
        return normalizeString(value).toLowerCase();
    }

    function formatDateTime(value) {
        if (!value) {
            return {
                fecha: "No disponible",
                hora: "No disponible"
            };
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return {
                fecha: "No disponible",
                hora: "No disponible"
            };
        }

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
        const estadoNormalizado = normalizeLower(estado);

        switch (estadoNormalizado) {
            case "usada":
                return "Usado";
            case "cancelada":
                return "Cancelado";
            case "generada":
            case "enviada":
            case "activa":
            case "vigente":
            default:
                return "Válido";
        }
    }

    function getBadgeClass(estado) {
        const estadoNormalizado = normalizeLower(estado);

        switch (estadoNormalizado) {
            case "usada":
                return "badge-used";
            case "cancelada":
                return "badge-cancelled";
            case "generada":
            case "enviada":
            case "activa":
            case "vigente":
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

    function getTicketCode(ticket) {
        return ticket?.codigo || ticket?.codigo_entrada || "SIN-CODIGO";
    }

    function getTicketQrImage(ticket) {
        return ticket?.qr_image || null;
    }

    function getBuyerFullName(ticket) {
        const nombres = ticket?.comprador?.nombres || "";
        const apellidos = ticket?.comprador?.apellidos || "";
        return `${nombres} ${apellidos}`.trim();
    }

    function getEventName(ticket) {
        return ticket?.evento?.nombre || ticket?.evento?.titulo || "Evento no disponible";
    }

    function getEventLocation(ticket) {
        return ticket?.evento?.lugar || ticket?.evento?.direccion || "No disponible";
    }

    function getTicketTypeName(ticket) {
        return ticket?.tipo?.nombre || "No disponible";
    }

    function fillQRModal(ticket) {
        if (!qrModal || !ticket) return;

        const qrImage = qrModal.querySelector(".qr-container img");
        const title = qrModal.querySelector(".qr-modal-body h4");
        const code = qrModal.querySelector(".ticket-code");
        const ticketLink = qrModal.querySelector(".btn-open-full-ticket");

        const codigo = getTicketCode(ticket);
        const qrSrc = getTicketQrImage(ticket);

        if (qrImage) {
            if (qrSrc) {
                qrImage.src = qrSrc;
                qrImage.alt = codigo;
                qrImage.style.display = "";
            } else {
                qrImage.removeAttribute("src");
                qrImage.alt = codigo;
                qrImage.style.display = "none";
            }
        }

        if (title) {
            title.textContent = getEventName(ticket);
        }

        if (code) {
            code.textContent = codigo;
        }

        if (ticketLink) {
            ticketLink.onclick = () => {
                saveCurrentTicket(ticket);
                window.location.href = `ticket.html?codigo=${encodeURIComponent(codigo)}`;
            };
        }
    }

    function createTicketCard(ticket) {
        const article = document.createElement("article");
        article.className = "ticket-card";

        const { fecha, hora } = formatDateTime(ticket?.evento?.fecha_evento);
        const comprador = getBuyerFullName(ticket);
        const codigo = getTicketCode(ticket);
        const badgeText = getBadgeText(ticket?.estado);
        const badgeClass = getBadgeClass(ticket?.estado);

        article.innerHTML = `
            <div class="ticket-top">
                <span class="${badgeClass}">${badgeText}</span>
                <span class="ticket-number">#${codigo}</span>
            </div>

            <h3>${getEventName(ticket)}</h3>

            <div class="ticket-info">
                <p><strong>Fecha:</strong> ${fecha}</p>
                <p><strong>Hora:</strong> ${hora}</p>
                <p><strong>Lugar:</strong> ${getEventLocation(ticket)}</p>
                <p><strong>Tipo:</strong> ${getTicketTypeName(ticket)}</p>
                <p><strong>Comprador:</strong> ${comprador || "No disponible"}</p>
            </div>

            <div class="ticket-actions">
                <button type="button" class="btn-main btn-open-qr">Ver QR</button>
                <a href="ticket.html?codigo=${encodeURIComponent(codigo)}" class="btn-secondary-custom btn-open-ticket">Ver ticket</a>
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
        const email = normalizeString(emailInput?.value);
        const documento = normalizeString(docInput?.value);

        if (!email && !documento) {
            setMessage("Ingresa tu correo o tu cédula/RUC para consultar tus entradas.", "warning");
            renderEmptyState("Ingresa un correo o documento para realizar la búsqueda.");
            return;
        }

        try {
            setMessage("", "info");

            if (searchButton) {
                searchButton.disabled = true;
                searchButton.textContent = "Buscando...";
            }

            const params = new URLSearchParams();
            if (email) params.append("email", email);
            if (documento) params.append("documento", documento);

            const response = await fetch(`${API_ENTRADAS}?${params.toString()}`, {
                cache: "no-store"
            });

            const data = await response.json();

            if (!response.ok || !data.ok) {
                throw new Error(data.message || "No se pudieron obtener las entradas");
            }

            const entradas = Array.isArray(data.entradas) ? data.entradas : [];

            if (!entradas.length) {
                setMessage("No encontramos entradas con esos datos.", "warning");
            } else {
                setMessage(`Se encontraron ${entradas.length} entrada(s).`, "success");
            }

            renderTickets(entradas);
        } catch (error) {
            console.error(error);
            setMessage(error.message || "Ocurrió un error al consultar las entradas.", "error");
            renderEmptyState("Ocurrió un error al consultar las entradas.");
        } finally {
            if (searchButton) {
                searchButton.disabled = false;
                searchButton.textContent = "Buscar entradas";
            }
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

    if (ticketsGrid) {
        ticketsGrid.innerHTML = `
            <article class="ticket-card">
                <h3>Consulta tus entradas</h3>
                <div class="ticket-info">
                    <p>Ingresa tu correo electrónico o tu cédula/RUC para ver los tickets asociados a tu compra.</p>
                </div>
            </article>
        `;
    }
});