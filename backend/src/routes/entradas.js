const express = require('express');
const QRCode = require('qrcode');
const router = express.Router();
const db = require('../config/db');

function toIsoSafe(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function cleanText(value = '') {
    return String(value).trim();
}

function cleanEmail(value = '') {
    return cleanText(value).toLowerCase();
}

function cleanDocumento(value = '') {
    return cleanText(value).replace(/\s+/g, '');
}

async function mapEntrada(row) {
    const qrText = row.codigo_qr || row.codigo_entrada;

    return {
        id_entrada: row.id_entrada,
        codigo: row.codigo_entrada,
        qr_text: qrText,
        qr_image: await QRCode.toDataURL(qrText, {
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
        comprador: {
            nombres: row.nombres,
            apellidos: row.apellidos,
            email: row.email,
            telefono: row.telefono,
            documento: row.cedula_ruc,
            direccion: row.cliente_direccion
        },
        asistente: {
            nombre: row.nombre_asistente,
            email: row.email_asistente
        },
        tipo: {
            id_tipo_entrada: row.id_tipo_entrada,
            nombre: row.tipo_nombre,
            precio: toNumber(row.precio_unitario ?? row.tipo_precio)
        },
        orden: {
            id_orden: row.id_orden,
            codigo_orden: row.codigo_orden,
            total: toNumber(row.orden_total),
            estado: row.estado_orden
        }
    };
}

const BASE_SQL = `
    SELECT
        en.id_entrada,
        en.id_orden,
        en.id_evento,
        en.id_tipo_entrada,
        en.codigo_entrada,
        en.codigo_qr,
        en.nombre_asistente,
        en.email_asistente,
        en.estado AS estado_entrada,
        en.fecha_generacion,
        en.fecha_uso,

        o.codigo_orden,
        o.total AS orden_total,
        o.estado AS estado_orden,

        c.nombres,
        c.apellidos,
        c.email,
        c.telefono,
        c.cedula_ruc,
        c.direccion AS cliente_direccion,

        e.titulo,
        e.fecha_evento,
        e.lugar,
        e.direccion AS evento_direccion,
        e.ciudad,
        e.imagen_url,

        te.nombre AS tipo_nombre,
        te.precio AS tipo_precio,

        od.precio_unitario
    FROM entradas en
    INNER JOIN ordenes o ON o.id_orden = en.id_orden
    INNER JOIN clientes c ON c.id_cliente = o.id_cliente
    INNER JOIN eventos e ON e.id_evento = en.id_evento
    INNER JOIN tipos_entrada te ON te.id_tipo_entrada = en.id_tipo_entrada
    LEFT JOIN orden_detalle od
        ON od.id_orden = en.id_orden
       AND od.id_tipo_entrada = en.id_tipo_entrada
`;

router.get('/', async (req, res) => {
    try {
        const email = cleanEmail(req.query.email);
        const documento = cleanDocumento(req.query.documento);

        if (!email && !documento) {
            return res.status(400).json({
                ok: false,
                message: 'Debes ingresar un correo o un documento.'
            });
        }

        const conditions = [];
        const params = [];

        if (email) {
            conditions.push(`LOWER(TRIM(c.email)) = ?`);
            params.push(email);
        }

        if (documento) {
            conditions.push(`REPLACE(TRIM(c.cedula_ruc), ' ', '') = ?`);
            params.push(documento);
        }

        const sql = `
            ${BASE_SQL}
            WHERE ${conditions.join(' AND ')}
            ORDER BY e.fecha_evento DESC, en.id_entrada DESC
            LIMIT 100
        `;

        const [rows] = await db.execute(sql, params);
        const entradas = await Promise.all(rows.map(mapEntrada));

        return res.json({
            ok: true,
            total: entradas.length,
            entradas
        });
    } catch (error) {
        console.error('❌ Error obteniendo entradas:', error);
        return res.status(500).json({
            ok: false,
            message: 'Error interno al obtener las entradas'
        });
    }
});

router.get('/codigo/:codigo', async (req, res) => {
    try {
        const { codigo } = req.params;

        const [rows] = await db.execute(
            `
            ${BASE_SQL}
            WHERE en.codigo_entrada = ?
            LIMIT 1
            `,
            [codigo]
        );

        if (!rows.length) {
            return res.status(404).json({
                ok: false,
                message: 'Entrada no encontrada'
            });
        }

        const entrada = await mapEntrada(rows[0]);

        return res.json({
            ok: true,
            entrada
        });
    } catch (error) {
        console.error('❌ Error obteniendo entrada por código:', error);
        return res.status(500).json({
            ok: false,
            message: 'Error interno al obtener la entrada'
        });
    }
});

module.exports = router;