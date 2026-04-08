const axios = require('axios');

class PayphoneService {
    constructor() {
        this.token = process.env.PAYPHONE_TOKEN;
        this.appId = process.env.PAYPHONE_APP_ID;
        this.frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

        this.apiUrl = 'https://pay.payphonetodoesposible.com/api/button/Prepare';
    }

    /**
     * Prepara una transacción y obtiene la URL para el botón de pago.
     * @param {Object} data - Datos de la compra
     * @param {number} data.amount - Monto total en centavos (ej: 1500 para $15.00)
     * @param {string} data.orderId - Tu código de orden (para ligarlo a tu DB)
     */
    async prepararBotonPago(data) {
        try {
            const payload = {
                appId: this.appId,
                amount: data.amount,
                amountWithoutTax: data.amount,
                amountWithTax: 0,
                tax: 0,
                currency: "USD",
                clientTransactionId: data.orderId,
                responseUrl: `${this.frontendUrl}/exito-pago.html`,
                cancellationUrl: `${this.frontendUrl}/error-pago.html`
            };

            const response = await axios.post(this.apiUrl, payload, {
                headers: {
                    'Authorization': 'Bearer ' + this.token,
                    'Content-Type': 'application/json'
                }
            });

            console.log('✅ Payphone preparó el pago exitosamente:', response.data);

            // 🚀 MAGIA: Cubrimos todas las posibilidades de Payphone
            if (response.data.paymentUrl) {
                return response.data.paymentUrl;
            } else if (response.data.paymentId) {
                // Si nos da el ID, armamos nosotros la URL de cobro oficial
                return `https://pay.payphonetodoesposible.com/pay?id=${response.data.paymentId}`;
            } else {
                // Si Payphone cambia el formato, mostramos el chisme completo
                throw new Error(`Respuesta sin URL: ${JSON.stringify(response.data)}`);
            }

        } catch (error) {
            const chismeReal = error.response && error.response.data
                ? JSON.stringify(error.response.data)
                : error.message;

            console.error('❌ Error al conectar con Payphone:', chismeReal);
            throw new Error(`Motivo del rechazo: ${chismeReal}`);
        }
    }
    async verificarPago(transactionId) {
        try {
            // URL para consultar el estado real de la transacción
            const verifyUrl = `https://pay.payphonetodoesposible.com/api/button/V2/${transactionId}`;

            const response = await axios.get(verifyUrl, {
                headers: {
                    'Authorization': 'Bearer ' + this.token
                }
            });

            // Retornamos la respuesta real de Payphone
            return response.data;
        } catch (error) {
            console.error('❌ [Seguridad] Error verificando transacción en Payphone:', error.message);
            throw new Error('No se pudo verificar la autenticidad del pago');
        }
    }
}

module.exports = new PayphoneService();