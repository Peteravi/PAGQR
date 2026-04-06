const pool = require('../config/db');

class OrderDB {
    /**
     * TICKET PAY-004: Cancela la orden y restaura el stock_disponible.
     * @param {Object} ordenEntity - Entidad de la orden (debe contener la propiedad 'codigo_orden')
     */
    async cancelarOrdenYRestaurarStock(ordenEntity) {
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const [detalles] = await connection.query(
                `SELECT od.id_tipo_entrada, od.cantidad 
                 FROM orden_detalle od
                 INNER JOIN ordenes o ON o.id_orden = od.id_orden
                 WHERE o.codigo_orden = ?`,
                [ordenEntity.codigo_orden]
            );

            for (const detalle of detalles) {
                await connection.query(
                    `UPDATE tipos_entrada 
                     SET stock_disponible = stock_disponible + ? 
                     WHERE id_tipo_entrada = ?`,
                    [detalle.cantidad, detalle.id_tipo_entrada]
                );
            }

            await connection.query(
                `UPDATE ordenes 
                 SET estado = 'fallida' 
                 WHERE codigo_orden = ?`,
                [ordenEntity.codigo_orden]
            );

            await connection.commit();
            console.log(`✅ [DB] Stock restaurado correctamente para la orden ${ordenEntity.codigo_orden}`);

        } catch (error) {
            await connection.rollback();
            console.error(`🚨 [DB] Error al hacer rollback de la orden ${ordenEntity.codigo_orden}:`, error.message);
            throw error;
        } finally {
            connection.release();
        }
    }
    /**
     * Obtiene los datos de la orden y del cliente en un solo objeto
     * @param {string} codigoOrden - El código único de la orden
     */
    async obtenerDatosCompletosPorCodigo(codigoOrden) {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query(
                `SELECT 
                    o.id_orden, o.codigo_orden, o.subtotal, o.iva, o.total,
                    c.nombres, c.apellidos, c.cedula_ruc, c.email, c.direccion
                 FROM ordenes o
                 INNER JOIN clientes c ON o.id_cliente = c.id_cliente
                 WHERE o.codigo_orden = ?`,
                [codigoOrden]
            );

            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error(`🚨 [DB] Error obteniendo datos completos para factura:`, error.message);
            throw error;
        } finally {
            connection.release();
        }
    }
}

module.exports = new OrderDB();