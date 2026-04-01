const express = require('express');
const router = express.Router();
const db = require('../config/db');

// =============================
// 1. RESUMEN GENERAL DE VENTAS
// =============================
router.get('/resumen', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                COUNT(*) as total_ordenes,
                IFNULL(SUM(total), 0) as total_vendido,
                IFNULL(SUM(CASE WHEN estado = 'pagada' THEN total ELSE 0 END), 0) as ingresos_reales,
                SUM(CASE WHEN estado = 'fallida' THEN 1 ELSE 0 END) as ventas_fallidas
            FROM ordenes
        `);

        res.json(rows[0]);
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
                CONCAT(c.nombres, ' ', c.apellidos) as cliente,
                o.total,
                o.estado,
                o.metodo_pago,
                o.fecha_creacion
            FROM ordenes o
            JOIN clientes c ON o.id_cliente = c.id_cliente
            ORDER BY o.fecha_creacion DESC
        `);

        res.json(rows);
    } catch (error) {
        console.error('Error en /ordenes:', error);
        res.status(500).json({ error: 'Error obteniendo órdenes' });
    }
});


// =============================
// 3. DETALLE DE UNA ORDEN
// =============================
router.get('/ordenes/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [detalle] = await db.query(`
            SELECT 
                e.titulo as evento,
                te.nombre as tipo_entrada,
                od.cantidad,
                od.precio_unitario,
                od.subtotal
            FROM orden_detalle od
            JOIN tipos_entrada te ON od.id_tipo_entrada = te.id_tipo_entrada
            JOIN eventos e ON te.id_evento = e.id_evento
            WHERE od.id_orden = ?
        `, [id]);

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
                DATE(fecha_creacion) as fecha,
                SUM(total) as total_dia
            FROM ordenes
            WHERE estado = 'pagada'
            GROUP BY DATE(fecha_creacion)
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
                SUM(od.cantidad) as entradas_vendidas,
                SUM(od.subtotal) as total_generado
            FROM orden_detalle od
            JOIN tipos_entrada te ON od.id_tipo_entrada = te.id_tipo_entrada
            JOIN eventos e ON te.id_evento = e.id_evento
            JOIN ordenes o ON od.id_orden = o.id_orden
            WHERE o.estado = 'pagada'
            GROUP BY e.id_evento
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
                e.titulo as evento,
                te.nombre as tipo_entrada,
                te.stock_total,
                te.stock_disponible,
                (te.stock_total - te.stock_disponible) as vendidos,
                te.estado
            FROM tipos_entrada te
            JOIN eventos e ON te.id_evento = e.id_evento
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
                p.proveedor_pago,
                p.estado,
                p.monto,
                p.fecha_pago
            FROM pagos p
            JOIN ordenes o ON p.id_orden = o.id_orden
            ORDER BY p.fecha_creacion DESC
        `);

        res.json(rows);
    } catch (error) {
        console.error('Error en /pagos:', error);
        res.status(500).json({ error: 'Error obteniendo pagos' });
    }
});


module.exports = router;