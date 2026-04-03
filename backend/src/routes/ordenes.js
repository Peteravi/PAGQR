const express = require('express');
const QRCode = require('qrcode');
const router = express.Router();
const db = require('../config/db');

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

// =========================
// CREAR ORDEN
// =========================
router.post('/', async (req, res) => {
    const connection = await db.getConnection();

    try {
        const {
            cliente,
            items,
            subtotal,
            iva,
            total
        } = req.body || {};

        if (!cliente) {
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
            const id_tipo_entrada = toNumber(item.id_tipo_entrada);
            const cantidad = toNumber(item.cantidad);

            if (!id_tipo_entrada || cantidad <= 0) {
                throw new Error('Item inválido en la orden');
            }

            const [tipoRows] = await connection.execute(
                `SELECT id_tipo_entrada, id_evento, nombre, precio, stock_disponible
                 FROM tipos_entrada
                 WHERE id_tipo_entrada = ?
                 FOR UPDATE`,
                [id_tipo_entrada]
            );

            if (tipoRows.length === 0) {
                throw new Error(`Tipo de entrada no encontrado: ${id_tipo_entrada}`);
            }

            const tipo = tipoRows[0];

            if (toNumber(tipo.stock_disponible) < cantidad) {
                throw new Error(`Stock insuficiente para "${tipo.nombre}"`);
            }

            const precio_unitario = toNumber(tipo.precio);
            const subtotal_item = precio_unitario * cantidad;

            subtotalCalculado += subtotal_item;

            itemsValidados.push({
                id_tipo_entrada,
                id_evento: tipo.id_evento,
                cantidad,
                precio_unitario,
                subtotal_item
            });
        }

        const subtotalFinal = subtotal !== undefined ? toNumber(subtotal) : subtotalCalculado;
        const ivaFinal = iva !== undefined ? toNumber(iva) : 0;
        const totalFinal = total !== undefined ? toNumber(total) : subtotalFinal + ivaFinal;
        const codigo_orden = generarCodigoOrden();

        const [ordenInsert] = await connection.execute(
            `INSERT INTO ordenes (id_cliente, codigo_orden, subtotal, iva, total, estado, fecha_creacion, fecha_actualizacion)
             VALUES (?, ?, ?, ?, ?, 'pendiente', NOW(), NOW())`,
            [id_cliente, codigo_orden, subtotalFinal, ivaFinal, totalFinal]
        );

        const id_orden = ordenInsert.insertId;

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
        await connection.rollback();
        console.error('❌ Error creando orden:', error);

        return res.status(500).json({
            ok: false,
            message: error.message || 'Error interno al crear la orden'
        });
    } finally {
        connection.release();
    }
});

// =========================
// OBTENER ENTRADAS DE UNA ORDEN
// IMPORTANTE: ESTA RUTA VA ANTES DE "/:id"
// =========================
router.get('/:id/entradas', async (req, res) => {
    try {
        const { id } = req.params;

        const [ordenRows] = await db.execute(
            `
            SELECT
                o.id_orden,
                o.codigo_orden,
                o.total,
                o.estado,
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
            rows.map(async (row) => ({
                id_entrada: row.id_entrada,
                codigo: row.codigo_entrada,
                qr_text: row.codigo_qr || row.codigo_entrada,
                qr_image: await QRCode.toDataURL(row.codigo_qr || row.codigo_entrada, {
                    width: 320,
                    margin: 1
                }),
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
                    precio: toNumber(row.precio_unitario)
                }
            }))
        );

        return res.json({
            ok: true,
            orden: {
                id_orden: orden.id_orden,
                codigo_orden: orden.codigo_orden,
                total: toNumber(orden.total),
                estado: orden.estado,
                comprador: {
                    nombres: orden.nombres,
                    apellidos: orden.apellidos,
                    email: orden.email,
                    telefono: orden.telefono,
                    documento: orden.cedula_ruc,
                    direccion: orden.direccion
                }
            },
            entradas
        });
    } catch (error) {
        console.error('❌ Error obteniendo entradas de la orden:', error);
        return res.status(500).json({
            ok: false,
            message: error.message
        });
    }
});

// =========================
// OBTENER ORDEN POR ID
// =========================
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

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
            message: error.message
        });
    }
});

module.exports = router;