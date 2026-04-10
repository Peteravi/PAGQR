const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const db = require('../config/db');
const PayphoneService = require('../services/PayphoneService');
const OrderBusiness = require('../business/OrderBusiness');
const OrderDB = require('../database/OrderDB');
const BillBusiness = require('../business/BillBusiness');

/**
 * Helpers locales
 * No afectan otras rutas ni otros archivos.
 */
function isPositiveInteger(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0;
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeLower(value) {
    return normalizeString(value).toLowerCase();
}

function safeJsonStringify(value) {
    try {
        return JSON.stringify(value ?? null);
    } catch (error) {
        return JSON.stringify({
            serialization_error: true,
            message: error.message
        });
    }
}

function getPayloadValue(payload, ...keys) {
    if (!payload || typeof payload !== 'object') return '';

    for (const key of keys) {
        const value = payload[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            return String(value).trim();
        }
    }

    return '';
}

function getTransactionIdFromPayload(payload) {
    return getPayloadValue(
        payload,
        'id',
        'transactionId',
        'transactionID',
        'Id',
        'TransactionId',
        'TransactionID'
    );
}

function getClientTransactionIdFromPayload(payload) {
    return getPayloadValue(
        payload,
        'clientTransactionId',
        'clientTransactionID',
        'ClientTransactionId',
        'ClientTransactionID'
    );
}

function isApprovedTransaction(pagoReal) {
    if (!pagoReal || typeof pagoReal !== 'object') return false;

    const transactionStatus = String(
        pagoReal.transactionStatus ||
        pagoReal.status ||
        pagoReal.transaction_state ||
        ''
    ).trim().toLowerCase();

    const statusCode = Number(
        pagoReal.statusCode ??
        pagoReal.status_code ??
        pagoReal.code
    );

    return transactionStatus === 'approved' || statusCode === 3;
}

function mapGatewayStatusToPagoEstado(pagoReal) {
    const status = normalizeLower(
        pagoReal?.transactionStatus ||
        pagoReal?.status ||
        pagoReal?.transaction_state ||
        ''
    );

    const statusCode = Number(
        pagoReal?.statusCode ??
        pagoReal?.status_code ??
        pagoReal?.code
    );

    if (status === 'approved' || statusCode === 3) return 'aprobado';
    if (status === 'pending') return 'pendiente';
    if (status === 'canceled' || status === 'cancelled' || status === 'voided') return 'anulado';
    if (status === 'refunded') return 'reembolsado';

    return 'rechazado';
}

function generateUniqueCode(prefix = 'ENT') {
    const now = Date.now().toString(36).toUpperCase();
    const rand = crypto.randomBytes(6).toString('hex').toUpperCase();
    return `${prefix}-${now}-${rand}`;
}

async function checkIfOrderIsPaidSafe(codigoOrden) {
    if (!isNonEmptyString(codigoOrden)) return false;

    try {
        if (
            OrderBusiness &&
            typeof OrderBusiness.checkIfOrderIsPaid === 'function'
        ) {
            return await OrderBusiness.checkIfOrderIsPaid(codigoOrden);
        }

        const [rows] = await db.execute(
            `
            SELECT
                o.estado AS estado_orden,
                (
                    SELECT COUNT(*)
                    FROM entradas en
                    WHERE en.id_orden = o.id_orden
                ) AS total_entradas,
                p.estado AS estado_pago
            FROM ordenes o
            LEFT JOIN pagos p ON p.id_orden = o.id_orden
            WHERE o.codigo_orden = ?
            ORDER BY p.id_pago DESC
            LIMIT 1
            `,
            [codigoOrden]
        );

        if (rows.length === 0) return false;

        const estadoOrden = normalizeLower(rows[0].estado_orden);
        const estadoPago = normalizeLower(rows[0].estado_pago);
        const totalEntradas = Number(rows[0].total_entradas || 0);

        return (
            estadoOrden === 'pagada' ||
            estadoOrden === 'aprobada' ||
            estadoPago === 'aprobado' ||
            estadoPago === 'pagado' ||
            estadoPago === 'completed' ||
            totalEntradas > 0
        );
    } catch (error) {
        console.error('❌ Error verificando si la orden ya fue pagada:', error.message);
        throw error;
    }
}

/**
 * Obtiene la referencia de autorización desde Payphone sin romper si cambia el nombre del campo.
 */
function getAuthorizationCodeFromGateway(pagoReal) {
    return normalizeString(
        pagoReal?.authorizationCode ||
        pagoReal?.authorization_code ||
        pagoReal?.authorization ||
        pagoReal?.authCode ||
        pagoReal?.cardAuthorizationCode ||
        ''
    ) || null;
}

/**
 * Obtiene una referencia útil del gateway sin depender de un solo nombre de campo.
 */
function getGatewayReference(pagoReal, fallbackClientTransactionId) {
    return normalizeString(
        pagoReal?.clientTransactionId ||
        pagoReal?.clientTransactionID ||
        pagoReal?.reference ||
        pagoReal?.referenceCode ||
        pagoReal?.transactionId ||
        pagoReal?.transactionID ||
        fallbackClientTransactionId ||
        ''
    ) || null;
}

function getFrontendBaseUrl() {
    return (process.env.FRONTEND_URL || 'https://pagqr-production.up.railway.app').replace(/\/+$/, '');
}

function buildFrontendRedirectUrl(pathname, params = {}) {
    const url = new URL(`${getFrontendBaseUrl()}${pathname.startsWith('/') ? pathname : `/${pathname}`}`);

    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            url.searchParams.set(key, String(value).trim());
        }
    }

    return url.toString();
}

