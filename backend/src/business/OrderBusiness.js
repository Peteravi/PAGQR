const db = require('../config/db');
const OrderDB = require('../database/OrderDB');

class OrderBusiness {
    normalizeString(value) {
        return typeof value === 'string' ? value.trim() : '';
    }

    normalizeLower(value) {
        return this.normalizeString(value).toLowerCase();
    }

    isPositiveInteger(value) {
        const n = Number(value);
        return Number.isInteger(n) && n > 0;
    }

    /**
     * Busca una orden por:
     * - id_orden numérico
     * - codigo_orden string
     *
     * Esto evita depender de un método inexistente en OrderDB.
     */
    async obtenerOrdenSegura(orderIdentifier) {
        if (
            orderIdentifier === undefined ||
            orderIdentifier === null ||
            this.normalizeString(String(orderIdentifier)) === ''
        ) {
            return null;
        }

        let query = '';
        let params = [];

        if (this.isPositiveInteger(orderIdentifier)) {
            query = `
                SELECT *
                FROM ordenes
                WHERE id_orden = ?
                LIMIT 1
            `;
            params = [Number(orderIdentifier)];
        } else {
            query = `
                SELECT *
                FROM ordenes
                WHERE codigo_orden = ?
                LIMIT 1
            `;
            params = [this.normalizeString(String(orderIdentifier))];
        }

        const [rows] = await db.execute(query, params);
        return rows.length > 0 ? rows[0] : null;
    }

    /**
     * Verifica si una orden ya fue pagada o ya no está pendiente.
     * Sirve también para el flujo de pagos.js sin romper compatibilidad.
     */
    async checkIfOrderIsPaid(orderIdentifier) {
        try {
            const orden = await this.obtenerOrdenSegura(orderIdentifier);

            if (!orden) {
                return false;
            }

            const estadoOrden = this.normalizeLower(orden.estado);

            if (estadoOrden === 'pagada' || estadoOrden === 'aprobada') {
                return true;
            }

            const [pagoRows] = await db.execute(
                `
                SELECT estado
                FROM pagos
                WHERE id_orden = ?
                ORDER BY id_pago DESC
                LIMIT 1
                `,
                [orden.id_orden]
            );

            if (pagoRows.length === 0) {
                return false;
            }

            const estadoPago = this.normalizeLower(pagoRows[0].estado);

            return (
                estadoPago === 'aprobado' ||
                estadoPago === 'pagado' ||
                estadoPago === 'completed'
            );
        } catch (error) {
            console.error(`🚨 [Error checkIfOrderIsPaid] No se pudo verificar la orden ${orderIdentifier}:`, error.message);
            throw error;
        }
    }

    /**
     * Rollback cuando el pago falla o no es aprobado.
     * - Busca la orden de forma segura
     * - Solo restaura stock si la orden sigue en estado pendiente
     * - No rompe si la orden ya fue procesada antes
     */
    async handleFailedPayment(orderIdentifier) {
        try {
            const orden = await this.obtenerOrdenSegura(orderIdentifier);

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

            if (
                !OrderDB ||
                typeof OrderDB.cancelarOrdenYRestaurarStock !== 'function'
            ) {
                throw new Error('OrderDB.cancelarOrdenYRestaurarStock no está disponible');
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