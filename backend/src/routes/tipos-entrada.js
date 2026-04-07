const express = require('express');
const router = express.Router();
const db = require('../config/db');

// =========================
// HELPERS
// =========================
function isPositiveInteger(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0;
}

function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
}

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function isValidEstado(value) {
    const estadosPermitidos = ['activo', 'inactivo', 'agotado'];
    return estadosPermitidos.includes(String(value || '').trim().toLowerCase());
}

function sanitizeNullableString(value, maxLength = 1000) {
    if (value === undefined || value === null) return null;
    const str = String(value).trim();
    if (!str) return null;
    return str.length > maxLength ? str.slice(0, maxLength) : str;
}

function validarPayloadTipo(body) {
    const errores = [];

    const nombre = normalizeString(body.nombre);
    const precio = toNumber(body.precio);
    const descripcion = sanitizeNullableString(body.descripcion, 1000);
    const stock_total = toNumber(body.stock_total);
    const stock_disponible = toNumber(body.stock_disponible);
    const estado = normalizeString(body.estado || 'activo').toLowerCase();
    const id_evento = toNumber(body.id_evento);

    if (!nombre) errores.push('El nombre es obligatorio');
    if (!isPositiveInteger(id_evento)) errores.push('El id_evento es inválido');
    if (!Number.isFinite(precio) || precio < 0) errores.push('El precio no es válido');
    if (!Number.isInteger(stock_total) || stock_total < 0) errores.push('El stock_total no es válido');
    if (!Number.isInteger(stock_disponible) || stock_disponible < 0) errores.push('El stock_disponible no es válido');
    if (stock_disponible > stock_total) errores.push('El stock disponible no puede ser mayor al stock total');
    if (!isValidEstado(estado)) errores.push('El estado no es válido');

    if (nombre && nombre.length > 150) {
        errores.push('El nombre excede la longitud permitida');
    }

    return {
        errores,
        data: {
            nombre,
            precio,
            descripcion,
            stock_total,
            stock_disponible,
            estado,
            id_evento
        }
    };
}

// =========================
// 🟢 OBTENER TIPOS POR ID DE EVENTO
// =========================
router.get('/evento/:id_evento', async (req, res) => {
    try {
        const { id_evento } = req.params;

        if (!isPositiveInteger(id_evento)) {
            return res.status(400).json({
                ok: false,
                message: 'El id_evento es inválido'
            });
        }

        const [rows] = await db.execute(
            `SELECT * FROM tipos_entrada WHERE id_evento = ? ORDER BY nombre`,
            [Number(id_evento)]
        );

        return res.json(rows);
    } catch (error) {
        console.error('❌ Error al obtener tipos por evento:', error);
        return res.status(500).json({
            ok: false,
            message: 'Error interno al obtener tipos por evento'
        });
    }
});

// =========================
// 🟢 CREAR TIPO DE ENTRADA
// =========================
router.post('/', async (req, res) => {
    try {
        const { errores, data } = validarPayloadTipo(req.body || {});

        if (errores.length > 0) {
            return res.status(400).json({
                ok: false,
                message: errores[0],
                errors: errores
            });
        }

        // Verificar que el evento exista
        const [evento] = await db.execute(
            `SELECT id_evento FROM eventos WHERE id_evento = ? LIMIT 1`,
            [data.id_evento]
        );

        if (evento.length === 0) {
            return res.status(404).json({
                ok: false,
                message: 'Evento no encontrado'
            });
        }

        const sql = `
            INSERT INTO tipos_entrada (
                nombre,
                precio,
                descripcion,
                stock_total,
                stock_disponible,
                estado,
                id_evento
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        const [result] = await db.execute(sql, [
            data.nombre,
            data.precio,
            data.descripcion,
            data.stock_total,
            data.stock_disponible,
            data.estado || 'activo',
            data.id_evento
        ]);

        return res.json({
            ok: true,
            id_tipo_entrada: result.insertId
        });
    } catch (error) {
        console.error('❌ Error al crear tipo de entrada:', error);
        return res.status(500).json({
            ok: false,
            message: 'Error interno al crear tipo de entrada'
        });
    }
});

// =========================
// 🔵 LISTAR TODOS LOS TIPOS
// =========================
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT t.*, e.titulo as evento_titulo
            FROM tipos_entrada t
            JOIN eventos e ON t.id_evento = e.id_evento
            ORDER BY e.fecha_evento DESC, t.nombre
        `);

        return res.json(rows);
    } catch (error) {
        console.error('❌ Error al listar tipos:', error);
        return res.status(500).json({
            ok: false,
            message: 'Error interno al listar tipos'
        });
    }
});

