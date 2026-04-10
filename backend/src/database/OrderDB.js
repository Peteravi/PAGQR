const pool = require('../config/db');
const crypto = require('crypto');

class OrderDB {
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

    toIsoSafe(value) {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }

    safeJsonStringify(value) {
        try {
            return JSON.stringify(value ?? null);
        } catch (error) {
            return JSON.stringify({
                serialization_error: true,
                message: error.message
            });
        }
    }

    generateUniqueCode(prefix = 'ENT') {
        const now = Date.now().toString(36).toUpperCase();
        const rand = crypto.randomBytes(6).toString('hex').toUpperCase();
        return `${prefix}-${now}-${rand}`;
    }

    estaExpirada(ordenEntity) {
        if (!ordenEntity) return false;

        const estadoActual = this.normalizeLower(ordenEntity.estado);
        if (estadoActual !== 'pendiente') return false;

        if (!ordenEntity.fecha_expiracion) return false;

        const fechaExpiracion = new Date(ordenEntity.fecha_expiracion);
        if (Number.isNaN(fechaExpiracion.getTime())) return false;

        return fechaExpiracion.getTime() <= Date.now();
    }

    /**
     * Obtiene una orden por id_orden o codigo_orden
     * @param {number|string} orderIdentifier
     * @param {object|null} connection
     * @returns {Promise<object|null>}
     */
    async obtenerOrden(orderIdentifier, connection = null) {
        const executor = connection || pool;

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

        const [rows] = await executor.query(query, params);
        return rows.length > 0 ? rows[0] : null;
    }

    /**
     * Obtiene la orden por código y la bloquea en transacción
     * @param {string} codigoOrden
     * @param {object} connection
     * @returns {Promise<object|null>}
     */
    async obtenerOrdenPorCodigoForUpdate(codigoOrden, connection) {
        const [rows] = await connection.query(
            `
            SELECT *
            FROM ordenes
            WHERE codigo_orden = ?
            LIMIT 1
            FOR UPDATE
            `,
            [codigoOrden]
        );

        return rows.length > 0 ? rows[0] : null;
    }

    /**
     * Obtiene detalle de una orden
     * @param {number} idOrden
     * @param {object|null} connection
     * @returns {Promise<Array>}
     */
    async obtenerDetalleOrden(idOrden, connection = null) {
        const executor = connection || pool;

        const [rows] = await executor.query(
            `
            SELECT
                od.id_detalle,
                od.id_orden,
                od.id_tipo_entrada,
                od.cantidad,
                od.precio_unitario,
                te.id_evento,
                te.nombre AS nombre_tipo_entrada,
                te.precio AS precio_tipo_entrada,
                te.stock_disponible
            FROM orden_detalle od
            INNER JOIN tipos_entrada te ON te.id_tipo_entrada = od.id_tipo_entrada
            WHERE od.id_orden = ?
            ORDER BY od.id_detalle ASC
            `,
            [idOrden]
        );

        return rows;
    }

    /**
     * Verifica si ya existen entradas generadas para la orden
     * @param {number} idOrden
     * @param {object|null} connection
     * @returns {Promise<boolean>}
     */
    async ordenTieneEntradas(idOrden, connection = null) {
        const executor = connection || pool;

        const [rows] = await executor.query(
            `
            SELECT COUNT(*) AS total
            FROM entradas
            WHERE id_orden = ?
            `,
            [idOrden]
        );

        return Number(rows[0]?.total || 0) > 0;
    }

    /**
     * Marca orden como pagada
     * @param {number} idOrden
     * @param {object|null} connection
     * @param {string} metodoPago
     */
    async marcarOrdenComoPagada(idOrden, connection = null, metodoPago = 'Payphone') {
        const executor = connection || pool;

        await executor.query(
            `
            UPDATE ordenes
            SET
                estado = 'pagada',
                metodo_pago = ?,
                fecha_expiracion = NULL,
                fecha_actualizacion = NOW()
            WHERE id_orden = ?
            `,
            [metodoPago, idOrden]
        );
    }

    /**
     * Marca orden como fallida
     * @param {number} idOrden
     * @param {object|null} connection
     */
    async marcarOrdenComoFallida(idOrden, connection = null) {
        const executor = connection || pool;

        await executor.query(
            `
            UPDATE ordenes
            SET
                estado = 'fallida',
                fecha_actualizacion = NOW()
            WHERE id_orden = ?
            `,
            [idOrden]
        );
    }

