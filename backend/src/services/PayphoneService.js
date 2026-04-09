const axios = require('axios');

class PayphoneService {
    constructor() {
        this.token = process.env.PAYPHONE_TOKEN;
        this.appId = process.env.PAYPHONE_APP_ID;

        // Mantiene compatibilidad si frontend y backend están en el mismo dominio
        this.frontendUrl = (process.env.FRONTEND_URL || 'https://pagqr-production.up.railway.app').replace(/\/+$/, '');
        this.backendUrl = (process.env.BACKEND_URL || this.frontendUrl).replace(/\/+$/, '');

        this.prepareUrl = 'https://pay.payphonetodoesposible.com/api/button/Prepare';
        this.saleUrlBase = 'https://pay.payphonetodoesposible.com/api/Sale';
        this.legacyVerifyBase = 'https://pay.payphonetodoesposible.com/api/button/V2';
    }

    getAuthHeaders() {
        return {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json'
        };
    }

    buildResponseUrl() {
        // Ahora Payphone vuelve primero al backend para que el servidor procese
        // la confirmación y luego redirija al frontend.
        return `${this.backendUrl}/api/pagos/webhook`;
    }

    buildCancellationUrl() {
        return `${this.frontendUrl}/error-pago.html`;
    }

    /**
     * Prepara una transacción y obtiene las URLs de pago disponibles.
     * @param {Object} data
     * @param {number} data.amount - Monto en centavos (ej: 1500 = $15.00)
     * @param {string} data.orderId - Código único de la orden
     */
    async prepararBotonPago(data) {
        try {
            const payload = {
                appId: this.appId,
                amount: data.amount,
                amountWithoutTax: data.amount,
                tax: 0,
                amountWithTax: 0,
                currency: 'USD',
                clientTransactionId: data.orderId,
                responseUrl: this.buildResponseUrl(),
                cancellationUrl: this.buildCancellationUrl()
            };

            const response = await axios.post(this.prepareUrl, payload, {
                headers: this.getAuthHeaders()
            });

            console.log('✅ Payphone response completa:', JSON.stringify(response.data, null, 2));

            const {
                paymentUrl,
                payWithCard,
                payWithPayPhone
            } = response.data || {};

            if (!paymentUrl && !payWithCard && !payWithPayPhone) {
                throw new Error(`Payphone no devolvió métodos de pago válidos: ${JSON.stringify(response.data)}`);
            }

            return {
                paymentUrl: paymentUrl || null,
                payWithCard: payWithCard || null,
                payWithPayPhone: payWithPayPhone || null
            };
        } catch (error) {
            const chismeReal = error.response && error.response.data
                ? JSON.stringify(error.response.data)
                : error.message;

            console.error('❌ Error al conectar con Payphone:', chismeReal);
            throw new Error(`Motivo del rechazo: ${chismeReal}`);
        }
    }

    /**
     * Verifica el estado real de la transacción en Payphone.
     * Usa primero el endpoint actual /api/Sale/{transactionId}
     * y si falla, intenta el endpoint legado para no romper compatibilidad.
     * @param {string|number} transactionId
     */
    async verificarPago(transactionId) {
        const normalizedId = String(transactionId || '').trim();

        if (!normalizedId) {
            throw new Error('transactionId inválido para verificar pago');
        }

        const currentUrl = `${this.saleUrlBase}/${encodeURIComponent(normalizedId)}`;
        const legacyUrl = `${this.legacyVerifyBase}/${encodeURIComponent(normalizedId)}`;

        try {
            const response = await axios.get(currentUrl, {
                headers: {
                    Authorization: `Bearer ${this.token}`
                }
            });

            return response.data;
        } catch (error) {
            const status = Number(error?.response?.status || 0);
            const payload = error?.response?.data;

            console.warn(
                `⚠️ Error verificando en endpoint actual de Payphone (${currentUrl}). ` +
                `Status: ${status || 'N/A'}. Intentando fallback legado...`,
                payload || error.message
            );

            try {
                const legacyResponse = await axios.get(legacyUrl, {
                    headers: {
                        Authorization: `Bearer ${this.token}`
                    }
                });

                return legacyResponse.data;
            } catch (legacyError) {
                const chismeReal = legacyError.response && legacyError.response.data
                    ? JSON.stringify(legacyError.response.data)
                    : legacyError.message;

                console.error('❌ [Seguridad] Error verificando transacción en Payphone:', chismeReal);
                throw new Error('No se pudo verificar la autenticidad del pago');
            }
        }
    }
}

module.exports = new PayphoneService();