// =========================
// 🟠 OBTENER UN TIPO POR ID
// =========================
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                ok: false,
                message: 'El id del tipo es inválido'
            });
        }

        const [rows] = await db.execute(
            `SELECT * FROM tipos_entrada WHERE id_tipo_entrada = ?`,
            [Number(id)]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                ok: false,
                message: 'Tipo no encontrado'
            });
        }

        return res.json(rows[0]);
    } catch (error) {
        console.error('❌ Error al obtener tipo:', error);
        return res.status(500).json({
            ok: false,
            message: 'Error interno al obtener tipo'
        });
    }
});

// =========================
// 🟡 EDITAR TIPO DE ENTRADA
// =========================
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                ok: false,
                message: 'El id del tipo es inválido'
            });
        }

        const { errores, data } = validarPayloadTipo(req.body || {});

        if (errores.length > 0) {
            return res.status(400).json({
                ok: false,
                message: errores[0],
                errors: errores
            });
        }

        // Verificar que el tipo exista y pertenezca al evento indicado
        const [tipoActual] = await db.execute(
            `SELECT id_evento FROM tipos_entrada WHERE id_tipo_entrada = ? LIMIT 1`,
            [Number(id)]
        );

        if (tipoActual.length === 0) {
            return res.status(404).json({
                ok: false,
                message: 'Tipo no encontrado'
            });
        }

        if (Number(tipoActual[0].id_evento) !== Number(data.id_evento)) {
            return res.status(400).json({
                ok: false,
                message: 'El tipo no pertenece al evento indicado'
            });
        }

        // Verificar que el evento siga existiendo
        const [evento] = await db.execute(
            `SELECT id_evento FROM eventos WHERE id_evento = ? LIMIT 1`,
            [data.id_evento]
        );

        if (evento.length === 0) {
            return res.status(404).json({
                ok: false,
                message: 'Evento no encontrado'
            });
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
            data.nombre,
            data.precio,
            data.descripcion,
            data.stock_total,
            data.stock_disponible,
            data.estado || 'activo',
            Number(id)
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({
                ok: false,
                message: 'Tipo no encontrado'
            });
        }

        return res.json({ ok: true });
    } catch (error) {
        console.error('❌ Error al editar tipo:', error);
        return res.status(500).json({
            ok: false,
            message: 'Error interno al editar tipo'
        });
    }
});

// =========================
// 🔴 ELIMINAR TIPO DE ENTRADA (solo si no tiene órdenes asociadas)
// =========================
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                ok: false,
                message: 'El id del tipo es inválido'
            });
        }

        // Verificar si existen órdenes que usen este tipo
        const [ordenes] = await db.execute(
            `SELECT COUNT(*) as total FROM orden_detalle WHERE id_tipo_entrada = ?`,
            [Number(id)]
        );

        if (Number(ordenes[0].total) > 0) {
            return res.status(400).json({
                ok: false,
                message: 'No se puede eliminar el tipo porque tiene órdenes asociadas'
            });
        }

        const [result] = await db.execute(
            `DELETE FROM tipos_entrada WHERE id_tipo_entrada = ?`,
            [Number(id)]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                ok: false,
                message: 'Tipo no encontrado'
            });
        }

        return res.json({ ok: true });
    } catch (error) {
        console.error('❌ Error al eliminar tipo:', error);
        return res.status(500).json({
            ok: false,
            message: 'Error interno al eliminar tipo'
        });
    }
});

module.exports = router;