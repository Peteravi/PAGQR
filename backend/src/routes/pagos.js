const express = require('express');
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

function isApprovedTransaction(pagoReal) {
    if (!pagoReal || typeof pagoReal !== 'object') return false;

    const transactionStatus = String(pagoReal.transactionStatus || '').trim().toLowerCase();
    const statusCode = Number(pagoReal.statusCode);

    return transactionStatus === 'approved' || statusCode === 3;
}

async function checkIfOrderIsPaidSafe(codigoOrden) {
    if (!isNonEmptyString(codigoOrden)) return false;

    try {
        // Si existe el método en OrderBusiness, se usa.
        if (
            OrderBusiness &&
            typeof OrderBusiness.checkIfOrderIsPaid === 'function'
        ) {
            return await OrderBusiness.checkIfOrderIsPaid(codigoOrden);
        }

        // Fallback seguro para no romper si el método no existe.
        const [rows] = await db.execute(
            `
            SELECT
                o.estado AS estado_orden,
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

        const estadoOrden = normalizeString(rows[0].estado_orden).toLowerCase();
        const estadoPago = normalizeString(rows[0].estado_pago).toLowerCase();

        return (
            estadoOrden === 'pagada' ||
            estadoOrden === 'aprobada' ||
            estadoPago === 'aprobado' ||
            estadoPago === 'pagado' ||
            estadoPago === 'completed'
        );
    } catch (error) {
        console.error('❌ Error verificando si la orden ya fue pagada:', error.message);
        throw error;
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

        const payUrl = await PayphoneService.prepararBotonPago({
            amount,
            orderId: orden.codigo_orden
        });

        if (!isNonEmptyString(payUrl)) {
            return res.status(502).json({
                ok: false,
                message: 'El proveedor de pago no devolvió una URL válida'
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
            payUrl,
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

router.post('/webhook', async (req, res) => {
    console.log(`[WEBHOOK IN] Recibiendo notificación de pago... IP: ${req.ip}`);

    try {
        const payload = req.body || {};
        const transactionId = payload.id;
        const clientTransactionId = normalizeString(payload.clientTransactionId);

        if (!transactionId || (!isPositiveInteger(transactionId) && !isNonEmptyString(String(transactionId)))) {
            console.warn('⚠️ [Seguridad] Webhook rechazado: id de transacción inválido.', payload);
            return res.status(400).json({ error: 'Payload inválido: id requerido' });
        }

        if (!isNonEmptyString(clientTransactionId)) {
            console.warn('⚠️ [Seguridad] Webhook rechazado: clientTransactionId inválido.', payload);
            return res.status(400).json({ error: 'Payload inválido: clientTransactionId requerido' });
        }

        const isAlreadyProcessed = await checkIfOrderIsPaidSafe(clientTransactionId);
        if (isAlreadyProcessed) {
            console.log(`⚠️ [Idempotencia] La orden ${clientTransactionId} ya estaba pagada. Ignorando aviso duplicado.`);
            return res.status(200).send('Orden ya procesada anteriormente');
        }

        console.log(`Consultando estado real de transacción: ${transactionId}`);
        const pagoReal = await PayphoneService.verificarPago(transactionId);

        if (!pagoReal || typeof pagoReal !== 'object') {
            console.warn(`⚠️ [Webhook] Respuesta inválida al verificar la transacción ${transactionId}.`);
            return res.status(502).send('No se pudo verificar la transacción con el proveedor');
        }

        if (isApprovedTransaction(pagoReal)) {
            console.log(`✅ ¡Pago Verificado Exitosamente! Orden: ${clientTransactionId}`);

            const datosCompletos = await OrderDB.obtenerDatosCompletosPorCodigo(clientTransactionId);

            if (!datosCompletos) {
                console.warn(`⚠️ [Webhook] No se encontró la orden ${clientTransactionId} en la BD luego de verificar el pago.`);
                return res.status(404).send('Orden no encontrada en base de datos');
            }

            // Se mantiene la llamada existente para no afectar el flujo actual.
            // Si BillBusiness falla, se reporta el error para evitar falsos positivos silenciosos.
            try {
                await BillBusiness.procesarFactura(datosCompletos);
            } catch (facturaError) {
                console.error(`❌ [Facturación] Error procesando factura para ${clientTransactionId}:`, facturaError.message);
                return res.status(500).send('Pago verificado, pero falló el procesamiento posterior');
            }

            return res.status(200).send('Webhook recibido, verificado y procesado');
        }

        console.warn(`❌ [Seguridad] Pago no aprobado o fallido. Iniciando rollback de stock para la orden: ${clientTransactionId}`);

        if (
            OrderBusiness &&
            typeof OrderBusiness.handleFailedPayment === 'function'
        ) {
            await OrderBusiness.handleFailedPayment(clientTransactionId);
        } else {
            console.warn(`⚠️ [Rollback] No existe OrderBusiness.handleFailedPayment para la orden ${clientTransactionId}.`);
        }

        return res.status(400).send('Transacción no aprobada, stock restaurado');

    } catch (error) {
        console.error('🚨 [Error Webhook] Fallo crítico al procesar:', error);
        return res.status(500).send('Error interno del servidor');
    }
});

module.exports = router;