/**
 * Inserta entradas reales de la orden.
 * No duplica si ya existen entradas para la orden.
 */
async function createEntriesForOrder(connection, orderRow) {
    if (!orderRow || !isPositiveInteger(orderRow.id_orden)) {
        throw new Error('Orden inválida para generar entradas');
    }

    const [existingEntriesRows] = await connection.execute(
        `
        SELECT COUNT(*) AS total
        FROM entradas
        WHERE id_orden = ?
        `,
        [orderRow.id_orden]
    );

    const existingEntries = Number(existingEntriesRows[0]?.total || 0);
    if (existingEntries > 0) {
        return {
            created: 0,
            alreadyExisted: true
        };
    }

    const [detalleRows] = await connection.execute(
        `
        SELECT
            od.id_detalle,
            od.id_tipo_entrada,
            od.cantidad,
            od.precio_unitario,
            te.id_evento,
            te.nombre AS nombre_tipo,
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
        [orderRow.id_orden]
    );

    if (!detalleRows.length) {
        throw new Error(`La orden ${orderRow.codigo_orden} no tiene detalle para generar entradas`);
    }

    let created = 0;

    for (const detalle of detalleRows) {
        const cantidad = Number(detalle.cantidad || 0);

        if (!Number.isInteger(cantidad) || cantidad <= 0) {
            throw new Error(`Cantidad inválida en detalle de orden ${orderRow.codigo_orden}`);
        }

        const nombreAsistenteBase = normalizeString(`${detalle.nombres || ''} ${detalle.apellidos || ''}`) || null;
        const emailAsistenteBase = normalizeString(detalle.email) || null;

        for (let i = 0; i < cantidad; i += 1) {
            let codigoEntrada = '';
            let codigoQr = '';
            let inserted = false;
            let attempts = 0;

            while (!inserted && attempts < 5) {
                attempts += 1;
                codigoEntrada = generateUniqueCode('ENT');
                codigoQr = generateUniqueCode('QR');

                try {
                    await connection.execute(
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
                            orderRow.id_orden,
                            detalle.id_evento,
                            detalle.id_tipo_entrada,
                            codigoEntrada,
                            codigoQr,
                            nombreAsistenteBase,
                            emailAsistenteBase
                        ]
                    );

                    inserted = true;
                    created += 1;
                } catch (insertError) {
                    const isDuplicate =
                        insertError &&
                        (
                            insertError.code === 'ER_DUP_ENTRY' ||
                            insertError.errno === 1062
                        );

                    if (!isDuplicate || attempts >= 5) {
                        throw insertError;
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
 * Actualiza o crea el registro del pago dentro de una transacción.
 */
async function upsertPagoAprobado(connection, orderRow, transactionId, clientTransactionId, pagoReal) {
    const gatewayEstado = mapGatewayStatusToPagoEstado(pagoReal);
    const authorizationCode = getAuthorizationCodeFromGateway(pagoReal);
    const referenciaPago = getGatewayReference(pagoReal, clientTransactionId);
    const respuestaGateway = safeJsonStringify(pagoReal);

    const montoAprobado = Number(
        pagoReal?.amount ??
        pagoReal?.amountWithoutTax ??
        orderRow.total
    );

    const montoNormalizado = Number.isFinite(montoAprobado) && montoAprobado > 0
        ? montoAprobado
        : Number(orderRow.total || 0);

    const [pagoRows] = await connection.execute(
        `
        SELECT id_pago
        FROM pagos
        WHERE id_orden = ?
        ORDER BY id_pago DESC
        LIMIT 1
        FOR UPDATE
        `,
        [orderRow.id_orden]
    );

    if (pagoRows.length > 0) {
        await connection.execute(
            `
            UPDATE pagos
            SET
                proveedor_pago = 'Payphone',
                transaccion_id = ?,
                referencia_pago = ?,
                authorization_code = ?,
                monto = ?,
                moneda = 'USD',
                estado = ?,
                respuesta_gateway = ?,
                fecha_pago = NOW(),
                fecha_actualizacion = NOW()
            WHERE id_pago = ?
            `,
            [
                String(transactionId),
                referenciaPago,
                authorizationCode,
                montoNormalizado,
                gatewayEstado,
                respuestaGateway,
                pagoRows[0].id_pago
            ]
        );

        return pagoRows[0].id_pago;
    }

    const [insertResult] = await connection.execute(
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
        ) VALUES (?, 'Payphone', ?, ?, ?, ?, 'USD', ?, ?, NOW(), NOW())
        `,
        [
            orderRow.id_orden,
            String(transactionId),
            referenciaPago,
            authorizationCode,
            montoNormalizado,
            gatewayEstado,
            respuestaGateway
        ]
    );

    return insertResult.insertId;
}

