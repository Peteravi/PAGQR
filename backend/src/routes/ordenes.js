const express = require('express');
const QRCode = require('qrcode');
const router = express.Router();
const db = require('../config/db');

const ORDER_EXPIRATION_MINUTES = (() => {
    const raw = Number(process.env.ORDER_EXPIRATION_MINUTES);
    return Number.isInteger(raw) && raw > 0 ? raw : 15;
})();

function generarCodigoOrden() {
    return `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function toIsoSafe(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isPositiveInteger(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0;
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function isValidEmail(email) {
    if (!isNonEmptyString(email)) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
}

function roundToTwo(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeLower(value) {
    return normalizeString(value).toLowerCase();
}

function addMinutesSafe(value, minutes) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setMinutes(date.getMinutes() + minutes);
    return date.toISOString();
}

// =========================
// CREAR ORDEN
// =========================
router.post('/', async (req, res) => {
    let connection;

    try {
        connection = await db.getConnection();

        const {
            cliente,
            items,
            subtotal,
            iva,
            total
        } = req.body || {};

        if (!cliente || typeof cliente !== 'object') {
            return res.status(400).json({
                ok: false,
                message: 'Faltan los datos del cliente'
            });
        }

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                ok: false,
                message: 'Debes enviar al menos un item en la orden'
            });
        }

        const nombres = (cliente.nombres || '').trim();
        const apellidos = (cliente.apellidos || '').trim();
        const email = (cliente.email || '').trim().toLowerCase();
        const telefono = (cliente.telefono || '').trim();
        const cedula_ruc = (cliente.cedula_ruc || cliente.documento || '').trim();
        const direccion = (cliente.direccion || '').trim();

        if (!nombres || !apellidos || !email) {
            return res.status(400).json({
                ok: false,
                message: 'Cliente incompleto: nombres, apellidos y email son obligatorios'
            });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({
                ok: false,
                message: 'El email del cliente no es válido'
            });
        }

        if (nombres.length > 100 || apellidos.length > 100 || email.length > 150) {
            return res.status(400).json({
                ok: false,
                message: 'Uno o más campos del cliente exceden la longitud permitida'
            });
        }

        if (telefono.length > 30 || cedula_ruc.length > 30 || direccion.length > 255) {
            return res.status(400).json({
                ok: false,
                message: 'Uno o más datos del cliente exceden la longitud permitida'
            });
        }

        await connection.beginTransaction();

        // Buscar cliente por email
        let id_cliente;
        const [clienteRows] = await connection.execute(
            `SELECT id_cliente
             FROM clientes
             WHERE email = ?
             LIMIT 1`,
            [email]
        );

        if (clienteRows.length > 0) {
            id_cliente = clienteRows[0].id_cliente;

            await connection.execute(
                `UPDATE clientes
                 SET nombres = ?, apellidos = ?, telefono = ?, cedula_ruc = ?, direccion = ?
                 WHERE id_cliente = ?`,
                [nombres, apellidos, telefono, cedula_ruc, direccion, id_cliente]
            );
        } else {
            const [clienteInsert] = await connection.execute(
                `INSERT INTO clientes (nombres, apellidos, email, telefono, cedula_ruc, direccion)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [nombres, apellidos, email, telefono, cedula_ruc, direccion]
            );

            id_cliente = clienteInsert.insertId;
        }

        // Validar items y stock
        let subtotalCalculado = 0;
        const itemsValidados = [];

        for (const item of items) {
            if (!item || typeof item !== 'object') {
                await connection.rollback();
                return res.status(400).json({
                    ok: false,
                    message: 'Item inválido en la orden'
                });
            }

            const id_tipo_entrada = toNumber(item.id_tipo_entrada);
            const cantidad = toNumber(item.cantidad);

            if (!isPositiveInteger(id_tipo_entrada) || !isPositiveInteger(cantidad)) {
                await connection.rollback();
                return res.status(400).json({
                    ok: false,
                    message: 'Cada item debe tener id_tipo_entrada y cantidad válidos'
                });
            }

            const [tipoRows] = await connection.execute(
                `SELECT id_tipo_entrada, id_evento, nombre, precio, stock_disponible
                 FROM tipos_entrada
                 WHERE id_tipo_entrada = ?
                 FOR UPDATE`,
                [id_tipo_entrada]
            );

            if (tipoRows.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    ok: false,
                    message: `Tipo de entrada no encontrado: ${id_tipo_entrada}`
                });
            }

            const tipo = tipoRows[0];
            const stockDisponible = toNumber(tipo.stock_disponible);
            const precio_unitario = toNumber(tipo.precio);

            if (!Number.isFinite(precio_unitario) || precio_unitario < 0) {
                await connection.rollback();
                return res.status(400).json({
                    ok: false,
                    message: `El precio del tipo de entrada "${tipo.nombre}" es inválido`
                });
            }

            if (stockDisponible < cantidad) {
                await connection.rollback();
                return res.status(409).json({
                    ok: false,
                    message: `Stock insuficiente para "${tipo.nombre}"`
                });
            }

            const subtotal_item = roundToTwo(precio_unitario * cantidad);
            subtotalCalculado = roundToTwo(subtotalCalculado + subtotal_item);

            itemsValidados.push({
                id_tipo_entrada,
                id_evento: tipo.id_evento,
                cantidad,
                precio_unitario,
                subtotal_item
            });
        }

        const subtotalBody = subtotal !== undefined ? toNumber(subtotal, NaN) : undefined;
        const ivaBody = iva !== undefined ? toNumber(iva, NaN) : undefined;
        const totalBody = total !== undefined ? toNumber(total, NaN) : undefined;

        if (subtotal !== undefined && (!Number.isFinite(subtotalBody) || subtotalBody < 0)) {
            await connection.rollback();
            return res.status(400).json({
                ok: false,
                message: 'El subtotal enviado es inválido'
            });
        }

        if (iva !== undefined && (!Number.isFinite(ivaBody) || ivaBody < 0)) {
            await connection.rollback();
            return res.status(400).json({
                ok: false,
                message: 'El IVA enviado es inválido'
            });
        }

        if (total !== undefined && (!Number.isFinite(totalBody) || totalBody < 0)) {
            await connection.rollback();
            return res.status(400).json({
                ok: false,
                message: 'El total enviado es inválido'
            });
        }

        const subtotalFinal = subtotal !== undefined ? roundToTwo(subtotalBody) : roundToTwo(subtotalCalculado);
        const ivaFinal = iva !== undefined ? roundToTwo(ivaBody) : 0;
        const totalFinal = total !== undefined ? roundToTwo(totalBody) : roundToTwo(subtotalFinal + ivaFinal);

        if (subtotalFinal < 0 || ivaFinal < 0 || totalFinal < 0) {
            await connection.rollback();
            return res.status(400).json({
                ok: false,
                message: 'Los valores monetarios de la orden son inválidos'
            });
        }

        if (subtotalFinal === 0 && itemsValidados.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                ok: false,
                message: 'El subtotal calculado de la orden no es válido'
            });
        }

        const totalEsperado = roundToTwo(subtotalFinal + ivaFinal);
        if (Math.abs(totalEsperado - totalFinal) > 0.01) {
            await connection.rollback();
            return res.status(400).json({
                ok: false,
                message: 'El total no coincide con subtotal + IVA'
            });
        }

        const codigo_orden = generarCodigoOrden();

        const [ordenInsert] = await connection.execute(
            `INSERT INTO ordenes (
                id_cliente,
                codigo_orden,
                subtotal,
                iva,
                total,
                estado,
                fecha_creacion,
                fecha_actualizacion,
                fecha_expiracion
            )
             VALUES (?, ?, ?, ?, ?, 'pendiente', NOW(), NOW(), DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
            [id_cliente, codigo_orden, subtotalFinal, ivaFinal, totalFinal, ORDER_EXPIRATION_MINUTES]
        );

        const id_orden = ordenInsert.insertId;
        const fechaExpiracion = addMinutesSafe(new Date(), ORDER_EXPIRATION_MINUTES);

        for (const item of itemsValidados) {
            await connection.execute(
                `INSERT INTO orden_detalle (id_orden, id_tipo_entrada, cantidad, precio_unitario, subtotal)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    id_orden,
                    item.id_tipo_entrada,
                    item.cantidad,
                    item.precio_unitario,
                    item.subtotal_item
                ]
            );

            await connection.execute(
                `UPDATE tipos_entrada
                 SET stock_disponible = stock_disponible - ?
                 WHERE id_tipo_entrada = ?`,
                [item.cantidad, item.id_tipo_entrada]
            );
        }

        await connection.commit();

        return res.status(201).json({
            ok: true,
            message: 'Orden creada correctamente',
            orden: {
                id_orden,
                codigo_orden,
                estado: 'pendiente',
                subtotal: subtotalFinal,
                iva: ivaFinal,
                total: totalFinal,
                fecha_expiracion: fechaExpiracion,
                minutos_expiracion: ORDER_EXPIRATION_MINUTES,
                cliente: {
                    id_cliente,
                    nombres,
                    apellidos,
                    email,
                    telefono,
                    cedula_ruc,
                    direccion
                }
            }
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('❌ Error en rollback al crear orden:', rollbackError);
            }
        }

        console.error('❌ Error creando orden:', error);

        return res.status(500).json({
            ok: false,
            message: 'Error interno al crear la orden'
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// =========================
// OBTENER ENTRADAS DE UNA ORDEN
// IMPORTANTE: ESTA RUTA VA ANTES DE "/:id"
// =========================
router.get('/:id/entradas', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                ok: false,
                message: 'El id de la orden es inválido'
            });
        }

        const [ordenRows] = await db.execute(
            `
            SELECT
                o.id_orden,
                o.codigo_orden,
                o.total,
                o.estado,
                o.fecha_creacion,
                o.fecha_actualizacion,
                o.fecha_expiracion,
                c.nombres,
                c.apellidos,
                c.email,
                c.telefono,
                c.cedula_ruc,
                c.direccion
            FROM ordenes o
            INNER JOIN clientes c ON c.id_cliente = o.id_cliente
            WHERE o.id_orden = ?
            LIMIT 1
            `,
            [id]
        );

        if (!ordenRows.length) {
            return res.status(404).json({
                ok: false,
                message: 'Orden no encontrada'
            });
        }

        const orden = ordenRows[0];
        const estadoOrden = normalizeLower(orden.estado);

        const [pagoRows] = await db.execute(
            `
            SELECT
                id_pago,
                proveedor_pago,
                transaccion_id,
                referencia_pago,
                authorization_code,
                monto,
                moneda,
                estado,
                fecha_pago,
                fecha_creacion,
                fecha_actualizacion
            FROM pagos
            WHERE id_orden = ?
            ORDER BY id_pago DESC
            LIMIT 1
            `,
            [id]
        );

        const pago = pagoRows.length ? pagoRows[0] : null;
        const estadoPago = normalizeLower(pago?.estado);

        const [rows] = await db.execute(
            `
            SELECT
                en.id_entrada,
                en.codigo_entrada,
                en.codigo_qr,
                en.estado AS estado_entrada,
                en.fecha_generacion,
                en.fecha_uso,

                e.id_evento,
                e.titulo,
                e.fecha_evento,
                e.lugar,
                e.direccion AS evento_direccion,
                e.ciudad,
                e.imagen_url,

                te.id_tipo_entrada,
                te.nombre AS tipo_nombre,
                te.precio AS precio_tipo,

                od.precio_unitario
            FROM entradas en
            INNER JOIN eventos e ON e.id_evento = en.id_evento
            INNER JOIN tipos_entrada te ON te.id_tipo_entrada = en.id_tipo_entrada
            LEFT JOIN orden_detalle od
                ON od.id_orden = en.id_orden
               AND od.id_tipo_entrada = en.id_tipo_entrada
            WHERE en.id_orden = ?
            ORDER BY en.id_entrada ASC
            `,
            [id]
        );

        const entradas = await Promise.all(
            rows.map(async (row) => {
                const qrValue = row.codigo_qr || row.codigo_entrada || '';
                let qr_image = null;

                if (qrValue) {
                    qr_image = await QRCode.toDataURL(qrValue, {
                        width: 320,
                        margin: 1
                    });
                }

                return {
                    id_entrada: row.id_entrada,
                    codigo: row.codigo_entrada,
                    qr_text: qrValue,
                    qr_image,
                    estado: row.estado_entrada,
                    fecha_generacion: toIsoSafe(row.fecha_generacion),
                    fecha_uso: toIsoSafe(row.fecha_uso),
                    evento: {
                        id_evento: row.id_evento,
                        nombre: row.titulo,
                        fecha_evento: toIsoSafe(row.fecha_evento),
                        lugar: row.lugar,
                        direccion: row.evento_direccion,
                        ciudad: row.ciudad,
                        imagen_url: row.imagen_url
                    },
                    tipo: {
                        id_tipo_entrada: row.id_tipo_entrada,
                        nombre: row.tipo_nombre,
                        precio: toNumber(row.precio_unitario, toNumber(row.precio_tipo))
                    }
                };
            })
        );

        const esperandoGeneracion =
            entradas.length === 0 &&
            (
                estadoOrden === 'pagada' ||
                estadoOrden === 'aprobada' ||
                estadoPago === 'aprobado' ||
                estadoPago === 'pagado' ||
                estadoPago === 'completed'
            );

        const pagoPendiente =
            entradas.length === 0 &&
            (
                estadoOrden === 'pendiente' ||
                estadoPago === 'pendiente' ||
                estadoPago === 'iniciado'
            );

        const pagoFallido =
            entradas.length === 0 &&
            (
                estadoOrden === 'fallida' ||
                estadoOrden === 'cancelada' ||
                estadoOrden === 'expirada' ||
                estadoPago === 'rechazado' ||
                estadoPago === 'anulado'
            );

        return res.json({
            ok: true,
            orden: {
                id_orden: orden.id_orden,
                codigo_orden: orden.codigo_orden,
                total: toNumber(orden.total),
                estado: orden.estado,
                fecha_creacion: toIsoSafe(orden.fecha_creacion),
                fecha_actualizacion: toIsoSafe(orden.fecha_actualizacion),
                fecha_expiracion: toIsoSafe(orden.fecha_expiracion),
                comprador: {
                    nombres: orden.nombres,
                    apellidos: orden.apellidos,
                    email: orden.email,
                    telefono: orden.telefono,
                    documento: orden.cedula_ruc,
                    direccion: orden.direccion
                }
            },
            pago: pago
                ? {
                    id_pago: pago.id_pago,
                    proveedor_pago: pago.proveedor_pago,
                    transaccion_id: pago.transaccion_id,
                    referencia_pago: pago.referencia_pago,
                    authorization_code: pago.authorization_code,
                    monto: toNumber(pago.monto),
                    moneda: pago.moneda,
                    estado: pago.estado,
                    fecha_pago: toIsoSafe(pago.fecha_pago),
                    fecha_creacion: toIsoSafe(pago.fecha_creacion),
                    fecha_actualizacion: toIsoSafe(pago.fecha_actualizacion)
                }
                : null,
            estado_consulta: {
                entradas_generadas: entradas.length > 0,
                total_entradas: entradas.length,
                esperando_generacion: esperandoGeneracion,
                pago_pendiente: pagoPendiente,
                pago_fallido: pagoFallido
            },
            message: esperandoGeneracion
                ? 'Pago confirmado, generando entradas...'
                : pagoPendiente
                    ? 'La orden todavía está pendiente de confirmación de pago'
                    : pagoFallido
                        ? 'La orden no fue aprobada y no tiene entradas generadas'
                        : entradas.length > 0
                            ? 'Entradas obtenidas correctamente'
                            : 'La orden no tiene entradas generadas',
            entradas
        });
    } catch (error) {
        console.error('❌ Error obteniendo entradas de la orden:', error);
        return res.status(500).json({
            ok: false,
            message: 'Error interno al obtener las entradas de la orden'
        });
    }
});

