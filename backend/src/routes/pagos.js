const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/db');
const PayphoneService = require('../services/PayphoneService');
const OrderBusiness = require('../business/OrderBusiness');
const OrderDB = require('../database/OrderDB');
const BillBusiness = require('../business/BillBusiness');

// =========================
// CONFIGURACIÓN DESDE VARIABLES DE ENTORNO
// =========================
const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const PAYPHONE_TOKEN = process.env.PAYPHONE_TOKEN;
const PAYPHONE_APP_ID = process.env.PAYPHONE_APP_ID;
const PAYPHONE_NOTIFY_URL = `${BASE_URL}/api/pagos/webhook`;
const PAYPHONE_RETURN_URL = `${BASE_URL}/confirmacion`;

// =========================
// 🟢 GENERAR LINK DE PAGO CON PAYPHONE
// =========================
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
        const clientTransactionId = orden.codigo_orden;

        const payload = {
            clientTransactionId,
            amount,
            currency: 'USD',
            storeId: PAYPHONE_STORE_ID,
            notifyUrl: PAYPHONE_NOTIFY_URL,
            returnUrl: PAYPHONE_RETURN_URL,
            details: {
                email: orden.email,
                phone: orden.telefono,
                name: `${orden.nombres} ${orden.apellidos}`,
                document: orden.cedula_ruc
            }
        };

        const auth = Buffer.from(`${PAYPHONE_CLIENT_ID}:${PAYPHONE_CLIENT_SECRET}`).toString('base64');

        const response = await axios.post(`${PAYPHONE_API_URL}/payment/create`, payload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${auth}`
            }
        });

        if (!response.data || !response.data.transactionId) {
            throw new Error('Respuesta inválida de PayPhone');
        }

        const transaccionId = response.data.transactionId;
        const payUrl = response.data.paymentUrl || `${PAYPHONE_API_URL}/payment/${transaccionId}`;

        // Registrar pago iniciado solo si aún no existe esa transacción
        const [pagoExistente] = await db.execute(
            `SELECT id_pago FROM pagos WHERE transaccion_id = ? LIMIT 1`,
            [transaccionId]
        );

        if (pagoExistente.length === 0) {
            await db.execute(
                `INSERT INTO pagos (id_orden, proveedor_pago, transaccion_id, monto, estado, fecha_creacion)
                 VALUES (?, 'PayPhone', ?, ?, 'iniciado', NOW())`,
                [id_orden, transaccionId, orden.total]
            );
        }

        return res.json({
            ok: true,
            payUrl,
            transactionId: transaccionId,
            codigoOrden: orden.codigo_orden
        });
    } catch (error) {
        console.error('❌ Error al generar link de pago:', error.response?.data || error.message);
        return res.status(500).json({
            ok: false,
            message: error.response?.data?.message || error.message
        });
    }
});

// =========================
// 🔄 WEBHOOK DE PAYPHONE
// =========================
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    let payload;

    try {
        payload = JSON.parse(req.body.toString());
    } catch {
        payload = req.body;
    }

    console.log('📩 Webhook recibido:', payload);

    const {
        clientTransactionId,
        status,
        amount,
        transactionId
    } = payload || {};

    if (!clientTransactionId) {
        return res.status(400).send('Falta clientTransactionId');
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [ordenRows] = await connection.execute(
            `SELECT id_orden, estado
             FROM ordenes
             WHERE codigo_orden = ?
             FOR UPDATE`,
            [clientTransactionId]
        );

        if (ordenRows.length === 0) {
            throw new Error('Orden no encontrada');
        }

        const orden = ordenRows[0];
        const id_orden = orden.id_orden;

        if (orden.estado === 'pagada') {
            await connection.commit();
            return res.sendStatus(200);
        }

        if (status === 'COMPLETED') {
            await connection.execute(
                `UPDATE ordenes
                 SET estado = 'pagada', fecha_actualizacion = NOW()
                 WHERE id_orden = ?`,
                [id_orden]
            );

            await connection.execute(
                `UPDATE pagos
                 SET estado = 'aprobado',
                     monto = ?,
                     respuesta_gateway = ?,
                     fecha_pago = NOW()
                 WHERE transaccion_id = ?`,
                [(amount / 100) || 0, JSON.stringify(payload), transactionId]
            );

            const [detalles] = await connection.execute(
                `SELECT od.id_tipo_entrada, od.cantidad, te.id_evento
                 FROM orden_detalle od
                 JOIN tipos_entrada te ON od.id_tipo_entrada = te.id_tipo_entrada
                 WHERE od.id_orden = ?`,
                [id_orden]
            );

            for (const detalle of detalles) {
                for (let i = 0; i < detalle.cantidad; i++) {
                    const codigoEntrada = `ENT-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 10)}`;
                    const qrData = `PAGQR|${codigoEntrada}`;

                    await connection.execute(
                        `INSERT INTO entradas
                         (id_orden, id_evento, id_tipo_entrada, codigo_entrada, codigo_qr, estado)
                         VALUES (?, ?, ?, ?, ?, 'generada')`,
                        [id_orden, detalle.id_evento, detalle.id_tipo_entrada, codigoEntrada, qrData]
                    );
                }
            }

            console.log(`✅ Pago completado y entradas generadas para orden ${id_orden}`);
        } else {
            const [detalles] = await connection.execute(
                `SELECT id_tipo_entrada, cantidad
                 FROM orden_detalle
                 WHERE id_orden = ?`,
                [id_orden]
            );

            for (const detalle of detalles) {
                await connection.execute(
                    `UPDATE tipos_entrada
                     SET stock_disponible = stock_disponible + ?
                     WHERE id_tipo_entrada = ?`,
                    [detalle.cantidad, detalle.id_tipo_entrada]
                );
            }

            await connection.execute(
                `UPDATE ordenes
                 SET estado = 'fallida', fecha_actualizacion = NOW()
                 WHERE id_orden = ?`,
                [id_orden]
            );

            await connection.execute(
                `UPDATE pagos
                 SET estado = 'rechazado',
                     respuesta_gateway = ?
                 WHERE transaccion_id = ?`,
                [JSON.stringify(payload), transactionId]
            );

            console.log(`⚠️ Pago fallido, stock liberado para orden ${id_orden}`);
        }

        await connection.commit();
        return res.sendStatus(200);
    } catch (error) {
        await connection.rollback();
        console.error('❌ Error en webhook:', error);
        return res.sendStatus(500);
    } finally {
        connection.release();
    }
});

router.post('/api/pagos/webhook', async (req, res) => {
    console.log(`[WEBHOOK IN] Recibiendo notificación de pago... IP: ${req.ip}`);

    try {
        const payload = req.body;

        if (!payload || !payload.id || !payload.clientTransactionId) {
            console.warn('⚠️ [Seguridad] Webhook rechazado: Estructura inválida.', payload);
            return res.status(400).json({ error: 'Payload inválido' });
        }

        // 2. IDEMPOTENCIA (TICKET PAY-002)
        const isAlreadyProcessed = await OrderBusiness.checkIfOrderIsPaid(payload.clientTransactionId);
        if (isAlreadyProcessed) {
            console.log(`⚠️ [Idempotencia] La orden ${payload.clientTransactionId} ya estaba pagada. Ignorando aviso duplicado.`);
            return res.status(200).send('Orden ya procesada anteriormente');
        }

        // 3. VALIDACIÓN CON PAYPHONE (TICKET PAY-001 y PAY-003)
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

            // ROLLBACK DE STOCK (TICKET PAY-004)
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