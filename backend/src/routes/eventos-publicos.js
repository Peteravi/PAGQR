const express = require('express');
const router = express.Router();
const db = require('../config/db');

function normalizarEntero(value, fallback = 0) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : fallback;
}

// GET /api/eventos-publicos
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT
                e.id_evento,
                e.titulo,
                e.descripcion,
                e.fecha_evento,
                e.fecha_fin_evento,
                e.lugar,
                e.direccion,
                e.ciudad,
                e.categoria,
                e.imagen_url,
                e.organizador,
                e.estado,
                MIN(
                    CASE
                        WHEN te.estado = 'activo' AND te.stock_disponible > 0
                        THEN te.precio
                        ELSE NULL
                    END
                ) AS precio_desde
            FROM eventos e
            LEFT JOIN tipos_entrada te
                ON te.id_evento = e.id_evento
            WHERE e.estado = 'publicado'
            GROUP BY
                e.id_evento,
                e.titulo,
                e.descripcion,
                e.fecha_evento,
                e.fecha_fin_evento,
                e.lugar,
                e.direccion,
                e.ciudad,
                e.categoria,
                e.imagen_url,
                e.organizador,
                e.estado
            ORDER BY e.fecha_evento ASC
        `);

        res.json({
            ok: true,
            data: rows
        });
    } catch (error) {
        console.error('❌ Error obteniendo eventos públicos:', error);
        res.status(500).json({
            ok: false,
            message: 'Error al obtener eventos públicos'
        });
    }
});

// GET /api/eventos-publicos/:id
router.get('/:id', async (req, res) => {
    try {
        const idEvento = normalizarEntero(req.params.id);

        if (!idEvento) {
            return res.status(400).json({
                ok: false,
                message: 'ID de evento inválido'
            });
        }

        const [rows] = await db.execute(`
            SELECT
                e.id_evento,
                e.titulo,
                e.descripcion,
                e.fecha_evento,
                e.fecha_fin_evento,
                e.lugar,
                e.direccion,
                e.ciudad,
                e.categoria,
                e.imagen_url,
                e.organizador,
                e.estado,
                MIN(
                    CASE
                        WHEN te.estado = 'activo' AND te.stock_disponible > 0
                        THEN te.precio
                        ELSE NULL
                    END
                ) AS precio_desde
            FROM eventos e
            LEFT JOIN tipos_entrada te
                ON te.id_evento = e.id_evento
            WHERE e.id_evento = ?
              AND e.estado = 'publicado'
            GROUP BY
                e.id_evento,
                e.titulo,
                e.descripcion,
                e.fecha_evento,
                e.fecha_fin_evento,
                e.lugar,
                e.direccion,
                e.ciudad,
                e.categoria,
                e.imagen_url,
                e.organizador,
                e.estado
            LIMIT 1
        `, [idEvento]);

        if (!rows.length) {
            return res.status(404).json({
                ok: false,
                message: 'Evento no encontrado o no disponible públicamente'
            });
        }

        res.json({
            ok: true,
            data: rows[0]
        });
    } catch (error) {
        console.error('❌ Error obteniendo detalle público del evento:', error);
        res.status(500).json({
            ok: false,
            message: 'Error al obtener el evento'
        });
    }
});

// GET /api/eventos-publicos/:id/tipos
router.get('/:id/tipos', async (req, res) => {
    try {
        const idEvento = normalizarEntero(req.params.id);

        if (!idEvento) {
            return res.status(400).json({
                ok: false,
                message: 'ID de evento inválido'
            });
        }

        const [eventoRows] = await db.execute(`
            SELECT
                id_evento,
                estado
            FROM eventos
            WHERE id_evento = ?
              AND estado = 'publicado'
            LIMIT 1
        `, [idEvento]);

        if (!eventoRows.length) {
            return res.status(404).json({
                ok: false,
                message: 'Evento no encontrado o no disponible públicamente'
            });
        }

        const [rows] = await db.execute(`
            SELECT
                te.id_tipo_entrada,
                te.id_evento,
                te.nombre,
                te.descripcion,
                te.precio,
                te.stock_total,
                te.stock_disponible,
                te.max_por_compra,
                te.fecha_inicio_venta,
                te.fecha_fin_venta,
                te.estado
            FROM tipos_entrada te
            WHERE te.id_evento = ?
              AND te.estado = 'activo'
              AND te.stock_disponible > 0
              AND (te.fecha_inicio_venta IS NULL OR te.fecha_inicio_venta <= NOW())
              AND (te.fecha_fin_venta IS NULL OR te.fecha_fin_venta >= NOW())
            ORDER BY te.precio ASC, te.id_tipo_entrada ASC
        `, [idEvento]);

        res.json({
            ok: true,
            data: rows
        });
    } catch (error) {
        console.error('❌ Error obteniendo tipos públicos:', error);
        res.status(500).json({
            ok: false,
            message: 'Error al obtener tipos de entrada'
        });
    }
});

module.exports = router;