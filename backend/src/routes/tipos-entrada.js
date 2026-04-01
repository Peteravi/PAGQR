const express = require('express');
const router = express.Router();
const db = require('../config/db');


// =========================
// 🟢 OBTENER TIPOS POR ID DE EVENTO
// =========================
router.get('/evento/:id_evento', async (req, res) => {
    const id_evento = req.params.id_evento;
    try {
        const [rows] = await db.execute(
            `SELECT * FROM tipos_entrada WHERE id_evento = ? ORDER BY nombre`,
            [id_evento]
        );
        res.json(rows);
    } catch (error) {
        console.error('❌ Error al obtener tipos por evento:', error);
        res.status(500).json({ ok: false, message: error.message });
    }
});


// =========================
// 🟢 CREAR TIPO DE ENTRADA
// =========================
router.post('/', async (req, res) => {
    const { nombre, precio, descripcion, stock_total, stock_disponible, estado, id_evento } = req.body;

    if (!nombre || precio === undefined || stock_total === undefined || stock_disponible === undefined || !id_evento) {
        return res.status(400).json({ ok: false, message: 'Faltan campos obligatorios' });
    }

    if (stock_disponible > stock_total) {
        return res.status(400).json({ ok: false, message: 'El stock disponible no puede ser mayor al stock total' });
    }

    try {
        // Verificar que el evento exista
        const [evento] = await db.execute(`SELECT id_evento FROM eventos WHERE id_evento = ?`, [id_evento]);
        if (evento.length === 0) {
            return res.status(404).json({ ok: false, message: 'Evento no encontrado' });
        }

        const sql = `
            INSERT INTO tipos_entrada (nombre, precio, descripcion, stock_total, stock_disponible, estado, id_evento)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await db.execute(sql, [
            nombre,
            precio,
            descripcion || null,
            stock_total,
            stock_disponible,
            estado || 'activo',
            id_evento
        ]);

        res.json({ ok: true, id_tipo_entrada: result.insertId });
    } catch (error) {
        console.error('❌ Error al crear tipo de entrada:', error);
        res.status(500).json({ ok: false, message: error.message });
    }
});

// =========================
// 🔵 LISTAR TODOS LOS TIPOS (opcional)
// =========================
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT t.*, e.titulo as evento_titulo
            FROM tipos_entrada t
            JOIN eventos e ON t.id_evento = e.id_evento
            ORDER BY e.fecha_evento DESC, t.nombre
        `);
        res.json(rows);
    } catch (error) {
        console.error('❌ Error al listar tipos:', error);
        res.status(500).json({ ok: false });
    }
});

// =========================
// 🟠 OBTENER UN TIPO POR ID
// =========================
router.get('/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const [rows] = await db.execute(`SELECT * FROM tipos_entrada WHERE id_tipo_entrada = ?`, [id]);
        if (rows.length === 0) {
            return res.status(404).json({ ok: false, message: 'Tipo no encontrado' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('❌ Error al obtener tipo:', error);
        res.status(500).json({ ok: false });
    }
});

// =========================
// 🟡 EDITAR TIPO DE ENTRADA
// =========================
router.put('/:id', async (req, res) => {
    const id = req.params.id;
    const { nombre, precio, descripcion, stock_total, stock_disponible, estado, id_evento } = req.body;

    if (!nombre || precio === undefined || stock_total === undefined || stock_disponible === undefined || !id_evento) {
        return res.status(400).json({ ok: false, message: 'Faltan campos obligatorios' });
    }

    if (stock_disponible > stock_total) {
        return res.status(400).json({ ok: false, message: 'El stock disponible no puede ser mayor al stock total' });
    }

    try {
        // Verificar que el tipo exista y pertenezca al evento
        const [tipoActual] = await db.execute(
            `SELECT id_evento FROM tipos_entrada WHERE id_tipo_entrada = ?`,
            [id]
        );
        if (tipoActual.length === 0) {
            return res.status(404).json({ ok: false, message: 'Tipo no encontrado' });
        }
        if (tipoActual[0].id_evento !== id_evento) {
            return res.status(400).json({ ok: false, message: 'El tipo no pertenece al evento indicado' });
        }

        const sql = `
            UPDATE tipos_entrada SET
                nombre = ?,
                precio = ?,
                descripcion = ?,
                stock_total = ?,
                stock_disponible = ?,
                estado = ?
            WHERE id_tipo_entrada = ?
        `;
        const [result] = await db.execute(sql, [
            nombre,
            precio,
            descripcion || null,
            stock_total,
            stock_disponible,
            estado || 'activo',
            id
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ ok: false, message: 'Tipo no encontrado' });
        }

        res.json({ ok: true });
    } catch (error) {
        console.error('❌ Error al editar tipo:', error);
        res.status(500).json({ ok: false, message: error.message });
    }
});

// =========================
// 🔴 ELIMINAR TIPO DE ENTRADA (solo si no tiene órdenes asociadas)
// =========================
router.delete('/:id', async (req, res) => {
    const id = req.params.id;

    try {
        // Verificar si existen órdenes que usen este tipo
        const [ordenes] = await db.execute(
            `SELECT COUNT(*) as total FROM orden_detalle WHERE id_tipo_entrada = ?`,
            [id]
        );
        if (ordenes[0].total > 0) {
            return res.status(400).json({
                ok: false,
                message: 'No se puede eliminar el tipo porque tiene órdenes asociadas'
            });
        }

        const [result] = await db.execute(`DELETE FROM tipos_entrada WHERE id_tipo_entrada = ?`, [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ ok: false, message: 'Tipo no encontrado' });
        }

        res.json({ ok: true });
    } catch (error) {
        console.error('❌ Error al eliminar tipo:', error);
        res.status(500).json({ ok: false, message: error.message });
    }
});

module.exports = router;