async function markPaymentAsNotApproved(clientTransactionId, transactionId, pagoReal) {
    const gatewayEstado = mapGatewayStatusToPagoEstado(pagoReal);

    try {
        const [ordenRows] = await db.execute(
            `
            SELECT id_orden, codigo_orden, total, estado
            FROM ordenes
            WHERE codigo_orden = ?
            LIMIT 1
            `,
            [clientTransactionId]
        );

        if (ordenRows.length > 0) {
            const orden = ordenRows[0];

            await db.execute(
                `
                UPDATE pagos
                SET
                    proveedor_pago = 'Payphone',
                    transaccion_id = ?,
                    referencia_pago = ?,
                    authorization_code = ?,
                    monto = ?,
                    moneda = 'USD',
                    estado = ?,
                    respuesta_gateway = ?,
                    fecha_actualizacion = NOW()
                WHERE id_orden = ?
                `,
                [
                    String(transactionId),
                    getGatewayReference(pagoReal, clientTransactionId),
                    getAuthorizationCodeFromGateway(pagoReal),
                    Number(orden.total || 0),
                    gatewayEstado,
                    safeJsonStringify(pagoReal),
                    orden.id_orden
                ]
            );
        }
    } catch (updatePagoError) {
        console.error('❌ Error actualizando pago rechazado/anulado:', updatePagoError.message);
    }

    if (
        OrderBusiness &&
        typeof OrderBusiness.handleFailedPayment === 'function'
    ) {
        try {
            await OrderBusiness.handleFailedPayment(clientTransactionId);
        } catch (rollbackError) {
            console.error(`❌ [Rollback] Falló el rollback para ${clientTransactionId}:`, rollbackError.message);
        }
    } else {
        console.warn(`⚠️ [Rollback] No existe OrderBusiness.handleFailedPayment para la orden ${clientTransactionId}.`);
    }

    return gatewayEstado;
}

