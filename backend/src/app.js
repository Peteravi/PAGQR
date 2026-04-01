const express = require('express');
const path = require('path');
const PayphoneService = require('./services/PayphoneService');
const eventosRoutes = require('./routes/eventos');
const ventasRoutes = require('./routes/ventas');
const ordenesRoutes = require('./routes/ordenes'); 
const tiposEntradaRoutes = require('./routes/tipos-entrada');
const db = require('./config/db'); // Asegurar que db está disponible

// Inicializar app
const app = express();

// =========================
// 📌 MIDDLEWARES GLOBALES
// =========================
// Webhook debe procesarse antes de json() para leer el raw body
app.post('/api/pagos/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    // Delegamos al router de ordenes, pero como es un endpoint separado, llamamos a la lógica directamente
    // Para mantener orden, podríamos mover la lógica a un controlador, pero aquí haremos una redirección interna
    // Por simplicidad, llamamos al método del router que ya definimos.
    // Pero como el router ya tiene el mismo endpoint, lo montaremos después y evitaremos duplicación.
    // Mejor montar el router de ordenes después y usar app.use('/api/ordenes', ordenesRoutes) y también montar el webhook desde allí.
    // Sin embargo, para que funcione, podemos definir el webhook directamente aquí y usar la misma lógica.
    // Para evitar duplicar código, importamos la función del router o la movemos a un controlador.
    // Por ahora, mantendremos la lógica dentro del router de ordenes y montaremos el webhook como parte de ese router.
    // Esto se hará más abajo con app.use('/api/pagos', ordenesRoutes) y exponiendo el webhook.
    // Entonces, aquí solo llamaremos a la función que maneja el webhook desde el router.
    // Pero como el router ya tiene el endpoint /webhook, lo montaremos en app.use('/api/pagos', ordenesRoutes) y este middleware será innecesario.
    // Eliminamos este bloque y montamos el router correspondiente.
});

// Ahora sí, middlewares estándar
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger simple
app.use((req, res, next) => {
    console.log(`➡️ ${req.method} ${req.url}`);
    next();
});

// =========================
// 📁 DEFINIR PATHS
// =========================
const publicPath = path.join(__dirname, '../../frontend/public');
const adminPath = path.join(__dirname, '../../frontend/admin');
const uploadsPath = path.join(publicPath, 'uploads');

// =========================
// 📦 ARCHIVOS ESTÁTICOS
// =========================
app.use('/assets', express.static(path.join(publicPath, 'assets')));
app.use('/uploads', express.static(uploadsPath));
app.use('/admin/assets', express.static(path.join(adminPath, 'assets')));

// =========================
// 🧪 HEALTH CHECK
// =========================
app.get('/api/health', (req, res) => {
    console.log("✅ Health check OK");
    res.json({ ok: true, message: 'API funcionando correctamente' });
});

// =========================
// 🛣️ RUTAS API
// =========================
app.use('/api/eventos', eventosRoutes);
app.use('/api/ordenes', ordenesRoutes); // Montamos las rutas de órdenes
app.use('/api/tipos-entrada', tiposEntradaRoutes);
app.use('/api/ventas', ventasRoutes);
// El webhook está incluido en ordenesRoutes como /webhook, entonces quedará en /api/ordenes/webhook
// Pero queremos que sea /api/pagos/webhook. Podemos montar las rutas de pagos aparte o renombrar.
// Para mayor claridad, creamos un router separado para pagos. Por ahora, montamos el webhook directamente.
// Vamos a exponer el webhook en /api/pagos/webhook usando la función del router importada.
// Podemos extraer la función del router y usarla aquí, o crear un router de pagos.
// Simplificamos: movemos la lógica del webhook a un controlador y lo usamos aquí.
// Por ahora, usaremos el mismo router de ordenes pero lo montaremos en /api/pagos? No es ideal.
// Mejor creamos un router de pagos aparte. Pero para no complicar, vamos a definir el webhook directamente aquí usando la misma lógica que en ordenesRoutes.
// Como el código ya está en ordenesRoutes, lo reutilizaremos importando la función del router, pero no es directo.
// Optamos por mover la lógica a un controlador separado o simplemente duplicar aquí (temporal).
// En un proyecto real, se haría un controlador compartido.

// =========================
// 💳 PAYPHONE - Generar link de pago (modificado)
// =========================
app.post('/api/pagos/generar-link', async (req, res) => {
    try {
        console.log("📥 Datos recibidos para pago:", req.body);

        const { id_orden } = req.body;
        if (!id_orden) {
            return res.status(400).json({ ok: false, message: 'Se requiere id_orden' });
        }

        // Obtener la orden de la base de datos
        const [orden] = await db.execute(
            `SELECT codigo_orden, total FROM ordenes WHERE id_orden = ? AND estado = 'pendiente'`,
            [id_orden]
        );

        if (orden.length === 0) {
            return res.status(404).json({ ok: false, message: 'Orden no encontrada o ya procesada' });
        }

        const totalCentavos = Math.round(orden[0].total * 100);
        const urlPago = await PayphoneService.prepararBotonPago({
            amount: totalCentavos,
            orderId: orden[0].codigo_orden
        });

        console.log("🔗 URL de pago generada:", urlPago);

        res.json({
            ok: true,
            payUrl: urlPago,
            codigoOrden: orden[0].codigo_orden
        });

    } catch (error) {
        console.error("❌ Error generando el pago:", error);
        res.status(500).json({
            ok: false,
            message: "Error al conectar con la pasarela de pagos"
        });
    }
});

