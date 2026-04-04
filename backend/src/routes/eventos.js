const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// =========================
// RUTA ÚNICA Y DEFINITIVA DE IMÁGENES
// =========================
const uploadsBaseDir = path.join(__dirname, '../../../frontend/public/uploads');
const uploadDir = path.join(uploadsBaseDir, 'eventos');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('📁 Directorio de imágenes creado:', uploadDir);
}

// =========================
// HELPERS
// =========================
function limpiarNombreArchivo(nombre) {
    const ext = path.extname(nombre).toLowerCase();
    const base = path.basename(nombre, ext);

    const limpio = base
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9-_ ]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .toLowerCase();

    return `${limpio || 'imagen'}${ext}`;
}

function obtenerNombreDisponible(directorio, nombreOriginal) {
    const ext = path.extname(nombreOriginal);
    const base = path.basename(nombreOriginal, ext);

    let nombreFinal = nombreOriginal;
    let contador = 1;

    while (fs.existsSync(path.join(directorio, nombreFinal))) {
        nombreFinal = `${base}-${contador}${ext}`;
        contador++;
    }

    return nombreFinal;
}

function eliminarArchivoSiExiste(rutaPublica) {
    try {
        if (!rutaPublica || !rutaPublica.startsWith('/uploads/')) return;

        const rutaRelativa = rutaPublica.replace(/^\/uploads\//, '');
        const rutaFisica = path.join(uploadsBaseDir, rutaRelativa);

        if (fs.existsSync(rutaFisica)) {
            fs.unlinkSync(rutaFisica);
            console.log('🗑️ Archivo eliminado:', rutaFisica);
        }
    } catch (error) {
        console.error('❌ Error eliminando archivo anterior:', error.message);
    }
}

// =========================
// MULTER
// =========================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const nombreLimpio = limpiarNombreArchivo(file.originalname);
        const nombreDisponible = obtenerNombreDisponible(uploadDir, nombreLimpio);
        cb(null, nombreDisponible);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        }

        cb(new Error('Solo se permiten imágenes: jpeg, jpg, png, gif, webp'));
    }
}).single('imagen');

// =========================
// CREAR EVENTO
// =========================
router.post('/', upload, async (req, res) => {
    try {
        let imagenUrl = null;

        if (req.file) {
            imagenUrl = `/uploads/eventos/${req.file.filename}`;
        }

        const {
            titulo,
            descripcion,
            categoria,
            lugar,
            direccion,
            ciudad,
            fecha_evento,
            fecha_fin_evento,
            organizador,
            estado,
            precio
        } = req.body;

        if (!titulo || !lugar || !fecha_evento) {
            return res.status(400).json({
                ok: false,
                message: 'Faltan campos obligatorios: título, lugar y fecha inicio'
            });
        }

        let precioNum = parseFloat(precio);
        if (isNaN(precioNum)) precioNum = 0.00;

        const sql = `
            INSERT INTO eventos (
                titulo,
                descripcion,
                categoria,
                lugar,
                direccion,
                ciudad,
                fecha_evento,
                fecha_fin_evento,
                imagen_url,
                organizador,
                estado,
                precio,
                fecha_creacion,
                fecha_actualizacion
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `;

        const [result] = await db.execute(sql, [
            titulo,
            descripcion || null,
            categoria || null,
            lugar,
            direccion || null,
            ciudad || null,
            fecha_evento,
            fecha_fin_evento || null,
            imagenUrl,
            organizador || null,
            estado || 'borrador',
            precioNum
        ]);

        return res.json({
            ok: true,
            id_evento: result.insertId,
            imagen_url: imagenUrl
        });
    } catch (error) {
        console.error('❌ ERROR CREAR EVENTO:', error);
        return res.status(500).json({
            ok: false,
            message: error.message || 'Error al crear evento'
        });
    }
});

