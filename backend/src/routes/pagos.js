const express = require('express');
const router = express.Router();
const db = require('../config/db');
const PayphoneService = require('../services/PayphoneService');
const OrderBusiness = require('../business/OrderBusiness');
const OrderDB = require('../database/OrderDB');
const BillBusiness = require('../business/BillBusiness');


router.post('/generar-link', async (req, res) => {
    const { id_orden } = req.body;

    if (!id_orden) {
        return res.status(400).json({ ok: false, message: 'Falta id_orden' });
    }

    try {
        const [ordenRows] = await db.execute(
            `SELECT o.*, c.nombres, c.apellidos, c.email, c.telefono, c.cedula_ruc
             FROM ordenes o
             JOIN clientes c ON o.id_cliente = c.id_cliente
             WHERE o.id_orden = ?`,
            [id_orden]
        );

        if (ordenRows.length === 0) {
            return res.status(404).json({ ok: false, message: 'Orden no encontrada' });
        }

        const orden = ordenRows[0];

        if (orden.estado !== 'pendiente') {
            return res.status(400).json({
                ok: false,
                message: `La orden ya está ${orden.estado}`
            });
        }

        const amount = Math.round(parseFloat(orden.total) * 100);

        const payUrl = await PayphoneService.prepararBotonPago({
            amount: amount,
            orderId: orden.codigo_orden
        });

        const [pagoExistente] = await db.execute(
            `SELECT id_pago FROM pagos WHERE transaccion_id = ? LIMIT 1`,
            [orden.codigo_orden]
        );

        if (pagoExistente.length === 0) {
            await db.execute(
                `INSERT INTO pagos (id_orden, proveedor_pago, transaccion_id, monto, estado, fecha_creacion)
                 VALUES (?, 'PayPhone', ?, ?, 'iniciado', NOW())`,
                [id_orden, orden.codigo_orden, orden.total]
            );
        }

        return res.json({
            ok: true,
            payUrl: payUrl,
            codigoOrden: orden.codigo_orden
        });

    } catch (error) {
        console.error('❌ Error al generar link de pago:', error.message);
        return res.status(500).json({
            ok: false,
            message: error.message
        });
    }
});

router.post('/webhook', async (req, res) => {
    console.log(`[WEBHOOK IN] Recibiendo notificación de pago... IP: ${req.ip}`);

    try {
        const payload = req.body;

        if (!payload || !payload.id || !payload.clientTransactionId) {
            console.warn('⚠️ [Seguridad] Webhook rechazado: Estructura inválida.', payload);
            return res.status(400).json({ error: 'Payload inválido' });
        }

        const isAlreadyProcessed = await OrderBusiness.checkIfOrderIsPaid(payload.clientTransactionId);
        if (isAlreadyProcessed) {
            console.log(`⚠️ [Idempotencia] La orden ${payload.clientTransactionId} ya estaba pagada. Ignorando aviso duplicado.`);
            return res.status(200).send('Orden ya procesada anteriormente');
        }

        console.log(`Consultando estado real de transacción: ${payload.id}`);
        const pagoReal = await PayphoneService.verificarPago(payload.id);

        if (pagoReal.transactionStatus === 'Approved' || pagoReal.statusCode === 3) {
            console.log(`✅ ¡Pago Verificado Exitosamente! Orden: ${payload.clientTransactionId}`);

            const datosCompletos = await OrderDB.obtenerDatosCompletosPorCodigo(payload.clientTransactionId);

            if (datosCompletos) {
                await BillBusiness.procesarFactura(datosCompletos);
            } else {
                console.warn(`⚠️ [Facturación] No se encontró la orden ${payload.clientTransactionId} en la BD para facturar.`);
            }

            return res.status(200).send('Webhook recibido, verificado y procesado');

        } else {
            console.warn(`❌ [Seguridad] Pago no aprobado o fallido. Iniciando rollback de stock para la orden: ${payload.clientTransactionId}`);

            await OrderBusiness.handleFailedPayment(payload.clientTransactionId);

            return res.status(400).send('Transacción no aprobada, stock restaurado');
        }

    } catch (error) {
        console.error('🚨 [Error Webhook] Fallo crítico al procesar:', error.message);
        return res.status(500).send('Error interno del servidor');
    }
});

module.exports = router;