    /**
     * Marca orden como expirada
     * @param {number} idOrden
     * @param {object|null} connection
     */
    async marcarOrdenComoExpirada(idOrden, connection = null) {
        const executor = connection || pool;

        await executor.query(
            `
            UPDATE ordenes
            SET
                estado = 'expirada',
                fecha_actualizacion = NOW()
            WHERE id_orden = ?
            `,
            [idOrden]
        );
    }

    /**
     * Obtiene órdenes pendientes ya vencidas
     * @param {number} limit
     * @param {object|null} connection
     * @returns {Promise<Array>}
     */
    async obtenerOrdenesPendientesExpiradas(limit = 100, connection = null) {
        const executor = connection || pool;
        const safeLimit = this.isPositiveInteger(limit) ? Number(limit) : 100;

        const [rows] = await executor.query(
            `
            SELECT *
            FROM ordenes
            WHERE estado = 'pendiente'
              AND fecha_expiracion IS NOT NULL
              AND fecha_expiracion <= NOW()
            ORDER BY fecha_expiracion ASC, id_orden ASC
            LIMIT ?
            `,
            [safeLimit]
        );

        return rows;
    }

    /**
     * Actualiza el último pago de la orden o crea uno nuevo
     * @param {object} data
     * @param {object|null} connection
     * @returns {Promise<number>} id_pago
     */
    async upsertPago(data, connection = null) {
        const executor = connection || pool;

        const {
            id_orden,
            proveedor_pago = 'Payphone',
            transaccion_id = null,
            referencia_pago = null,
            authorization_code = null,
            monto = 0,
            moneda = 'USD',
            estado = 'pendiente',
            respuesta_gateway = null,
            setFechaPago = false
        } = data || {};

        if (!this.isPositiveInteger(id_orden)) {
            throw new Error('id_orden inválido para upsertPago');
        }

        const [rows] = await executor.query(
            `
            SELECT id_pago
            FROM pagos
            WHERE id_orden = ?
            ORDER BY id_pago DESC
            LIMIT 1
            `,
            [id_orden]
        );

        const payloadRespuesta = typeof respuesta_gateway === 'string'
            ? respuesta_gateway
            : this.safeJsonStringify(respuesta_gateway);

        if (rows.length > 0) {
            const idPago = rows[0].id_pago;

            if (setFechaPago) {
                await executor.query(
                    `
                    UPDATE pagos
                    SET
                        proveedor_pago = ?,
                        transaccion_id = ?,
                        referencia_pago = ?,
                        authorization_code = ?,
                        monto = ?,
                        moneda = ?,
                        estado = ?,
                        respuesta_gateway = ?,
                        fecha_pago = NOW(),
                        fecha_actualizacion = NOW()
                    WHERE id_pago = ?
                    `,
                    [
                        proveedor_pago,
                        transaccion_id,
                        referencia_pago,
                        authorization_code,
                        monto,
                        moneda,
                        estado,
                        payloadRespuesta,
                        idPago
                    ]
                );
            } else {
                await executor.query(
                    `
                    UPDATE pagos
                    SET
                        proveedor_pago = ?,
                        transaccion_id = ?,
                        referencia_pago = ?,
                        authorization_code = ?,
                        monto = ?,
                        moneda = ?,
                        estado = ?,
                        respuesta_gateway = ?,
                        fecha_actualizacion = NOW()
                    WHERE id_pago = ?
                    `,
                    [
                        proveedor_pago,
                        transaccion_id,
                        referencia_pago,
                        authorization_code,
                        monto,
                        moneda,
                        estado,
                        payloadRespuesta,
                        idPago
                    ]
                );
            }

            return idPago;
        }

        const [result] = await executor.query(
            `
            INSERT INTO pagos (
                id_orden,
                proveedor_pago,
                transaccion_id,
                referencia_pago,
                authorization_code,
                monto,
                moneda,
                estado,
                respuesta_gateway,
                fecha_pago,
                fecha_creacion
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${setFechaPago ? 'NOW()' : 'NULL'}, NOW())
            `,
            [
                id_orden,
                proveedor_pago,
                transaccion_id,
                referencia_pago,
                authorization_code,
                monto,
                moneda,
                estado,
                payloadRespuesta
            ]
        );

        return result.insertId;
    }

