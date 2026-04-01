const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// =========================
// Configuración de multer - Ruta absoluta
// =========================
const uploadDir = path.join(__dirname, '../../../frontend/public/uploads/eventos');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log("📁 Directorio creado:", uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `evento-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes (jpeg, jpg, png, gif, webp)'));
        }
    }
}).single('imagen');

// =========================
// 🟢 CREAR EVENTO
// =========================
router.post('/', upload, async (req, res) => {
    try {
        console.log("📥 BODY RECIBIDO:", req.body);
        console.log("📸 ARCHIVO:", req.file);

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
                message: "Faltan campos obligatorios: título, lugar y fecha inicio"
            });
        }

        let precioNum = parseFloat(precio);
        if (isNaN(precioNum)) precioNum = 0.00;

        const sql = `
            INSERT INTO eventos 
            (titulo, descripcion, categoria, lugar, direccion, ciudad, 
             fecha_evento, fecha_fin_evento, imagen_url, organizador, estado, precio,
             fecha_creacion, fecha_actualizacion)
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

        console.log("✅ Evento creado ID:", result.insertId);
        res.json({
            ok: true,
            id_evento: result.insertId
        });

    } catch (error) {
        console.error("❌ ERROR CREAR EVENTO:", error);
        res.status(500).json({ ok: false, message: error.message });
    }
});

// =========================
// 🔵 LISTAR EVENTOS
// =========================
router.get('/', async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT * FROM eventos 
            ORDER BY fecha_evento DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error("❌ ERROR LISTAR:", error);
        res.status(500).json({ ok: false });
    }
});

// =========================
// 🟠 OBTENER UN EVENTO POR ID
// =========================
router.get('/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const [rows] = await db.execute(
            `SELECT * FROM eventos WHERE id_evento = ?`,
            [id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ ok: false, message: "Evento no encontrado" });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error("❌ ERROR OBTENER EVENTO:", error);
        res.status(500).json({ ok: false });
    }
});

// =========================
// 🟡 OBTENER TIPOS DE ENTRADA DE UN EVENTO
// =========================
router.get('/:id/tipos', async (req, res) => {
    try {
        const id = req.params.id;
        const [rows] = await db.execute(
            `SELECT id_tipo_entrada, nombre, precio, stock_disponible, stock_total 
             FROM tipos_entrada 
             WHERE id_evento = ? AND estado = 'activo'`,
            [id]
        );
        res.json(rows);
    } catch (error) {
        console.error("❌ ERROR OBTENER TIPOS:", error);
        res.status(500).json({ ok: false, message: error.message });
    }
});

// =========================
// 🟡 EDITAR EVENTO
// =========================
router.put('/:id', upload, async (req, res) => {
    try {
        const id = req.params.id;
        console.log("✏️ EDITANDO ID:", id);
        console.log("📥 BODY RECIBIDO:", req.body);
        console.log("📸 ARCHIVO:", req.file);

        if (!req.body || Object.keys(req.body).length === 0) {
            return res.status(400).json({ ok: false, message: "No se recibieron datos del formulario" });
        }

        const [eventoActual] = await db.execute(
            `SELECT imagen_url FROM eventos WHERE id_evento = ?`,
            [id]
        );

        let imagenUrl = eventoActual[0]?.imagen_url || null;

        if (req.file) {
            if (imagenUrl && imagenUrl.startsWith('/uploads/')) {
                const oldPath = path.join(__dirname, '../../../frontend/public', imagenUrl);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                    console.log("🗑️ Imagen anterior eliminada:", oldPath);
                }
            }
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
                message: "Título, lugar y fecha inicio son obligatorios"
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
            estado,
            precioNum,
            id
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ ok: false, message: "Evento no existe" });
        }

        console.log("✅ Evento actualizado");
        res.json({ ok: true });

    } catch (error) {
        console.error("❌ ERROR EDITAR:", error);
        res.status(500).json({ ok: false });
    }
});

// =========================
// 🔴 ELIMINAR EVENTO
// =========================
router.delete('/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const [evento] = await db.execute(
            `SELECT imagen_url FROM eventos WHERE id_evento = ?`,
            [id]
        );
        if (evento.length > 0 && evento[0].imagen_url && evento[0].imagen_url.startsWith('/uploads/')) {
            const imagePath = path.join(__dirname, '../../../frontend/public', evento[0].imagen_url);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
                console.log("🗑️ Imagen eliminada del servidor:", imagePath);
            }
        }

        const [result] = await db.execute(
            `DELETE FROM eventos WHERE id_evento = ?`,
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ ok: false, message: "Evento no existe" });
        }

        console.log("✅ Evento eliminado");
        res.json({ ok: true });

    } catch (error) {
        console.error("❌ ERROR ELIMINAR:", error);
        res.status(500).json({ ok: false });
    }
});

module.exports = router;