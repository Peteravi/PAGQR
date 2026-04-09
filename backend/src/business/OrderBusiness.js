const OrderDB = require('../database/OrderDB');

class OrderBusiness {
    normalizeString(value) {
        return typeof value === 'string' ? value.trim() : '';
    }

    normalizeLower(value) {
        return this.normalizeString(value).toLowerCase();
    }

    /**
     * Verifica si una orden ya fue pagada.
     */
    async checkIfOrderIsPaid(orderIdentifier) {
        try {
            const orden = await OrderDB.obtenerOrden(orderIdentifier);

            if (!orden) {
                return false;
            }

            const estadoOrden = this.normalizeLower(orden.estado);

            return estadoOrden === 'pagada' || estadoOrden === 'aprobada';

        } catch (error) {
            console.error(`🚨 [Error checkIfOrderIsPaid] No se pudo verificar la orden ${orderIdentifier}:`, error.message);
            throw error;
        }
    }

    /**
     * Rollback cuando el pago falla o no es aprobado.
     * Solo restaura stock si la orden sigue en estado pendiente.
     */
    async handleFailedPayment(orderIdentifier) {
        try {
            const orden = await OrderDB.obtenerOrden(orderIdentifier);

            if (!orden) {
                console.warn(`⚠️ [Rollback] No se encontró la orden ${orderIdentifier}.`);
                return false;
            }

            const estadoOrden = this.normalizeLower(orden.estado);

            if (estadoOrden !== 'pendiente') {
                console.log(
                    `ℹ️ [Rollback] La orden ${orden.codigo_orden || orden.id_orden} no está pendiente (estado actual: ${orden.estado}). No se restaura stock.`
                );
                return false;
            }

            await OrderDB.cancelarOrdenYRestaurarStock(orden);

            console.log(
                `✅ [Rollback Exitoso] Stock restaurado para la orden ${orden.codigo_orden || orden.id_orden}`
            );

            return true;
        } catch (error) {
            console.error(
                `🚨 [Error Crítico Rollback] No se pudo restaurar stock para orden ${orderIdentifier}:`,
                error.message
            );
            return false;
        }
    }
}

module.exports = new OrderBusiness();