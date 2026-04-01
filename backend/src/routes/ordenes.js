const express = require('express');
const router = express.Router();
const db = require('../config/db');

// =========================
// 🟢 CREAR ORDEN (reserva de stock)
// =========================
router.post('/', async (req, res) => {
    const { id_evento, id_tipo_entrada, cantidad, cliente } = req.body;

    // Validaciones básicas
    if (!id_evento || !id_tipo_entrada || !cantidad || !cliente) {
        return res.status(400).json({ ok: false, message: 'Datos incompletos' });
    }

    if (cantidad < 1) {
        return res.status(400).json({ ok: false, message: 'Cantidad inválida' });
    }

    try {
        // Iniciar transacción
        await db.query('START TRANSACTION');  // <--- Cambio: db.query en lugar de db.execute

        // 1. Obtener información del tipo de entrada (bloquear la fila para evitar concurrencia)
        const [tipo] = await db.execute(
            `SELECT precio, stock_disponible, id_evento 
             FROM tipos_entrada 
             WHERE id_tipo_entrada = ? FOR UPDATE`,
            [id_tipo_entrada]
        );

        if (tipo.length === 0) {
            throw new Error('Tipo de entrada no encontrado');
        }

        // Verificar que el tipo pertenezca al evento
        if (tipo[0].id_evento !== id_evento) {
            throw new Error('El tipo de entrada no pertenece al evento indicado');
        }

        if (tipo[0].stock_disponible < cantidad) {
            throw new Error('Stock insuficiente');
        }

        // 2. Crear o buscar cliente (por email)
        let id_cliente;
        const [clienteExistente] = await db.execute(
            `SELECT id_cliente FROM clientes WHERE email = ?`,
            [cliente.email]
        );

        if (clienteExistente.length > 0) {
            id_cliente = clienteExistente[0].id_cliente;
            // Actualizar datos del cliente (opcional)
            await db.execute(
                `UPDATE clientes 
                 SET nombres = ?, apellidos = ?, telefono = ?, cedula_ruc = ?, direccion = ?
                 WHERE id_cliente = ?`,
                [cliente.nombres, cliente.apellidos, cliente.telefono, cliente.documento, cliente.direccion, id_cliente]
            );
        } else {
            const [result] = await db.execute(
                `INSERT INTO clientes (nombres, apellidos, email, telefono, cedula_ruc, direccion)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [cliente.nombres, cliente.apellidos, cliente.email, cliente.telefono, cliente.documento, cliente.direccion]
            );
            id_cliente = result.insertId;
        }

        // 3. Calcular totales
        const precio_unitario = parseFloat(tipo[0].precio);
        const subtotal = precio_unitario * cantidad;
        const total = subtotal; // asumiendo IVA 0%

        // 4. Crear orden
        const codigo_orden = `ORD-${Date.now()}`;
        const [ordenResult] = await db.execute(
            `INSERT INTO ordenes (id_cliente, codigo_orden, subtotal, total, estado)
             VALUES (?, ?, ?, ?, 'pendiente')`,
            [id_cliente, codigo_orden, subtotal, total]
        );
        const id_orden = ordenResult.insertId;

        // 5. Insertar detalle de orden
        await db.execute(
            `INSERT INTO orden_detalle (id_orden, id_tipo_entrada, cantidad, precio_unitario, subtotal)
             VALUES (?, ?, ?, ?, ?)`,
            [id_orden, id_tipo_entrada, cantidad, precio_unitario, subtotal]
        );

        // 6. Actualizar stock (disminuir stock_disponible)
        await db.execute(
            `UPDATE tipos_entrada SET stock_disponible = stock_disponible - ?
             WHERE id_tipo_entrada = ?`,
            [cantidad, id_tipo_entrada]
        );

        await db.query('COMMIT');  // <--- Cambio: db.query

        res.json({
            ok: true,
            id_orden,
            codigo_orden,
            total
        });

    } catch (error) {
        await db.query('ROLLBACK');  // <--- Cambio: db.query
        console.error('❌ Error al crear orden:', error);
        res.status(500).json({ ok: false, message: error.message });
    }
});

// =========================
// 🔵 OBTENER UNA ORDEN POR ID (con detalles y entradas)
// =========================
router.get('/:id', async (req, res) => {
    try {
        const id = req.params.id;

        const [orden] = await db.execute(
            `SELECT o.*, c.nombres, c.apellidos, c.email, c.telefono, c.cedula_ruc, c.direccion
             FROM ordenes o
             JOIN clientes c ON o.id_cliente = c.id_cliente
             WHERE o.id_orden = ?`,
            [id]
        );

        if (orden.length === 0) {
            return res.status(404).json({ ok: false, message: 'Orden no encontrada' });
        }

        const [detalles] = await db.execute(
            `SELECT od.*, te.nombre as tipo_entrada_nombre, e.titulo as evento_titulo, e.fecha_evento, e.lugar, e.direccion as evento_direccion
             FROM orden_detalle od
             JOIN tipos_entrada te ON od.id_tipo_entrada = te.id_tipo_entrada
             JOIN eventos e ON te.id_evento = e.id_evento
             WHERE od.id_orden = ?`,
            [id]
        );

        const [entradas] = await db.execute(
            `SELECT * FROM entradas WHERE id_orden = ?`,
            [id]
        );

        res.json({
            ok: true,
            orden: orden[0],
            detalles,
            entradas
        });

    } catch (error) {
        console.error('❌ Error al obtener orden:', error);
        res.status(500).json({ ok: false, message: error.message });
    }
});

// =========================
// 🔄 WEBHOOK PARA ACTUALIZAR ESTADO DE PAGO
// =========================
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const payload = req.body;
        console.log('📩 Webhook recibido:', payload);

        const { clientTransactionId, status, amount, transactionId } = payload;

        const [orden] = await db.execute(
            `SELECT id_orden, estado FROM ordenes WHERE codigo_orden = ?`,
            [clientTransactionId]
        );

        if (orden.length === 0) {
            console.log('⚠️ Orden no encontrada para clientTransactionId:', clientTransactionId);
            return res.status(404).send('Orden no encontrada');
        }

        const id_orden = orden[0].id_orden;

        if (orden[0].estado === 'pagada') {
            return res.sendStatus(200);
        }

        await db.query('START TRANSACTION');  // <--- Cambio: db.query

        if (status === 'COMPLETED') {
            // Pago exitoso
            await db.execute(
                `UPDATE ordenes SET estado = 'pagada', fecha_actualizacion = NOW() WHERE id_orden = ?`,
                [id_orden]
            );

            await db.execute(
                `INSERT INTO pagos (id_orden, proveedor_pago, transaccion_id, monto, estado, respuesta_gateway)
                 VALUES (?, 'PayPhone', ?, ?, 'aprobado', ?)`,
                [id_orden, transactionId, amount / 100, JSON.stringify(payload)]
            );

            const [detalles] = await db.execute(
                `SELECT od.id_tipo_entrada, od.cantidad, te.id_evento 
                 FROM orden_detalle od
                 JOIN tipos_entrada te ON od.id_tipo_entrada = te.id_tipo_entrada
                 WHERE od.id_orden = ?`,
                [id_orden]
            );

            for (const detalle of detalles) {
                for (let i = 0; i < detalle.cantidad; i++) {
                    const codigoEntrada = `ENT-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 6)}`;
                    const qrData = `https://tudominio.com/validar/${codigoEntrada}`;
                    await db.execute(
                        `INSERT INTO entradas (id_orden, id_evento, id_tipo_entrada, codigo_entrada, codigo_qr, estado)
                         VALUES (?, ?, ?, ?, ?, 'generada')`,
                        [id_orden, detalle.id_evento, detalle.id_tipo_entrada, codigoEntrada, qrData]
                    );
                }
            }

            await db.query('COMMIT');  // <--- Cambio: db.query
            console.log('✅ Pago completado y entradas generadas para orden', id_orden);

        } else {
            // Pago fallido o cancelado: liberar stock
            const [detalles] = await db.execute(
                `SELECT id_tipo_entrada, cantidad FROM orden_detalle WHERE id_orden = ?`,
                [id_orden]
            );

            for (const detalle of detalles) {
                await db.execute(
                    `UPDATE tipos_entrada SET stock_disponible = stock_disponible + ?
                     WHERE id_tipo_entrada = ?`,
                    [detalle.cantidad, detalle.id_tipo_entrada]
                );
            }

            await db.execute(
                `UPDATE ordenes SET estado = 'fallida', fecha_actualizacion = NOW() WHERE id_orden = ?`,
                [id_orden]
            );

            await db.query('COMMIT');  // <--- Cambio: db.query
            console.log('⚠️ Pago fallido, stock liberado para orden', id_orden);
        }

        res.sendStatus(200);
    } catch (error) {
        await db.query('ROLLBACK');  // <--- Cambio: db.query
        console.error('❌ Error en webhook:', error);
        res.sendStatus(500);
    }
});

module.exports = router;