async function processApprovedPayment(transactionId, clientTransactionId) {
    let connection;

    try {
        console.log(`Consultando estado real de transacción: ${transactionId}`);
        const pagoReal = await PayphoneService.verificarPago(transactionId);

        if (!pagoReal || typeof pagoReal !== 'object') {
            return {
                ok: false,
                statusCode: 502,
                message: 'No se pudo verificar la transacción con el proveedor'
            };
        }

        const gatewayEstado = mapGatewayStatusToPagoEstado(pagoReal);

        if (!isApprovedTransaction(pagoReal)) {
            console.warn(`❌ [Webhook] Pago no aprobado. Orden: ${clientTransactionId}. Estado gateway: ${gatewayEstado}`);

            await markPaymentAsNotApproved(clientTransactionId, transactionId, pagoReal);

            return {
                ok: false,
                statusCode: 400,
                message: 'Transacción no aprobada, stock restaurado',
                gatewayEstado
            };
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [ordenRows] = await connection.execute(
            `
            SELECT
                o.id_orden,
                o.id_cliente,
                o.codigo_orden,
                o.total,
                o.estado,
                c.nombres,
                c.apellidos,
                c.email,
                c.cedula_ruc,
                c.direccion
            FROM ordenes o
            INNER JOIN clientes c ON c.id_cliente = o.id_cliente
            WHERE o.codigo_orden = ?
            LIMIT 1
            FOR UPDATE
            `,
            [clientTransactionId]
        );

        if (!ordenRows.length) {
            await connection.rollback();
            connection.release();
            connection = null;

            return {
                ok: false,
                statusCode: 404,
                message: 'Orden no encontrada en base de datos'
            };
        }

        const orden = ordenRows[0];
        const estadoOrdenActual = normalizeLower(orden.estado);

        const [existingEntriesRows] = await connection.execute(
            `
            SELECT COUNT(*) AS total
            FROM entradas
            WHERE id_orden = ?
            `,
            [orden.id_orden]
        );

        const totalEntradasExistentes = Number(existingEntriesRows[0]?.total || 0);

        const [latestPagoRows] = await connection.execute(
            `
            SELECT id_pago, estado, transaccion_id
            FROM pagos
            WHERE id_orden = ?
            ORDER BY id_pago DESC
            LIMIT 1
            FOR UPDATE
            `,
            [orden.id_orden]
        );

        const latestPago = latestPagoRows[0] || null;

        const yaProcesada =
            estadoOrdenActual === 'pagada' ||
            totalEntradasExistentes > 0 ||
            normalizeLower(latestPago?.estado) === 'aprobado';

        if (yaProcesada) {
            await upsertPagoAprobado(connection, orden, transactionId, clientTransactionId, pagoReal);
            await connection.commit();
            connection.release();
            connection = null;

            console.log(`⚠️ [Idempotencia] La orden ${clientTransactionId} ya fue procesada previamente. No se duplicaron entradas.`);

            return {
                ok: true,
                statusCode: 200,
                message: 'Orden ya procesada anteriormente',
                alreadyProcessed: true
            };
        }

        await upsertPagoAprobado(connection, orden, transactionId, clientTransactionId, pagoReal);

        await connection.execute(
            `
            UPDATE ordenes
            SET
                estado = 'pagada',
                metodo_pago = 'Payphone',
                observacion = CASE
                    WHEN observacion IS NULL OR TRIM(observacion) = ''
                    THEN ?
                    ELSE CONCAT(observacion, ' | ', ?)
                END,
                fecha_actualizacion = NOW()
            WHERE id_orden = ?
            `,
            [
                `Pago aprobado por webhook. Transacción: ${transactionId}`,
                `Pago aprobado por webhook. Transacción: ${transactionId}`,
                orden.id_orden
            ]
        );

        const entriesResult = await createEntriesForOrder(connection, orden);

        await connection.commit();
        connection.release();
        connection = null;

        console.log(
            `✅ [Webhook] Orden ${clientTransactionId} pagada correctamente. Entradas creadas: ${entriesResult.created}`
        );

        try {
            let datosCompletos = null;

            if (
                OrderDB &&
                typeof OrderDB.obtenerDatosCompletosPorCodigo === 'function'
            ) {
                datosCompletos = await OrderDB.obtenerDatosCompletosPorCodigo(clientTransactionId);
            }

            if (datosCompletos) {
                await BillBusiness.procesarFactura(datosCompletos);
            } else {
                console.warn(`⚠️ [Facturación] No se obtuvieron datos completos para la orden ${clientTransactionId}.`);
            }
        } catch (facturaError) {
            console.error(`❌ [Facturación] Error procesando factura para ${clientTransactionId}:`, facturaError.message);
        }

        return {
            ok: true,
            statusCode: 200,
            message: 'Webhook recibido, pago confirmado y entradas generadas',
            entriesCreated: entriesResult.created
        };
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('❌ Error haciendo rollback de la transacción del webhook:', rollbackError.message);
            }

            try {
                connection.release();
            } catch (releaseError) {
                console.error('❌ Error liberando conexión del webhook:', releaseError.message);
            }
        }

        console.error('🚨 [Error Webhook] Fallo crítico al procesar:', error);

        return {
            ok: false,
            statusCode: 500,
            message: 'Error interno del servidor'
        };
    }
}

