const express = require('express');
const router = express.Router();
const db = require('../config/db');

function isPositiveInteger(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0;
}

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

// ======================================================
// Helper: subconsulta del último pago por orden
// ======================================================
const ULTIMO_PAGO_JOIN = `
    LEFT JOIN (
        SELECT p1.*
        FROM pagos p1
        INNER JOIN (
            SELECT id_orden, MAX(id_pago) AS max_id_pago
            FROM pagos
            GROUP BY id_orden
        ) p2 ON p1.id_orden = p2.id_orden AND p1.id_pago = p2.max_id_pago
    ) up ON up.id_orden = o.id_orden
`;

// =============================
// 1. RESUMEN GENERAL DE VENTAS
// =============================
router.get('/resumen', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                COUNT(*) AS total_ordenes,

                IFNULL(SUM(
                    CASE
                        WHEN o.estado = 'pagada' OR up.estado = 'aprobado'
                        THEN o.total
                        ELSE 0
                    END
                ), 0) AS total_vendido,

                IFNULL(SUM(
                    CASE
                        WHEN o.estado = 'pendiente' AND (up.estado IS NULL OR up.estado IN ('iniciado', 'pendiente'))
                        THEN o.total
                        ELSE 0
                    END
                ), 0) AS monto_pendiente,

                IFNULL(SUM(
                    CASE
                        WHEN o.estado = 'reembolsada' OR up.estado = 'reembolsado'
                        THEN o.total
                        ELSE 0
                    END
                ), 0) AS monto_reembolsado,

                IFNULL(SUM(
                    CASE
                        WHEN o.estado IN ('fallida', 'cancelada') OR up.estado IN ('rechazado', 'anulado')
                        THEN 1
                        ELSE 0
                    END
                ), 0) AS ventas_fallidas,

                IFNULL(SUM(
                    CASE
                        WHEN o.estado = 'pendiente' AND (up.estado IS NULL OR up.estado IN ('iniciado', 'pendiente'))
                        THEN 1
                        ELSE 0
                    END
                ), 0) AS ordenes_pendientes
            FROM ordenes o
            ${ULTIMO_PAGO_JOIN}
        `);

        res.json(rows[0] || {
            total_ordenes: 0,
            total_vendido: 0,
            monto_pendiente: 0,
            monto_reembolsado: 0,
            ventas_fallidas: 0,
            ordenes_pendientes: 0
        });
    } catch (error) {
        console.error('Error en /resumen:', error);
        res.status(500).json({ error: 'Error obteniendo resumen de ventas' });
    }
});

// =============================
// 2. LISTA DE ÓRDENES (VENTAS)
// =============================
router.get('/ordenes', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                o.id_orden,
                o.codigo_orden,
                CONCAT(c.nombres, ' ', c.apellidos) AS cliente,
                o.total,
                o.estado,
                o.metodo_pago,
                o.fecha_creacion,
                o.fecha_actualizacion,
                up.estado AS pago_estado,
                up.proveedor_pago,
                (
                    SELECT COUNT(*)
                    FROM entradas en
                    WHERE en.id_orden = o.id_orden
                ) AS total_entradas
            FROM ordenes o
            INNER JOIN clientes c ON o.id_cliente = c.id_cliente
            ${ULTIMO_PAGO_JOIN}
            ORDER BY o.fecha_creacion DESC
        `);

        res.json(rows);
    } catch (error) {
        console.error('Error en /ordenes:', error);
        res.status(500).json({ error: 'Error obteniendo órdenes' });
    }
});

// ==================================================
// 2.1 RESUMEN DE UNA ORDEN PARA EL PANEL DE VENTAS
// Ruta nueva, no rompe rutas existentes
// ==================================================
router.get('/ordenes/:id/resumen', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isPositiveInteger(id)) {
            return res.status(400).json({ error: 'El id de la orden es inválido' });
        }

        const [ordenRows] = await db.query(`
            SELECT
                o.id_orden,
                o.codigo_orden,
                o.subtotal,
                o.iva,
                o.total,
                o.estado,
                o.metodo_pago,
                o.fecha_creacion,
                o.fecha_actualizacion,
                c.id_cliente,
                c.nombres,
                c.apellidos,
                c.email,
                c.telefono,
                c.cedula_ruc,
                c.direccion,
                up.id_pago,
                up.proveedor_pago,
                up.estado AS pago_estado,
                up.monto AS pago_monto,
                up.fecha_pago,
                up.fecha_creacion AS pago_fecha_creacion
            FROM ordenes o
            INNER JOIN clientes c ON o.id_cliente = c.id_cliente
            ${ULTIMO_PAGO_JOIN}
            WHERE o.id_orden = ?
            LIMIT 1
        `, [Number(id)]);

        if (!ordenRows.length) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        const orden = ordenRows[0];

        const [detalleRows] = await db.query(`
            SELECT
                COUNT(*) AS items,
                IFNULL(SUM(cantidad), 0) AS cantidad_total
            FROM orden_detalle
            WHERE id_orden = ?
        `, [Number(id)]);

        const [entradasRows] = await db.query(`
            SELECT
                COUNT(*) AS total_generadas
            FROM entradas
            WHERE id_orden = ?
        `, [Number(id)]);

        return res.json({
            ok: true,
            orden: {
                id_orden: orden.id_orden,
                codigo_orden: orden.codigo_orden,
                estado: orden.estado,
                metodo_pago: orden.metodo_pago,
                fecha_creacion: orden.fecha_creacion,
                fecha_actualizacion: orden.fecha_actualizacion,
                cliente: {
                    id_cliente: orden.id_cliente,
                    nombres: orden.nombres,
                    apellidos: orden.apellidos,
                    email: orden.email,
                    telefono: orden.telefono,
                    documento: orden.cedula_ruc,
                    direccion: orden.direccion
                }
            },
            pago: {
                id_pago: orden.id_pago || null,
                proveedor_pago: orden.proveedor_pago || null,
                estado: orden.pago_estado || null,
                monto: toNumber(orden.pago_monto),
                fecha_pago: orden.fecha_pago || null,
                fecha_creacion: orden.pago_fecha_creacion || null
            },
            totales: {
                subtotal: toNumber(orden.subtotal),
                iva: toNumber(orden.iva),
                total: toNumber(orden.total)
            },
            detalle: {
                items: toNumber(detalleRows[0]?.items),
                cantidad_total: toNumber(detalleRows[0]?.cantidad_total)
            },
            entradas: {
                total_generadas: toNumber(entradasRows[0]?.total_generadas)
            }
        });
    } catch (error) {
        console.error('Error en /ordenes/:id/resumen:', error);
        res.status(500).json({ error: 'Error obteniendo resumen de la orden' });
    }
});

