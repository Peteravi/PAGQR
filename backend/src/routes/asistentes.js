const express = require('express');
const router = express.Router();
const db = require('../config/db');

function escapeLike(value = '') {
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_');
}

function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function isPositiveInteger(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0;
}

function buildFilters(query) {
    const conditions = [];
    const params = [];

    if (query.evento && query.evento !== 'todos') {
        const idEvento = Number(query.evento);
        if (Number.isFinite(idEvento) && idEvento > 0) {
            conditions.push('en.id_evento = ?');
            params.push(idEvento);
        }
    }

    if (query.estado && query.estado !== 'todos') {
        conditions.push('en.estado = ?');
        params.push(String(query.estado));
    }

    if (query.search) {
        const search = `%${escapeLike(String(query.search).trim())}%`;
        conditions.push(`
            (
                en.codigo_entrada LIKE ? ESCAPE '\\'
                OR en.codigo_qr LIKE ? ESCAPE '\\'
                OR COALESCE(en.nombre_asistente, CONCAT(c.nombres, ' ', c.apellidos)) LIKE ? ESCAPE '\\'
                OR COALESCE(en.email_asistente, c.email) LIKE ? ESCAPE '\\'
                OR c.cedula_ruc LIKE ? ESCAPE '\\'
                OR o.codigo_orden LIKE ? ESCAPE '\\'
                OR te.nombre LIKE ? ESCAPE '\\'
                OR e.titulo LIKE ? ESCAPE '\\'
            )
        `);

        params.push(
            search, search, search, search,
            search, search, search, search
        );
    }

    return {
        where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
        params
    };
}

function mapAsistente(row) {
    const nombreAsistente = row.nombre_asistente || `${row.nombres || ''} ${row.apellidos || ''}`.trim();
    const emailAsistente = row.email_asistente || row.email || '';

    return {
        id_entrada: row.id_entrada,
        codigo_entrada: row.codigo_entrada,
        codigo_qr: row.codigo_qr,
        estado: row.estado_entrada,
        fecha_generacion: row.fecha_generacion,
        fecha_uso: row.fecha_uso,
        asistente: {
            nombre: nombreAsistente,
            email: emailAsistente,
            comprador: `${row.nombres || ''} ${row.apellidos || ''}`.trim(),
            documento: row.cedula_ruc || '',
            telefono: row.telefono || ''
        },
        evento: {
            id_evento: row.id_evento,
            titulo: row.titulo,
            fecha_evento: row.fecha_evento,
            lugar: row.lugar,
            direccion: row.evento_direccion,
            ciudad: row.ciudad,
            imagen_url: row.imagen_url || null
        },
        tipo_entrada: {
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

// -------------------------------
// RESUMEN
// -------------------------------
router.get('/resumen', async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN estado = 'generada' THEN 1 ELSE 0 END) AS generadas,
                SUM(CASE WHEN estado = 'enviada' THEN 1 ELSE 0 END) AS enviadas,
                SUM(CASE WHEN estado = 'usada' THEN 1 ELSE 0 END) AS usadas,
                SUM(CASE WHEN estado = 'cancelada' THEN 1 ELSE 0 END) AS canceladas
            FROM entradas
        `);

        return res.json({
            ok: true,
            resumen: {
                total: Number(rows[0]?.total || 0),
                generadas: Number(rows[0]?.generadas || 0),
                enviadas: Number(rows[0]?.enviadas || 0),
                usadas: Number(rows[0]?.usadas || 0),
                canceladas: Number(rows[0]?.canceladas || 0)
            }
        });
    } catch (error) {
        console.error('❌ Error obteniendo resumen de asistentes:', error);
        return res.status(500).json({
            ok: false,
            message: error.message
        });
    }
});

// -------------------------------
// EVENTOS
// -------------------------------
router.get('/eventos', async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT
                e.id_evento,
                e.titulo,
                e.fecha_evento,
                e.estado,
                COUNT(en.id_entrada) AS total_asistentes
            FROM eventos e
            LEFT JOIN entradas en ON en.id_evento = e.id_evento
            GROUP BY e.id_evento, e.titulo, e.fecha_evento, e.estado
            ORDER BY e.fecha_evento DESC
        `);

        return res.json({
            ok: true,
            eventos: rows.map(r => ({
                id_evento: r.id_evento,
                titulo: r.titulo,
                fecha_evento: r.fecha_evento,
                estado: r.estado,
                total_asistentes: Number(r.total_asistentes || 0)
            }))
        });
    } catch (error) {
        console.error('❌ Error obteniendo eventos para asistentes:', error);
        return res.status(500).json({
            ok: false,
            message: error.message
        });
    }
});

