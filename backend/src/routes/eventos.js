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

function isPositiveInteger(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0;
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function parsePrice(value) {
    if (value === undefined || value === null || value === '') return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
}

function isValidDateInput(value) {
    if (!isNonEmptyString(value)) return false;
    const date = new Date(value);
    return !Number.isNaN(date.getTime());
}

function validateEstado(value) {
    const estadosPermitidos = ['borrador', 'publicado', 'agotado', 'cancelado', 'finalizado'];
    return estadosPermitidos.includes(String(value || '').trim().toLowerCase());
}

function sanitizeNullableString(value, maxLength = 255) {
    if (value === undefined || value === null) return null;
    const str = String(value).trim();
    if (!str) return null;
    return str.length > maxLength ? str.slice(0, maxLength) : str;
}

function validarCamposEvento(data) {
    const errores = [];

    const titulo = normalizeString(data.titulo);
    const lugar = normalizeString(data.lugar);
    const fecha_evento = normalizeString(data.fecha_evento);
    const fecha_fin_evento = normalizeString(data.fecha_fin_evento);
    const estado = normalizeString(data.estado || 'borrador').toLowerCase();
    const precioNum = parsePrice(data.precio);

    if (!titulo) errores.push('El título es obligatorio');
    if (!lugar) errores.push('El lugar es obligatorio');
    if (!fecha_evento) errores.push('La fecha de inicio es obligatoria');

    if (titulo && titulo.length > 255) errores.push('El título excede la longitud permitida');
    if (data.descripcion && String(data.descripcion).length > 5000) errores.push('La descripción excede la longitud permitida');
    if (data.categoria && String(data.categoria).length > 100) errores.push('La categoría excede la longitud permitida');
    if (lugar && lugar.length > 255) errores.push('El lugar excede la longitud permitida');
    if (data.direccion && String(data.direccion).length > 255) errores.push('La dirección excede la longitud permitida');
    if (data.ciudad && String(data.ciudad).length > 100) errores.push('La ciudad excede la longitud permitida');
    if (data.organizador && String(data.organizador).length > 255) errores.push('El organizador excede la longitud permitida');

    if (fecha_evento && !isValidDateInput(fecha_evento)) {
        errores.push('La fecha de inicio no es válida');
    }

    if (fecha_fin_evento && !isValidDateInput(fecha_fin_evento)) {
        errores.push('La fecha de fin no es válida');
    }

    if (fecha_evento && fecha_fin_evento && isValidDateInput(fecha_evento) && isValidDateInput(fecha_fin_evento)) {
        const inicio = new Date(fecha_evento).getTime();
        const fin = new Date(fecha_fin_evento).getTime();

        if (fin < inicio) {
            errores.push('La fecha de fin no puede ser menor que la fecha de inicio');
        }
    }

    if (!validateEstado(estado)) {
        errores.push('El estado del evento no es válido');
    }

    if (Number.isNaN(precioNum) || precioNum < 0) {
        errores.push('El precio del evento no es válido');
    }

    return {
        errores,
        dataNormalizada: {
            titulo,
            descripcion: sanitizeNullableString(data.descripcion, 5000),
            categoria: sanitizeNullableString(data.categoria, 100),
            lugar,
            direccion: sanitizeNullableString(data.direccion, 255),
            ciudad: sanitizeNullableString(data.ciudad, 100),
            fecha_evento,
            fecha_fin_evento: fecha_fin_evento || null,
            organizador: sanitizeNullableString(data.organizador, 255),
            estado,
            precio: Number.isNaN(precioNum) ? 0 : precioNum,
            payphone_app_id: sanitizeNullableString(data.payphone_app_id, 255),
            payphone_token: sanitizeNullableString(data.payphone_token, 1000)
        }
    };
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

        const { errores, dataNormalizada } = validarCamposEvento(req.body || {});

        if (errores.length > 0) {
            if (req.file) {
                eliminarArchivoSiExiste(imagenUrl);
            }

            return res.status(400).json({
                ok: false,
                message: errores[0],
                errors: errores
            });
        }

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
                payphone_app_id,
                payphone_token,
                fecha_creacion,
                fecha_actualizacion
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `;

        const [result] = await db.execute(sql, [
            dataNormalizada.titulo,
            dataNormalizada.descripcion,
            dataNormalizada.categoria,
            dataNormalizada.lugar,
            dataNormalizada.direccion,
            dataNormalizada.ciudad,
            dataNormalizada.fecha_evento,
            dataNormalizada.fecha_fin_evento,
            imagenUrl,
            dataNormalizada.organizador,
            dataNormalizada.estado || 'borrador',
            dataNormalizada.precio,
            dataNormalizada.payphone_app_id,
            dataNormalizada.payphone_token
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
            message: 'Error al crear evento'
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

        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                ok: false,
                message: 'El id del evento es inválido'
            });
        }

        const [rows] = await db.execute(
            `SELECT * FROM eventos WHERE id_evento = ?`,
            [Number(id)]
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

        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                ok: false,
                message: 'El id del evento es inválido'
            });
        }

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
            [Number(id)]
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

        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                ok: false,
                message: 'El id del evento es inválido'
            });
        }

        if (!req.body || Object.keys(req.body).length === 0) {
            if (req.file) {
                eliminarArchivoSiExiste(`/uploads/eventos/${req.file.filename}`);
            }

            return res.status(400).json({
                ok: false,
                message: 'No se recibieron datos del formulario'
            });
        }

        const [eventoRows] = await db.execute(
            `SELECT * FROM eventos WHERE id_evento = ?`,
            [Number(id)]
        );

        if (!eventoRows.length) {
            if (req.file) {
                eliminarArchivoSiExiste(`/uploads/eventos/${req.file.filename}`);
            }

            return res.status(404).json({
                ok: false,
                message: 'Evento no encontrado'
            });
        }

        const eventoActual = eventoRows[0];
        let imagenUrl = eventoActual.imagen_url || null;
        const imagenAnterior = eventoActual.imagen_url || null;

        if (req.file) {
            imagenUrl = `/uploads/eventos/${req.file.filename}`;
        }

        const { errores, dataNormalizada } = validarCamposEvento(req.body || {});

        if (errores.length > 0) {
            if (req.file) {
                eliminarArchivoSiExiste(imagenUrl);
            }

            return res.status(400).json({
                ok: false,
                message: errores[0],
                errors: errores
            });
        }

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
                payphone_app_id = ?,
                payphone_token = ?,
                fecha_actualizacion = NOW()
            WHERE id_evento = ?
        `;

        await db.execute(sql, [
            dataNormalizada.titulo,
            dataNormalizada.descripcion,
            dataNormalizada.categoria,
            dataNormalizada.lugar,
            dataNormalizada.direccion,
            dataNormalizada.ciudad,
            dataNormalizada.fecha_evento,
            dataNormalizada.fecha_fin_evento,
            imagenUrl,
            dataNormalizada.organizador,
            dataNormalizada.estado || 'borrador',
            dataNormalizada.precio,
            dataNormalizada.payphone_app_id,
            dataNormalizada.payphone_token,
            Number(id)
        ]);

        if (req.file && imagenAnterior && imagenAnterior !== imagenUrl) {
            eliminarArchivoSiExiste(imagenAnterior);
        }

        return res.json({
            ok: true,
            message: 'Evento actualizado correctamente',
            imagen_url: imagenUrl
        });
    } catch (error) {
        console.error('❌ ERROR ACTUALIZAR EVENTO:', error);

        if (req.file) {
            eliminarArchivoSiExiste(`/uploads/eventos/${req.file.filename}`);
        }

        return res.status(500).json({
            ok: false,
            message: 'Error al actualizar evento'
        });
    }
});

// =========================
// ELIMINAR EVENTO
// =========================
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                ok: false,
                message: 'El id del evento es inválido'
            });
        }

        const [eventoRows] = await db.execute(
            `SELECT imagen_url FROM eventos WHERE id_evento = ?`,
            [Number(id)]
        );

        if (!eventoRows.length) {
            return res.status(404).json({
                ok: false,
                message: 'Evento no encontrado'
            });
        }

        eliminarArchivoSiExiste(eventoRows[0].imagen_url);

        await db.execute(`DELETE FROM eventos WHERE id_evento = ?`, [Number(id)]);

        return res.json({
            ok: true,
            message: 'Evento eliminado correctamente'
        });
    } catch (error) {
        console.error('❌ ERROR ELIMINAR EVENTO:', error);
        return res.status(500).json({
            ok: false,
            message: 'Error al eliminar evento'
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
            message: err.message || 'Error en la carga del archivo'
        });
    }

    next();
});

module.exports = router;