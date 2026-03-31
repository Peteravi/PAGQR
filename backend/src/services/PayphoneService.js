const axios = require('axios');

class PayphoneService {
    constructor() {
        // Tomamos las llaves de tu .env de forma segura
        this.token = process.env.PAYPHONE_TOKEN;
        this.appId = process.env.PAYPHONE_APP_ID;
        this.webhookUrl = process.env.PAYPHONE_WEBHOOK_URL;
        
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
                
                // ¡AQUÍ ESTÁ EL CAMBIO! 100% idénticas a lo que dice el portal
                responseUrl: 'http://localhost:3000',
                cancellationUrl: 'http://localhost:3000'
            };

            // 2. Hacemos la llamada HTTP segura usando Axios
            const response = await axios.post(this.apiUrl, payload, {
                headers: {
                    'Authorization': 'Bearer ' + this.token,
                    'Content-Type': 'application/json'
                }
            });

            console.log('✅ Payphone preparó el pago exitosamente:', response.data);
            
            // Retornamos la URL que Payphone nos generó para redirigir al cliente
            return response.data.payUrl;

        } catch (error) {
            console.error('❌ Error al conectar con Payphone:', error.response ? error.response.data : error.message);
            throw new Error('No se pudo generar el link de pago');
        }
    }
}

module.exports = new PayphoneService();