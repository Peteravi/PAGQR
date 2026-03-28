document.addEventListener("DOMContentLoaded", () => {
    const STORAGE_KEYS = {
        purchases: "pagqr_purchases",
        currentTicket: "pagqr_current_ticket"
    };

    function safeParseJSON(key, fallback = []) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (error) {
            console.error(`Error leyendo localStorage: ${key}`, error);
            return fallback;
        }
    }

    const allPurchases = safeParseJSON(STORAGE_KEYS.purchases, []);

    const emailInput = document.getElementById("correo");
    const docInput = document.getElementById("documento");
    const searchButton = document.querySelector(".button-group .btn-main");

    const resultHeaderCount = document.querySelector(".result-header span");
    const ticketsGrid = document.querySelector(".tickets-grid");
    const qrModal = document.getElementById("qrModal");

    function saveCurrentTicket(purchase) {
        try {
            localStorage.setItem(STORAGE_KEYS.currentTicket, JSON.stringify(purchase));
        } catch (error) {
            console.error("Error guardando ticket actual", error);
        }
    }

    function updateResultCount(count) {
        if (resultHeaderCount) {
            resultHeaderCount.textContent = `${count} resultado${count !== 1 ? "s" : ""}`;
        }
    }

    function createTicketCard(purchase) {
        const article = document.createElement("article");
        article.className = "ticket-card";

        article.innerHTML = `
      <div class="ticket-top">
        <span class="badge-valid">${purchase.estadoPago === "Pagado" ? "Válido" : "Pendiente"}</span>
        <span class="ticket-number">#${purchase.ticket?.codigo || "SIN-CODIGO"}</span>
      </div>

      <h3>${purchase.evento?.nombre || "Evento no disponible"}</h3>

      <div class="ticket-info">
        <p><strong>Fecha:</strong> ${purchase.evento?.fecha || "No disponible"}</p>
        <p><strong>Hora:</strong> ${purchase.evento?.hora || "No disponible"}</p>
        <p><strong>Lugar:</strong> ${purchase.evento?.lugarCompleto || "No disponible"}</p>
        <p><strong>Comprador:</strong> ${(purchase.comprador?.nombres || "")} ${(purchase.comprador?.apellidos || "")}</p>
      </div>

      <div class="ticket-actions">
        <button class="btn-main btn-open-qr">Ver QR</button>
        <a href="ticket.html" class="btn-secondary-custom btn-open-ticket">Ver ticket</a>
      </div>
    `;

        const qrButton = article.querySelector(".btn-open-qr");
        const ticketLink = article.querySelector(".btn-open-ticket");

        qrButton?.addEventListener("click", () => {
            saveCurrentTicket(purchase);
            fillQRModal(purchase);

            if (qrModal && window.bootstrap) {
                const modalInstance = bootstrap.Modal.getOrCreateInstance(qrModal);
                modalInstance.show();
            }
        });

        ticketLink?.addEventListener("click", () => {
            saveCurrentTicket(purchase);
        });

        return article;
    }

    function fillQRModal(purchase) {
        if (!qrModal || !purchase) return;

        const qrImage = qrModal.querySelector(".qr-container img");
        const title = qrModal.querySelector(".qr-modal-body h4");
        const code = qrModal.querySelector(".ticket-code");
        const ticketLink = qrModal.querySelector(".btn-main");

        if (qrImage) {
            qrImage.src = purchase.ticket?.qr || "assets/img/qr-demo.png";
            qrImage.alt = purchase.ticket?.codigo || "QR ticket";
        }

        if (title) {
            title.textContent = purchase.evento?.nombre || "Evento";
        }

        if (code) {
            code.textContent = purchase.ticket?.codigo || "Sin código";
        }

        if (ticketLink) {
            ticketLink.onclick = () => {
                saveCurrentTicket(purchase);
                window.location.href = "ticket.html";
            };
        }
    }

    function renderTickets(purchases) {
        if (!ticketsGrid) return;

        ticketsGrid.innerHTML = "";

        if (!purchases.length) {
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

        purchases.forEach((purchase) => {
            ticketsGrid.appendChild(createTicketCard(purchase));
        });

        updateResultCount(purchases.length);
    }

    function filterPurchases() {
        const email = (emailInput?.value || "").trim().toLowerCase();
        const documentValue = (docInput?.value || "").trim().toLowerCase();

        if (!email && !documentValue) {
            renderTickets(allPurchases);
            return;
        }

        const filtered = allPurchases.filter((purchase) => {
            const purchaseEmail = (purchase.comprador?.email || "").toLowerCase();
            const purchaseDoc = (purchase.comprador?.documento || "").toLowerCase();

            const matchEmail = !email || purchaseEmail.includes(email);
            const matchDoc = !documentValue || purchaseDoc.includes(documentValue);

            return matchEmail && matchDoc;
        });

        renderTickets(filtered);
    }

    searchButton?.addEventListener("click", filterPurchases);
    emailInput?.addEventListener("input", filterPurchases);
    docInput?.addEventListener("input", filterPurchases);

    renderTickets(allPurchases);

    const qrModal2 = document.getElementById("qrModal2");
    if (qrModal2) {
        qrModal2.remove();
    }
});