    /**
     * Genera entradas reales para la orden.
     * No duplica si la orden ya tiene entradas.
     * @param {object} ordenEntity
     * @param {object|null} connection
     * @returns {Promise<{created:number, alreadyExisted:boolean}>}
     */
    async generarEntradasDeOrden(ordenEntity, connection = null) {
        const executor = connection || pool;

        if (!ordenEntity || !this.isPositiveInteger(ordenEntity.id_orden)) {
            throw new Error('Orden inválida para generar entradas');
        }

        const yaTieneEntradas = await this.ordenTieneEntradas(ordenEntity.id_orden, executor);
        if (yaTieneEntradas) {
            return {
                created: 0,
                alreadyExisted: true
            };
        }

        const [detalleRows] = await executor.query(
            `
            SELECT
                od.id_detalle,
                od.id_tipo_entrada,
                od.cantidad,
                te.id_evento,
                c.nombres,
                c.apellidos,
                c.email
            FROM orden_detalle od
            INNER JOIN ordenes o ON o.id_orden = od.id_orden
            INNER JOIN tipos_entrada te ON te.id_tipo_entrada = od.id_tipo_entrada
            INNER JOIN clientes c ON c.id_cliente = o.id_cliente
            WHERE od.id_orden = ?
            ORDER BY od.id_detalle ASC
            `,
            [ordenEntity.id_orden]
        );

        if (!detalleRows.length) {
            throw new Error(`La orden ${ordenEntity.codigo_orden} no tiene detalles para generar entradas`);
        }

        let created = 0;

        for (const detalle of detalleRows) {
            const cantidad = Number(detalle.cantidad || 0);

            if (!Number.isInteger(cantidad) || cantidad <= 0) {
                throw new Error(`Cantidad inválida en detalle de la orden ${ordenEntity.codigo_orden}`);
            }

            const nombreAsistente = this.normalizeString(
                `${detalle.nombres || ''} ${detalle.apellidos || ''}`
            ) || null;

            const emailAsistente = this.normalizeString(detalle.email) || null;

            for (let i = 0; i < cantidad; i += 1) {
                let inserted = false;
                let attempts = 0;

                while (!inserted && attempts < 5) {
                    attempts += 1;

                    const codigoEntrada = this.generateUniqueCode('ENT');
                    const codigoQr = this.generateUniqueCode('QR');

                    try {
                        await executor.query(
                            `
                            INSERT INTO entradas (
                                id_orden,
                                id_evento,
                                id_tipo_entrada,
                                codigo_entrada,
                                codigo_qr,
                                nombre_asistente,
                                email_asistente,
                                estado,
                                fecha_generacion
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'generada', NOW())
                            `,
                            [
                                ordenEntity.id_orden,
                                detalle.id_evento,
                                detalle.id_tipo_entrada,
                                codigoEntrada,
                                codigoQr,
                                nombreAsistente,
                                emailAsistente
                            ]
                        );

                        inserted = true;
                        created += 1;
                    } catch (error) {
                        const isDuplicate =
                            error &&
                            (error.code === 'ER_DUP_ENTRY' || error.errno === 1062);

                        if (!isDuplicate || attempts >= 5) {
                            throw error;
                        }
                    }
                }
            }
        }

        return {
            created,
            alreadyExisted: false
        };
    }