router.post('/generar-link', async (req, res) => {
    try {
        const { id_orden } = req.body || {};

        if (!isPositiveInteger(id_orden)) {
            return res.status(400).json({
                ok: false,
                message: 'id_orden inválido'
            });
        }

        const [ordenRows] = await db.execute(
            `SELECT o.*, c.nombres, c.apellidos, c.email, c.telefono, c.cedula_ruc
             FROM ordenes o
             JOIN clientes c ON o.id_cliente = c.id_cliente
             WHERE o.id_orden = ?`,
            [Number(id_orden)]
        );

        if (ordenRows.length === 0) {
            return res.status(404).json({
                ok: false,
                message: 'Orden no encontrada'
            });
        }

        const orden = ordenRows[0];

        if (!isNonEmptyString(orden.codigo_orden)) {
            return res.status(500).json({
                ok: false,
                message: 'La orden no tiene código válido'
            });
        }

        if (normalizeString(orden.estado).toLowerCase() !== 'pendiente') {
            return res.status(400).json({
                ok: false,
                message: `La orden ya está ${orden.estado}`
            });
        }

        const total = Number(orden.total);
        if (!Number.isFinite(total) || total <= 0) {
            return res.status(400).json({
                ok: false,
                message: 'El total de la orden es inválido'
            });
        }

        const amount = Math.round(total * 100);
        if (!Number.isInteger(amount) || amount <= 0) {
            return res.status(400).json({
                ok: false,
                message: 'No se pudo calcular un monto válido para el pago'
            });
        }

        const payData = await PayphoneService.prepararBotonPago({
            amount,
            orderId: orden.codigo_orden
        });

        if (!payData.paymentUrl && !payData.payWithCard && !payData.payWithPayPhone) {
            return res.status(502).json({
                ok: false,
                message: 'El proveedor de pago no devolvió URLs válidas'
            });
        }

        const [pagoExistente] = await db.execute(
            `SELECT id_pago FROM pagos WHERE transaccion_id = ? LIMIT 1`,
            [orden.codigo_orden]
        );

        if (pagoExistente.length === 0) {
            await db.execute(
                `INSERT INTO pagos (id_orden, proveedor_pago, transaccion_id, monto, estado, fecha_creacion)
                 VALUES (?, 'PayPhone', ?, ?, 'iniciado', NOW())`,
                [Number(id_orden), orden.codigo_orden, total]
            );
        }

        return res.json({
            ok: true,
            paymentUrl: payData.paymentUrl || payData.payWithCard || payData.payWithPayPhone,
            codigoOrden: orden.codigo_orden
        });
    } catch (error) {
        console.error('❌ Error al generar link de pago:', error);

        return res.status(500).json({
            ok: false,
            message: error.message || 'Error interno al generar el link de pago'
        });
    }
});