// -------------------------------
// LISTADO
// -------------------------------
router.get('/', async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
        const offset = (page - 1) * limit;

        const { where, params } = buildFilters(req.query);

        const sql = `
            ${BASE_SQL}
            ${where}
            ORDER BY e.fecha_evento DESC, en.id_entrada DESC
            LIMIT ${limit} OFFSET ${offset}
        `;

        const countSql = `
            SELECT COUNT(*) AS total
            FROM entradas en
            INNER JOIN ordenes o ON o.id_orden = en.id_orden
            INNER JOIN clientes c ON c.id_cliente = o.id_cliente
            INNER JOIN eventos e ON e.id_evento = en.id_evento
            INNER JOIN tipos_entrada te ON te.id_tipo_entrada = en.id_tipo_entrada
            ${where}
        `;

        const [rows] = await db.query(sql, params);
        const [countRows] = await db.execute(countSql, params);

        const total = Number(countRows[0]?.total || 0);
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const asistentes = rows.map(mapAsistente);

        return res.json({
            ok: true,
            total,
            page,
            limit,
            total_pages: totalPages,
            asistentes
        });
    } catch (error) {
        console.error('❌ Error listando asistentes:', error);
        return res.status(500).json({
            ok: false,
            message: error.message
        });
    }
});

// -------------------------------
// EXPORT CSV
// -------------------------------
router.get('/export/csv', async (req, res) => {
    try {
        const { where, params } = buildFilters(req.query);

        const sql = `
            ${BASE_SQL}
            ${where}
            ORDER BY e.fecha_evento DESC, en.id_entrada DESC
        `;

        const [rows] = await db.execute(sql, params);

        const headers = [
            'codigo_entrada',
            'estado',
            'nombre_asistente',
            'email_asistente',
            'comprador',
            'documento',
            'telefono',
            'evento',
            'fecha_evento',
            'lugar',
            'ciudad',
            'tipo_entrada',
            'precio',
            'codigo_orden',
            'estado_orden',
            'fecha_generacion',
            'fecha_uso'
        ];

        const escapeCsv = (value) => {
            const str = value == null ? '' : String(value);
            return `"${str.replace(/"/g, '""')}"`;
        };

        const lines = [headers.join(',')];

        rows.forEach(row => {
            const nombreAsistente = row.nombre_asistente || `${row.nombres || ''} ${row.apellidos || ''}`.trim();
            const emailAsistente = row.email_asistente || row.email || '';
            const comprador = `${row.nombres || ''} ${row.apellidos || ''}`.trim();

            lines.push([
                row.codigo_entrada,
                row.estado_entrada,
                nombreAsistente,
                emailAsistente,
                comprador,
                row.cedula_ruc || '',
                row.telefono || '',
                row.titulo,
                row.fecha_evento,
                row.lugar,
                row.ciudad || '',
                row.tipo_nombre,
                toNumber(row.precio_unitario ?? row.tipo_precio).toFixed(2),
                row.codigo_orden,
                row.estado_orden,
                row.fecha_generacion,
                row.fecha_uso || ''
            ].map(escapeCsv).join(','));
        });

        const csvContent = '\uFEFF' + lines.join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="asistentes.csv"');

        return res.send(csvContent);
    } catch (error) {
        console.error('❌ Error exportando asistentes CSV:', error);
        return res.status(500).json({
            ok: false,
            message: error.message
        });
    }
});

// -------------------------------
// DETALLE
// -------------------------------
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!isPositiveInteger(id)) {
            return res.status(400).json({
                ok: false,
                message: 'ID de entrada inválido'
            });
        }

        const [rows] = await db.execute(`
            ${BASE_SQL}
            WHERE en.id_entrada = ?
            LIMIT 1
        `, [Number(id)]);

        if (!rows.length) {
            return res.status(404).json({
                ok: false,
                message: 'Asistente / entrada no encontrado'
            });
        }

        const entrada = mapAsistente(rows[0]);

        const [validaciones] = await db.execute(`
            SELECT
                id_validacion,
                fecha_validacion,
                punto_acceso,
                validado_por,
                resultado,
                observacion
            FROM validaciones_qr
            WHERE id_entrada = ?
            ORDER BY fecha_validacion DESC
        `, [Number(id)]);

        const historialResumen = {
            total: validaciones.length,
            validos: validaciones.filter(v => v.resultado === 'valido').length,
            duplicados: validaciones.filter(v => v.resultado === 'duplicado').length,
            rechazados: validaciones.filter(v => v.resultado === 'rechazado').length
        };

        return res.json({
            ok: true,
            asistente: entrada,
            validaciones,
            historial_resumen: historialResumen
        });
    } catch (error) {
        console.error('❌ Error obteniendo asistente por ID:', error);
        return res.status(500).json({
            ok: false,
            message: error.message
        });
    }
});