// =============================
// 3. DETALLE DE UNA ORDEN
// IMPORTANTE: se mantiene igual para no romper el frontend existente
// =============================
router.get('/ordenes/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isPositiveInteger(id)) {
            return res.status(400).json({ error: 'El id de la orden es inválido' });
        }

        const [detalle] = await db.query(`
            SELECT
                e.titulo AS evento,
                te.nombre AS tipo_entrada,
                od.cantidad,
                od.precio_unitario,
                od.subtotal
            FROM orden_detalle od
            INNER JOIN tipos_entrada te ON od.id_tipo_entrada = te.id_tipo_entrada
            INNER JOIN eventos e ON te.id_evento = e.id_evento
            WHERE od.id_orden = ?
            ORDER BY od.id_detalle ASC
        `, [Number(id)]);

        res.json(detalle);
    } catch (error) {
        console.error('Error en /ordenes/:id:', error);
        res.status(500).json({ error: 'Error obteniendo detalle de orden' });
    }
});

// =============================
// 4. VENTAS POR DÍA (GRÁFICO)
// =============================
router.get('/ventas-por-dia', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                DATE(o.fecha_creacion) AS fecha,
                IFNULL(SUM(o.total), 0) AS total_dia
            FROM ordenes o
            ${ULTIMO_PAGO_JOIN}
            WHERE o.estado = 'pagada' OR up.estado = 'aprobado'
            GROUP BY DATE(o.fecha_creacion)
            ORDER BY fecha ASC
        `);

        res.json(rows);
    } catch (error) {
        console.error('Error en /ventas-por-dia:', error);
        res.status(500).json({ error: 'Error obteniendo ventas por día' });
    }
});

// =============================
// 5. VENTAS POR EVENTO
// =============================
router.get('/ventas-por-evento', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                e.id_evento,
                e.titulo,
                IFNULL(SUM(od.cantidad), 0) AS entradas_vendidas,
                IFNULL(SUM(od.subtotal), 0) AS total_generado
            FROM orden_detalle od
            INNER JOIN tipos_entrada te ON od.id_tipo_entrada = te.id_tipo_entrada
            INNER JOIN eventos e ON te.id_evento = e.id_evento
            INNER JOIN ordenes o ON od.id_orden = o.id_orden
            LEFT JOIN (
                SELECT p1.*
                FROM pagos p1
                INNER JOIN (
                    SELECT id_orden, MAX(id_pago) AS max_id_pago
                    FROM pagos
                    GROUP BY id_orden
                ) p2 ON p1.id_orden = p2.id_orden AND p1.id_pago = p2.max_id_pago
            ) up ON up.id_orden = o.id_orden
            WHERE o.estado = 'pagada' OR up.estado = 'aprobado'
            GROUP BY e.id_evento, e.titulo
            ORDER BY total_generado DESC, e.titulo ASC
        `);

        res.json(rows);
    } catch (error) {
        console.error('Error en /ventas-por-evento:', error);
        res.status(500).json({ error: 'Error obteniendo ventas por evento' });
    }
});

// =============================
// 6. CONTROL DE STOCK
// =============================
router.get('/stock', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                e.titulo AS evento,
                te.nombre AS tipo_entrada,
                te.stock_total,
                te.stock_disponible,
                (te.stock_total - te.stock_disponible) AS vendidos,
                CASE
                    WHEN te.stock_disponible <= 0 THEN 'agotado'
                    ELSE te.estado
                END AS estado
            FROM tipos_entrada te
            INNER JOIN eventos e ON te.id_evento = e.id_evento
            ORDER BY e.fecha_evento DESC, te.nombre ASC
        `);

        res.json(rows);
    } catch (error) {
        console.error('Error en /stock:', error);
        res.status(500).json({ error: 'Error obteniendo stock' });
    }
});

// =============================
// 7. ESTADO DE PAGOS
// =============================
router.get('/pagos', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                o.codigo_orden,
                o.estado AS estado_orden,
                p.proveedor_pago,
                p.estado,
                p.monto,
                p.fecha_pago,
                p.fecha_creacion
            FROM pagos p
            INNER JOIN ordenes o ON p.id_orden = o.id_orden
            ORDER BY p.fecha_creacion DESC, p.id_pago DESC
        `);

        res.json(rows);
    } catch (error) {
        console.error('Error en /pagos:', error);
        res.status(500).json({ error: 'Error obteniendo pagos' });
    }
});

module.exports = router;