// =========================
// 🏁 WEBHOOK DE PAYPHONE (redirigimos a la lógica existente en ordenesRoutes)
// Para evitar duplicar código, llamamos al mismo manejador que definimos en ordenesRoutes.
// Pero como ordenesRoutes ya está montado, no podemos llamarlo directamente.
// Solución: extraemos la función del webhook a un controlador y la importamos en ambos lugares.
// Por simplicidad, repetiremos aquí la lógica (aunque no sea óptimo). En producción, refactorizar.
app.post('/api/pagos/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const payload = req.body;
        console.log('📩 Webhook recibido:', payload);

        const { clientTransactionId, status, amount, transactionId } = payload;

        const [orden] = await db.execute(
            `SELECT id_orden, estado FROM ordenes WHERE codigo_orden = ?`,
            [clientTransactionId]
        );

        if (orden.length === 0) {
            console.log('⚠️ Orden no encontrada para clientTransactionId:', clientTransactionId);
            return res.status(404).send('Orden no encontrada');
        }

        const id_orden = orden[0].id_orden;

        if (orden[0].estado === 'pagada') {
            return res.sendStatus(200);
        }

        await db.query('START TRANSACTION');  // <--- Cambiado

        if (status === 'COMPLETED') {
            await db.execute(
                `UPDATE ordenes SET estado = 'pagada', fecha_actualizacion = NOW() WHERE id_orden = ?`,
                [id_orden]
            );

            await db.execute(
                `INSERT INTO pagos (id_orden, proveedor_pago, transaccion_id, monto, estado, respuesta_gateway)
                 VALUES (?, 'PayPhone', ?, ?, 'aprobado', ?)`,
                [id_orden, transactionId, amount / 100, JSON.stringify(payload)]
            );

            const [detalles] = await db.execute(
                `SELECT od.id_tipo_entrada, od.cantidad, te.id_evento 
                 FROM orden_detalle od
                 JOIN tipos_entrada te ON od.id_tipo_entrada = te.id_tipo_entrada
                 WHERE od.id_orden = ?`,
                [id_orden]
            );

            for (const detalle of detalles) {
                for (let i = 0; i < detalle.cantidad; i++) {
                    const codigoEntrada = `ENT-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 6)}`;
                    const qrData = `https://tudominio.com/validar/${codigoEntrada}`;
                    await db.execute(
                        `INSERT INTO entradas (id_orden, id_evento, id_tipo_entrada, codigo_entrada, codigo_qr, estado)
                         VALUES (?, ?, ?, ?, ?, 'generada')`,
                        [id_orden, detalle.id_evento, detalle.id_tipo_entrada, codigoEntrada, qrData]
                    );
                }
            }

            await db.query('COMMIT');  // <--- Cambiado
            console.log('✅ Pago completado y entradas generadas para orden', id_orden);
        } else {
            const [detalles] = await db.execute(
                `SELECT id_tipo_entrada, cantidad FROM orden_detalle WHERE id_orden = ?`,
                [id_orden]
            );

            for (const detalle of detalles) {
                await db.execute(
                    `UPDATE tipos_entrada SET stock_disponible = stock_disponible + ?
                     WHERE id_tipo_entrada = ?`,
                    [detalle.cantidad, detalle.id_tipo_entrada]
                );
            }

            await db.execute(
                `UPDATE ordenes SET estado = 'fallida', fecha_actualizacion = NOW() WHERE id_orden = ?`,
                [id_orden]
            );

            await db.query('COMMIT');  // <--- Cambiado
            console.log('⚠️ Pago fallido, stock liberado para orden', id_orden);
        }

        res.sendStatus(200);
    } catch (error) {
        await db.query('ROLLBACK');  // <--- Cambiado
        console.error('❌ Error en webhook:', error);
        res.sendStatus(500);
    }
});

// =========================
// 🌐 FRONTEND PÚBLICO (HTML)
// =========================
app.get('/', (req, res) => {
    console.log("🌍 Cargando index público");
    res.sendFile(path.join(publicPath, 'index.html'));
});

app.get('/eventos.html', (req, res) => {
    console.log("🌍 Cargando evento público");
    res.sendFile(path.join(publicPath, 'eventos.html'));
});

app.get('/confirmacion', (req, res) => {
    console.log("✅ Página confirmación");
    res.sendFile(path.join(publicPath, 'confirmacion.html'));
});

app.get('/error-pago', (req, res) => {
    console.log("❌ Página error pago");
    res.sendFile(path.join(publicPath, 'error-pago.html'));
});

app.get('/mis-entradas', (req, res) => {
    console.log("🎟️ Página mis entradas");
    res.sendFile(path.join(publicPath, 'mis-entradas.html'));
});

app.get('/ticket', (req, res) => {
    console.log("🎫 Página ticket");
    res.sendFile(path.join(publicPath, 'ticket.html'));
});

// =========================
// 🛠️ PANEL ADMIN
// =========================
app.get('/admin', (req, res) => {
    console.log("🛠️ Entrando al panel ADMIN");
    res.sendFile(path.join(adminPath, 'pages/admin.html'));
});

app.get('/ventas', (req, res) => {
    console.log("🛠️ Entrando al panel Ventas");
    res.sendFile(path.join(adminPath, 'pages/ventas.html'));
});

app.get('/admin/login', (req, res) => {
    console.log("🔐 Página login admin");
    res.sendFile(path.join(adminPath, 'pages/login.html'));
});

// =========================
// ❌ 404 HANDLER
// =========================
app.use((req, res) => {
    console.log("⚠️ Ruta no encontrada:", req.originalUrl);

    if (req.originalUrl.startsWith('/api/')) {
        return res.status(404).json({
            ok: false,
            message: 'Endpoint no encontrado'
        });
    }

    return res.status(404).sendFile(path.join(publicPath, 'index.html'));
});

// =========================
// 🚀 EXPORT
// =========================
module.exports = app;