// -------------------------------
// VALIDAR ENTRADA
// -------------------------------
router.post('/validar', async (req, res) => {
    const connection = await db.getConnection();

    try {
        const codigo = String(req.body?.codigo || '').trim();
        const punto_acceso = String(req.body?.punto_acceso || '').trim() || null;
        const validado_por = String(req.body?.validado_por || '').trim() || null;

        if (!codigo) {
            return res.status(400).json({
                ok: false,
                message: 'Debes enviar el código de la entrada'
            });
        }

        await connection.beginTransaction();

        const [rows] = await connection.execute(`
            SELECT
                en.id_entrada,
                en.codigo_entrada,
                en.codigo_qr,
                en.estado,
                en.fecha_uso,
                e.titulo,
                e.fecha_evento,
                te.nombre AS tipo_nombre,
                COALESCE(en.nombre_asistente, CONCAT(c.nombres, ' ', c.apellidos)) AS nombre_asistente,
                COALESCE(en.email_asistente, c.email) AS email_asistente
            FROM entradas en
            INNER JOIN ordenes o ON o.id_orden = en.id_orden
            INNER JOIN clientes c ON c.id_cliente = o.id_cliente
            INNER JOIN eventos e ON e.id_evento = en.id_evento
            INNER JOIN tipos_entrada te ON te.id_tipo_entrada = en.id_tipo_entrada
            WHERE en.codigo_entrada = ? OR en.codigo_qr = ?
            LIMIT 1
            FOR UPDATE
        `, [codigo, codigo]);

        if (!rows.length) {
            await connection.rollback();
            return res.status(404).json({
                ok: false,
                message: 'Entrada no encontrada'
            });
        }

        const entrada = rows[0];

        if (entrada.estado === 'usada') {
            await connection.execute(`
                INSERT INTO validaciones_qr
                    (id_entrada, punto_acceso, validado_por, resultado, observacion)
                VALUES (?, ?, ?, 'duplicado', ?)
            `, [
                entrada.id_entrada,
                punto_acceso,
                validado_por,
                'La entrada ya fue utilizada anteriormente'
            ]);

            await connection.commit();

            return res.status(409).json({
                ok: false,
                message: 'La entrada ya fue usada',
                resultado: 'duplicado',
                entrada: {
                    id_entrada: entrada.id_entrada,
                    codigo_entrada: entrada.codigo_entrada,
                    nombre_asistente: entrada.nombre_asistente,
                    email_asistente: entrada.email_asistente,
                    evento: entrada.titulo,
                    tipo_entrada: entrada.tipo_nombre,
                    fecha_evento: entrada.fecha_evento,
                    fecha_uso: entrada.fecha_uso,
                    estado: entrada.estado,
                    asistente: {
                        nombre: entrada.nombre_asistente,
                        email: entrada.email_asistente
                    }
                }
            });
        }

        if (entrada.estado === 'cancelada') {
            await connection.execute(`
                INSERT INTO validaciones_qr
                    (id_entrada, punto_acceso, validado_por, resultado, observacion)
                VALUES (?, ?, ?, 'rechazado', ?)
            `, [
                entrada.id_entrada,
                punto_acceso,
                validado_por,
                'La entrada está cancelada'
            ]);

            await connection.commit();

            return res.status(400).json({
                ok: false,
                message: 'La entrada está cancelada',
                resultado: 'rechazado',
                entrada: {
                    id_entrada: entrada.id_entrada,
                    codigo_entrada: entrada.codigo_entrada,
                    nombre_asistente: entrada.nombre_asistente,
                    email_asistente: entrada.email_asistente,
                    evento: entrada.titulo,
                    tipo_entrada: entrada.tipo_nombre,
                    fecha_evento: entrada.fecha_evento,
                    fecha_uso: entrada.fecha_uso,
                    estado: entrada.estado,
                    asistente: {
                        nombre: entrada.nombre_asistente,
                        email: entrada.email_asistente
                    }
                }
            });
        }

        const fechaUso = new Date();

        await connection.execute(`
            UPDATE entradas
            SET estado = 'usada', fecha_uso = ?
            WHERE id_entrada = ?
        `, [fechaUso, entrada.id_entrada]);

        await connection.execute(`
            INSERT INTO validaciones_qr
                (id_entrada, punto_acceso, validado_por, resultado, observacion)
            VALUES (?, ?, ?, 'valido', ?)
        `, [
            entrada.id_entrada,
            punto_acceso,
            validado_por,
            'Ingreso validado correctamente'
        ]);

        await connection.commit();

        return res.json({
            ok: true,
            message: 'Entrada validada correctamente',
            resultado: 'valido',
            entrada: {
                id_entrada: entrada.id_entrada,
                codigo_entrada: entrada.codigo_entrada,
                nombre_asistente: entrada.nombre_asistente,
                email_asistente: entrada.email_asistente,
                evento: entrada.titulo,
                tipo_entrada: entrada.tipo_nombre,
                fecha_evento: entrada.fecha_evento,
                fecha_uso: fechaUso,
                estado: 'usada',
                asistente: {
                    nombre: entrada.nombre_asistente,
                    email: entrada.email_asistente
                }
            }
        });
    } catch (error) {
        await connection.rollback();
        console.error('❌ Error validando entrada:', error);
        return res.status(500).json({
            ok: false,
            message: error.message
        });
    } finally {
        connection.release();
    }
});

module.exports = router;