// =========================
// OBTENER ORDEN POR ID
// =========================
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                ok: false,
                message: 'El id de la orden es inválido'
            });
        }

        const [ordenRows] = await db.execute(
            `
            SELECT
                o.id_orden,
                o.codigo_orden,
                o.subtotal,
                o.iva,
                o.total,
                o.estado,
                o.fecha_creacion,
                o.fecha_actualizacion,
                o.fecha_expiracion,
                c.id_cliente,
                c.nombres,
                c.apellidos,
                c.email,
                c.telefono,
                c.cedula_ruc,
                c.direccion
            FROM ordenes o
            INNER JOIN clientes c ON c.id_cliente = o.id_cliente
            WHERE o.id_orden = ?
            LIMIT 1
            `,
            [id]
        );

        if (!ordenRows.length) {
            return res.status(404).json({
                ok: false,
                message: 'Orden no encontrada'
            });
        }

        const orden = ordenRows[0];

        const [detalleRows] = await db.execute(
            `
            SELECT
                od.id_detalle,
                od.id_tipo_entrada,
                od.cantidad,
                od.precio_unitario,
                od.subtotal,
                te.nombre AS tipo_entrada,
                te.id_evento,
                e.titulo AS evento
            FROM orden_detalle od
            INNER JOIN tipos_entrada te ON te.id_tipo_entrada = od.id_tipo_entrada
            INNER JOIN eventos e ON e.id_evento = te.id_evento
            WHERE od.id_orden = ?
            ORDER BY od.id_detalle ASC
            `,
            [id]
        );

        return res.json({
            ok: true,
            orden: {
                id_orden: orden.id_orden,
                codigo_orden: orden.codigo_orden,
                subtotal: toNumber(orden.subtotal),
                iva: toNumber(orden.iva),
                total: toNumber(orden.total),
                estado: orden.estado,
                fecha_creacion: toIsoSafe(orden.fecha_creacion),
                fecha_actualizacion: toIsoSafe(orden.fecha_actualizacion),
                fecha_expiracion: toIsoSafe(orden.fecha_expiracion),
                cliente: {
                    id_cliente: orden.id_cliente,
                    nombres: orden.nombres,
                    apellidos: orden.apellidos,
                    email: orden.email,
                    telefono: orden.telefono,
                    documento: orden.cedula_ruc,
                    direccion: orden.direccion
                },
                detalle: detalleRows.map((row) => ({
                    id_detalle: row.id_detalle,
                    id_tipo_entrada: row.id_tipo_entrada,
                    tipo_entrada: row.tipo_entrada,
                    id_evento: row.id_evento,
                    evento: row.evento,
                    cantidad: toNumber(row.cantidad),
                    precio_unitario: toNumber(row.precio_unitario),
                    subtotal: toNumber(row.subtotal)
                }))
            }
        });
    } catch (error) {
        console.error('❌ Error obteniendo orden:', error);
        return res.status(500).json({
            ok: false,
            message: 'Error interno al obtener la orden'
        });
    }
});

module.exports = router;