const pool = require('../config/db');

class BillDB {
    /**
     * TICKET FAC-001: Guarda la factura en la BD usando la entidad
     * @param {Object} billEntity - Entidad con los datos fiscales calculados
     */
    async generarFactura(billEntity) {
        const connection = await pool.getConnection();
        try {
            const [existente] = await connection.query(
                `SELECT id_factura FROM facturas WHERE id_orden = ?`,
                [billEntity.id_orden]
            );

            if (existente.length > 0) {
                console.log(`⚠️ [DB] La orden ya tiene factura. Omitiendo duplicado.`);
                return existente[0].id_factura;
            }

            const [result] = await connection.query(
                `INSERT INTO facturas 
                (id_orden, numero_factura, razon_social, identificacion, direccion, email_facturacion, subtotal, iva, total) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    billEntity.id_orden,
                    billEntity.numero_factura,
                    billEntity.razon_social,
                    billEntity.identificacion,
                    billEntity.direccion,
                    billEntity.email_facturacion,
                    billEntity.subtotal,
                    billEntity.iva,
                    billEntity.total
                ]
            );

            return result.insertId;
        } catch (error) {
            console.error('🚨 [DB] Error al generar la factura en base de datos:', error.message);
            throw error;
        } finally {
            connection.release();
        }
    }

    async obtenerFacturaPorOrden(idOrden) {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query(
                `SELECT * FROM facturas WHERE id_orden = ?`,
                [idOrden]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('🚨 [DB] Error obteniendo la factura:', error.message);
            throw error;
        } finally {
            connection.release();
        }
    }
}

module.exports = new BillDB();