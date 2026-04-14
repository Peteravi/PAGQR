const axios = require('axios');

class PayphoneService {
    constructor() {
        this.defaultToken = process.env.PAYPHONE_TOKEN;
        this.defaultAppId = process.env.PAYPHONE_APP_ID;
        this.frontendUrl = process.env.FRONTEND_URL || 'https://pagqr-production.up.railway.app';

        this.apiUrl = 'https://pay.payphonetodoesposible.com/api/button/Prepare';
    }

    /**
     * Prepara una transacción y obtiene las URLs de pago disponibles.
     * @param {Object} data
     * @param {Object} credenciales - Opcional { appId, token }
     */
    async prepararBotonPago(data, credenciales = null) {
        const appIdToUse = credenciales?.appId || this.defaultAppId;
        const tokenToUse = credenciales?.token || this.defaultToken;

        try {
            const payload = {
                appId: appIdToUse,
                amount: data.amount,
                amountWithoutTax: data.amount,
                tax: 0,
                amountWithTax: 0,
                currency: "USD",
                clientTransactionId: data.orderId,
                responseUrl: `${this.frontendUrl}/api/pagos/webhook`,
                cancellationUrl: `${this.frontendUrl}/api/pagos/webhook`
            };

            const response = await axios.post(this.apiUrl, payload, {
                headers: {
                    'Authorization': 'Bearer ' + tokenToUse,
                    'Content-Type': 'application/json'
                }
            });

            console.log('✅ Payphone prepare exitoso con token terminado en:', tokenToUse.slice(-6));

            const {
                paymentUrl,
                payWithCard,
                payWithPayPhone
            } = response.data;

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
     * Verifica el estado real de la transacción en Payphone
     * @param {string|number} transactionId
     * @param {string} clientTxId
     * @param {Object} credenciales - Opcional { appId, token }
     */
    async verificarPago(transactionId, clientTxId = "", credenciales = null) {
        const tokenToUse = credenciales?.token || this.defaultToken;

        try {
            const verifyUrl = 'https://pay.payphonetodoesposible.com/api/button/V2/Confirm';

            const payload = {
                id: Number(transactionId),
                clientTxId: String(clientTxId || "")
            };

            const response = await axios.post(verifyUrl, payload, {
                headers: {
                    'Authorization': 'Bearer ' + tokenToUse,
                    'Content-Type': 'application/json'
                }
            });

            return response.data;

        } catch (error) {
            const chismeReal = error.response && error.response.data
                ? JSON.stringify(error.response.data)
                : error.message;

            console.error('❌ [Seguridad] Error verificando transacción en Payphone:', chismeReal);
            throw new Error('No se pudo verificar la autenticidad del pago: ' + chismeReal);
        }
    }
}

module.exports = new PayphoneService();