// =========================
// LISTAR EVENTOS
// =========================
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT * FROM eventos
            ORDER BY fecha_evento DESC
        `);

        return res.json(rows);
    } catch (error) {
        console.error('❌ ERROR LISTAR EVENTOS:', error);
        return res.status(500).json({
            ok: false,
            message: 'Error al listar eventos'
        });
    }
});

// =========================
// OBTENER EVENTO POR ID
// =========================
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await db.execute(
            `SELECT * FROM eventos WHERE id_evento = ?`,
            [id]
        );

        if (!rows.length) {
            return res.status(404).json({
                ok: false,
                message: 'Evento no encontrado'
            });
        }

        return res.json(rows[0]);
    } catch (error) {
        console.error('❌ ERROR OBTENER EVENTO:', error);
        return res.status(500).json({
            ok: false,
            message: 'Error al obtener evento'
        });
    }
});

// =========================
// TIPOS DE ENTRADA POR EVENTO
// =========================
router.get('/:id/tipos', async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await db.execute(
            `
            SELECT
                id_tipo_entrada,
                nombre,
                precio,
                stock_disponible,
                stock_total,
                estado
            FROM tipos_entrada
            WHERE id_evento = ?
            ORDER BY id_tipo_entrada ASC
            `,
            [id]
        );

        return res.json(rows);
    } catch (error) {
        console.error('❌ ERROR OBTENER TIPOS:', error);
        return res.status(500).json({
            ok: false,
            message: 'Error al obtener tipos de entrada'
        });
    }
});

// =========================
// EDITAR EVENTO
// =========================
router.put('/:id', upload, async (req, res) => {
    try {
        const { id } = req.params;

        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({
                ok: false,
                message: 'No se recibieron datos del formulario'
            });
        }

        const [eventoRows] = await db.execute(
            `SELECT * FROM eventos WHERE id_evento = ?`,
            [id]
        );

        if (!eventoRows.length) {
            return res.status(404).json({
                ok: false,
                message: 'Evento no encontrado'
            });
        }

        const eventoActual = eventoRows[0];
        let imagenUrl = eventoActual.imagen_url || null;

        if (req.file) {
            eliminarArchivoSiExiste(imagenUrl);
            imagenUrl = `/uploads/eventos/${req.file.filename}`;
        }

        const {
            titulo,
            descripcion,
            categoria,
            lugar,
            direccion,
            ciudad,
            fecha_evento,
            fecha_fin_evento,
            organizador,
            estado,
            precio
        } = req.body;

        if (!titulo || !lugar || !fecha_evento) {
            return res.status(400).json({
                ok: false,
                message: 'Título, lugar y fecha inicio son obligatorios'
            });
        }

        let precioNum = parseFloat(precio);
        if (isNaN(precioNum)) precioNum = 0.00;

        const sql = `
            UPDATE eventos SET
                titulo = ?,
                descripcion = ?,
                categoria = ?,
                lugar = ?,
                direccion = ?,
                ciudad = ?,
                fecha_evento = ?,
                fecha_fin_evento = ?,
                imagen_url = ?,
                organizador = ?,
                estado = ?,
                precio = ?,
                fecha_actualizacion = NOW()
            WHERE id_evento = ?
        `;

        await db.execute(sql, [
            titulo,
            descripcion || null,
            categoria || null,
            lugar,
            direccion || null,
            ciudad || null,
            fecha_evento,
            fecha_fin_evento || null,
            imagenUrl,
            organizador || null,
            estado || 'borrador',
            precioNum,
            id
        ]);

        return res.json({
            ok: true,
            message: 'Evento actualizado correctamente',
            imagen_url: imagenUrl
        });
    } catch (error) {
        console.error('❌ ERROR ACTUALIZAR EVENTO:', error);
        return res.status(500).json({
            ok: false,
            message: error.message || 'Error al actualizar evento'
        });
    }
});

// =========================
// ELIMINAR EVENTO
// =========================
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const [eventoRows] = await db.execute(
            `SELECT imagen_url FROM eventos WHERE id_evento = ?`,
            [id]
        );

        if (!eventoRows.length) {
            return res.status(404).json({
                ok: false,
                message: 'Evento no encontrado'
            });
        }

        eliminarArchivoSiExiste(eventoRows[0].imagen_url);

        await db.execute(`DELETE FROM eventos WHERE id_evento = ?`, [id]);

        return res.json({
            ok: true,
            message: 'Evento eliminado correctamente'
        });
    } catch (error) {
        console.error('❌ ERROR ELIMINAR EVENTO:', error);
        return res.status(500).json({
            ok: false,
            message: error.message || 'Error al eliminar evento'
        });
    }
});

// =========================
// MANEJO DE ERROR DE MULTER
// =========================
router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({
            ok: false,
            message: err.message
        });
    }

    if (err) {
        return res.status(400).json({
            ok: false,
            message: err.message
        });
    }

    next();
});

module.exports = router;