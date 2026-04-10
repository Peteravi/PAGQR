document.addEventListener("DOMContentLoaded", async () => {
    const STORAGE_KEYS = {
        lastPurchase: "pagqr_last_purchase"
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

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "No disponible";

        return date.toLocaleDateString("es-EC", {
            day: "2-digit",
            month: "long",
            year: "numeric"
        });
    }

    function formatTime(value) {
        if (!value) return "No disponible";

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "No disponible";

        return date.toLocaleTimeString("es-EC", {
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function formatPrice(value) {
        return `$${Number(value || 0).toFixed(2)}`;
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

        if (estadoOrden === "fallida") return "Fallida";
        if (estadoOrden === "pendiente") return "Pendiente";
        if (estadoOrden === "pagada" || estadoOrden === "aprobada") return "Pagada";

        if (estadoPago === "rechazado" || estadoPago === "anulado" || estadoPago === "failed") return "Fallida";
        if (estadoPago === "pendiente" || estadoPago === "iniciado") return "Pendiente";
        if (estadoPago === "aprobado" || estadoPago === "pagado" || estadoPago === "completed") return "Pagada";

        return ordenEstado || pagoEstado || "No confirmado";
    }

    function getReasonText(reason, backendMessage) {
        const normalizedReason = normalizeLower(reason);

        if (backendMessage) return backendMessage;

        switch (normalizedReason) {
            case "parametros_invalidos":
                return "No se pudo validar la transacción porque faltan parámetros de retorno.";
            case "orden_no_encontrada":
                return "No se pudo localizar la orden asociada al pago.";
            case "pago_no_aprobado":
                return "La pasarela indicó que el pago no fue aprobado y no se generaron entradas.";
            case "error_interno":
                return "Ocurrió un problema interno al verificar la transacción.";
            default:
                return "Tu pago no fue confirmado. Esto puede deberse a una cancelación, fondos insuficientes o un problema temporal con la pasarela.";
        }
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value;
        }
    }

    function buildFallbackData(purchase, query) {
        return {
            orden: {
                id_orden: purchase?.id_orden || null,
                codigo_orden: purchase?.codigo_orden || query.get("orden") || "No disponible",
                estado: "fallida",
                total: Number(purchase?.total || 0),
                comprador: {
                    nombres: purchase?.comprador?.nombres || "",
                    apellidos: purchase?.comprador?.apellidos || "",
                    email: purchase?.comprador?.email || "",
                    telefono: purchase?.comprador?.telefono || "",
                    documento: purchase?.comprador?.documento || ""
                }
            },
            pago: {
                estado: query.get("reason") === "pago_no_aprobado" ? "rechazado" : "pendiente",
                proveedor_pago: "PayPhone",
                transactionId: query.get("tx") || purchase?.payment?.transactionId || ""
            },
            entradas: [],
            estado_consulta: {
                pago_fallido: true,
                pago_pendiente: false,
                esperando_generacion: false,
                total_entradas: Number(purchase?.cantidad || 0)
            },
            message: query.get("msg") || "",
            fallback: {
                evento: {
                    nombre: purchase?.evento?.titulo || "No disponible"
                },
                tipoEntrada: {
                    nombre: purchase?.tipoEntrada?.nombre || "No disponible",
                    precio: Number(purchase?.tipoEntrada?.precio || 0)
                },
                cantidad: Number(purchase?.cantidad || 0)
            }
        };
    }

    function renderErrorState(data, query) {
        const orden = data?.orden || {};
        const pago = data?.pago || {};
        const comprador = orden?.comprador || {};
        const fallback = data?.fallback || {};
        const entradas = Array.isArray(data?.entradas) ? data.entradas : [];
        const ticket = entradas[0] || null;

        const fullName = `${comprador.nombres || ""} ${comprador.apellidos || ""}`.trim() || "No disponible";
        const eventoNombre =
            ticket?.evento?.nombre ||
            fallback?.evento?.nombre ||
            "No disponible";

        const fechaEvento = ticket?.evento?.fecha_evento || null;
        const lugarEvento = ticket?.evento?.lugar || "No disponible";
        const totalEntradas = entradas.length > 0
            ? entradas.length
            : Number(data?.estado_consulta?.total_entradas || fallback?.cantidad || 0);

        const precioUnitario = ticket?.tipo?.precio ?? fallback?.tipoEntrada?.precio ?? 0;
        const totalOrden = Number(orden?.total || 0);
        const friendlyStatus = getFriendlyStatusText(orden?.estado, pago?.estado);
        const reasonText = getReasonText(query.get("reason"), data?.message);

        const heroMessage = document.getElementById("heroMessage");
        if (heroMessage) {
            heroMessage.textContent = reasonText;
        }

        setText("codigoOrdenHero", orden?.codigo_orden || query.get("orden") || "No disponible");
        setText("estadoPrincipalHero", friendlyStatus);

        setText("detalleEvento", eventoNombre);
        setText("detalleFecha", formatDate(fechaEvento));
        setText("detalleHora", formatTime(fechaEvento));
        setText("detalleLugar", lugarEvento);
        setText(
            "detalleCantidad",
            `${totalEntradas} entrada${totalEntradas === 1 ? "" : "s"}`
        );

        setText("detalleNombre", fullName);
        setText("detalleCorreo", comprador?.email || "No disponible");
        setText("detalleTelefono", comprador?.telefono || "No disponible");
        setText("detalleDocumento", comprador?.documento || "No disponible");
        setText("detalleTotal", formatPrice(totalOrden));

        setText("resumenEvento", eventoNombre);
        setText("resumenCantidad", String(totalEntradas));
        setText("resumenPrecio", formatPrice(precioUnitario));
        setText("resumenMetodo", pago?.proveedor_pago || "PayPhone");
        setText("resumenEstado", friendlyStatus);
        setText("resumenTotal", formatPrice(totalOrden));

        setText("reintentoEvento", eventoNombre);
        setText("reintentoTotal", formatPrice(totalOrden));
        setText("helpReasonNote", `Motivo detectado: ${reasonText}`);

        const resumeStatus = document.getElementById("resumenEstado");
        if (resumeStatus) {
            resumeStatus.classList.add("danger-text");
        }

        const reintentoTexto = document.getElementById("reintentoTexto");
        if (reintentoTexto) {
            reintentoTexto.textContent = orden?.codigo_orden
                ? `La orden ${orden.codigo_orden} no pudo completarse. Puedes volver al inicio y realizar nuevamente el proceso de compra.`
                : "Podrás volver al proceso de compra y realizar nuevamente el pago de tu entrada.";
        }
    }

    async function loadOrderData(idOrden) {
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
            throw new Error(data?.message || "No se pudo consultar la orden.");
        }

        return data;
    }

    const purchase = getLastPurchase();
    const query = new URLSearchParams(window.location.search);

    try {
        let data = null;

        if (purchase?.id_orden) {
            try {
                const apiData = await loadOrderData(purchase.id_orden);

                data = {
                    ...apiData,
                    fallback: {
                        evento: {
                            nombre: purchase?.evento?.titulo || "No disponible"
                        },
                        tipoEntrada: {
                            nombre: purchase?.tipoEntrada?.nombre || "No disponible",
                            precio: Number(purchase?.tipoEntrada?.precio || 0)
                        },
                        cantidad: Number(purchase?.cantidad || 0)
                    }
                };
            } catch (error) {
                console.warn("No se pudo obtener la orden desde API, se usará fallback local:", error.message);
            }
        }

        if (!data) {
            data = buildFallbackData(purchase, query);
        }

        renderErrorState(data, query);
    } catch (error) {
        console.error("Error cargando pantalla de pago fallido:", error);

        const fallbackData = buildFallbackData(purchase, query);
        renderErrorState(fallbackData, query);
    }
});