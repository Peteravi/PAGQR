const OrderDB = require('../database/OrderDB');

class OrderBusiness {
    async handleFailedPayment(orderId) {
        try {
            const orden = await OrderDB.obtenerOrden(orderId);

            if (!orden || orden.estado !== 'PENDIENTE') {
                return;
            }

            await OrderDB.cancelarOrdenYRestaurarStock(orden);
            console.log(`✅ [Rollback Exitoso] Stock devuelto para el evento de la orden ${orderId}`);

        } catch (error) {
            console.error(`🚨 [Error Crítico Rollback] No se pudo restaurar stock para orden ${orderId}:`, error.message);
        }
    }
}
module.exports = new OrderBusiness();