/**
 * POST /api/pagos/webhook
 * Soporta webhook server-to-server o callback con JSON.
 */
router.post('/webhook', async (req, res) => {
    console.log(`[WEBHOOK IN][POST] Recibiendo notificación de pago... IP: ${req.ip}`);

    let payload = req.body || {};

    if (Buffer.isBuffer(payload)) {
        try {
            payload = JSON.parse(payload.toString('utf8'));
        } catch (e) {
            console.error('❌ [Seguridad] Error traduciendo el Buffer de PayPhone:', e.message);
            return res.status(400).json({ error: 'Payload inválido' });
        }
    }

    const transactionId = getTransactionIdFromPayload(payload);
    const clientTransactionId = getClientTransactionIdFromPayload(payload);

    if (!transactionId) {
        console.warn('⚠️ [Seguridad] Webhook rechazado: id de transacción inválido.', payload);
        return res.status(400).json({ error: 'Payload inválido: id requerido' });
    }

    if (!clientTransactionId) {
        console.warn('⚠️ [Seguridad] Webhook rechazado: clientTransactionId/clientTransactionID inválido.', payload);
        return res.status(400).json({ error: 'Payload inválido: clientTransactionId requerido' });
    }

    const result = await processApprovedPayment(transactionId, clientTransactionId);

    return res.status(result.statusCode).send(result.message);
});

/**
 * GET /api/pagos/webhook
 * Soporta el retorno del navegador desde PayPhone responseUrl.
 * Procesa el pago y redirige al frontend.
 */
router.get('/webhook', async (req, res) => {
    console.log(`[WEBHOOK IN][GET] Retorno desde PayPhone... IP: ${req.ip}`);

    const payload = req.query || {};
    const transactionId = getTransactionIdFromPayload(payload);
    let clientTransactionId = getClientTransactionIdFromPayload(payload);

    if (!transactionId) {
        return res.redirect(buildFrontendRedirectUrl('/error-pago.html', { reason: 'parametros_invalidos' }));
    }

    if (clientTransactionId) {
        try {
            const isPaid = await checkIfOrderIsPaidSafe(clientTransactionId);
            if (isPaid) {
                console.log(`✅ [GET] Orden ${clientTransactionId} ya estaba pagada. Redirigiendo directo a éxito.`);
                return res.redirect(buildFrontendRedirectUrl('/exito-pago.html', {
                    orden: clientTransactionId,
                    tx: transactionId
                }));
            }
        } catch (e) {
            console.log('Error verificando estado previo:', e.message);
        }
    }

    if (!clientTransactionId) {
        try {
            const pagoReal = await PayphoneService.verificarPago(transactionId);
            clientTransactionId = getGatewayReference(pagoReal, null);
        } catch (e) {
            console.error("❌ Fallo al intentar recuperar clientTransactionId:", e.message);
        }
    }

    if (!clientTransactionId) {
        return res.redirect(buildFrontendRedirectUrl('/error-pago.html', { reason: 'orden_no_encontrada' }));
    }

    const result = await processApprovedPayment(transactionId, clientTransactionId);

    if (!result.ok) {
        const errorUrl = buildFrontendRedirectUrl('/error-pago.html', {
            orden: clientTransactionId,
            tx: transactionId,
            reason: 'pago_no_aprobado',
            msg: result.message
        });
        return res.redirect(errorUrl);
    }

    // Éxito total
    return res.redirect(buildFrontendRedirectUrl('/exito-pago.html', {
        orden: clientTransactionId,
        tx: transactionId
    }));
});

module.exports = router;