    /**
     * TICKET PAY-004: Cancela la orden y restaura el stock_disponible.
     * Corrige:
     * - validación de orden
     * - idempotencia para no restaurar dos veces
     * - actualización de pago a fallido/rechazado
     * - uso por id_orden o codigo_orden
     *
     * @param {Object} ordenEntity
     * @param {string} targetStatus
     */
    async cancelarOrdenYRestaurarStock(ordenEntity, targetStatus = 'fallida') {
        const connection = await pool.getConnection();

        try {
            if (!ordenEntity) {
                throw new Error('ordenEntity es requerido');
            }

            const codigoOrden = this.normalizeString(ordenEntity.codigo_orden);
            const idOrden = this.isPositiveInteger(ordenEntity.id_orden)
                ? Number(ordenEntity.id_orden)
                : null;

            if (!codigoOrden && !idOrden) {
                throw new Error('La orden no contiene id_orden ni codigo_orden válidos');
            }

            await connection.beginTransaction();

            let ordenActual = null;

            if (codigoOrden) {
                ordenActual = await this.obtenerOrdenPorCodigoForUpdate(codigoOrden, connection);
            } else {
                const [rows] = await connection.query(
                    `
                    SELECT *
                    FROM ordenes
                    WHERE id_orden = ?
                    LIMIT 1
                    FOR UPDATE
                    `,
                    [idOrden]
                );
                ordenActual = rows.length > 0 ? rows[0] : null;
            }

            if (!ordenActual) {
                throw new Error('No se encontró la orden a cancelar');
            }

            const estadoActual = this.normalizeLower(ordenActual.estado);

            if (estadoActual !== 'pendiente') {
                await connection.commit();
                console.log(
                    `ℹ️ [DB] La orden ${ordenActual.codigo_orden} no está pendiente (estado actual: ${ordenActual.estado}). No se restaura stock.`
                );
                return false;
            }

            const detalles = await this.obtenerDetalleOrden(ordenActual.id_orden, connection);

            for (const detalle of detalles) {
                const cantidad = Number(detalle.cantidad || 0);

                if (!Number.isInteger(cantidad) || cantidad <= 0) {
                    throw new Error(`Cantidad inválida en detalle de la orden ${ordenActual.codigo_orden}`);
                }

                await connection.query(
                    `
                    UPDATE tipos_entrada
                    SET stock_disponible = stock_disponible + ?
                    WHERE id_tipo_entrada = ?
                    `,
                    [cantidad, detalle.id_tipo_entrada]
                );
            }

            const normalizedTargetStatus = this.normalizeLower(targetStatus) === 'expirada'
                ? 'expirada'
                : 'fallida';

            if (normalizedTargetStatus === 'expirada') {
                await this.marcarOrdenComoExpirada(ordenActual.id_orden, connection);
            } else {
                await this.marcarOrdenComoFallida(ordenActual.id_orden, connection);
            }

            await this.upsertPago(
                {
                    id_orden: ordenActual.id_orden,
                    proveedor_pago: 'Payphone',
                    transaccion_id: ordenActual.codigo_orden,
                    monto: Number(ordenActual.total || 0),
                    moneda: 'USD',
                    estado: normalizedTargetStatus === 'expirada' ? 'anulado' : 'rechazado',
                    respuesta_gateway: {
                        message: normalizedTargetStatus === 'expirada'
                            ? 'Orden expirada. Stock restaurado automáticamente.'
                            : 'Pago no aprobado. Stock restaurado automáticamente.',
                        order_status: normalizedTargetStatus,
                        fecha_expiracion: this.toIsoSafe(ordenActual.fecha_expiracion)
                    },
                    setFechaPago: false
                },
                connection
            );
            await connection.commit();
            console.log(
                `✅ [DB] Stock restaurado correctamente para la orden ${ordenActual.codigo_orden} con estado ${normalizedTargetStatus}`
            );
            return true;

        } catch (error) {
            await connection.rollback();
            console.error(
                `🚨 [DB] Error al hacer rollback de la orden ${ordenEntity?.codigo_orden || ordenEntity?.id_orden || 'desconocida'}:`,
                error.message
            );
            throw error;
        } finally {
            connection.release();
        }
    }

    /**
     * Expira órdenes pendientes vencidas y restaura stock
     * @param {number} limit
     * @returns {Promise<{processed:number, expired:number, failed:number, orders:Array}>}
     */
    async expirarOrdenesPendientes(limit = 100) {
        const ordenes = await this.obtenerOrdenesPendientesExpiradas(limit);

        let expired = 0;
        let failed = 0;
        const processedOrders = [];

        for (const orden of ordenes) {
            try {
                const result = await this.cancelarOrdenYRestaurarStock(orden, 'expirada');

                if (result) {
                    expired += 1;
                    processedOrders.push({
                        id_orden: orden.id_orden,
                        codigo_orden: orden.codigo_orden,
                        fecha_expiracion: this.toIsoSafe(orden.fecha_expiracion),
                        status: 'expirada'
                    });
                } else {
                    processedOrders.push({
                        id_orden: orden.id_orden,
                        codigo_orden: orden.codigo_orden,
                        fecha_expiracion: this.toIsoSafe(orden.fecha_expiracion),
                        status: 'omitida'
                    });
                }
            } catch (error) {
                failed += 1;
                processedOrders.push({
                    id_orden: orden.id_orden,
                    codigo_orden: orden.codigo_orden,
                    fecha_expiracion: this.toIsoSafe(orden.fecha_expiracion),
                    status: 'error',
                    message: error.message
                });
            }
        }

        return {
            processed: ordenes.length,
            expired,
            failed,
            orders: processedOrders
        };
    }

    /**
     * Obtiene los datos de la orden y del cliente en un solo objeto
     * @param {string} codigoOrden
     */
    async obtenerDatosCompletosPorCodigo(codigoOrden) {
        const connection = await pool.getConnection();

        try {
            const [rows] = await connection.query(
                `
                SELECT
                    o.id_orden,
                    o.codigo_orden,
                    o.subtotal,
                    o.iva,
                    o.total,
                    o.estado,
                    o.fecha_expiracion,
                    c.nombres,
                    c.apellidos,
                    c.cedula_ruc,
                    c.email,
                    c.direccion
                FROM ordenes o
                INNER JOIN clientes c ON o.id_cliente = c.id_cliente
                WHERE o.codigo_orden = ?
                LIMIT 1
                `,
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