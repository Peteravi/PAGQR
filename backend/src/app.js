const express = require('express');
const path = require('path');
const PayphoneService = require('./services/PayphoneService');
const eventosRoutes = require('./routes/eventos');

// Inicializar app
const app = express();

// =========================
// 📌 MIDDLEWARES GLOBALES
// =========================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger simple (para ver todas las peticiones)
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
// Público
app.use('/assets', express.static(path.join(publicPath, 'assets')));
app.use('/uploads', express.static(uploadsPath));

// Admin
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

// =========================
// 💳 PAYPHONE
// =========================
app.post('/api/pagos/generar-link', async (req, res) => {
    try {
        console.log("📥 Datos recibidos para pago:", req.body);

        const datosFront = req.body;

        const idOrdenTemporal = "ORD-" + Date.now();
        const totalCentavos = Math.round(datosFront.cantidad * datosFront.precioUnitario * 100);

        console.log("💰 Total en centavos:", totalCentavos);
        console.log("🧾 Orden generada:", idOrdenTemporal);

        const urlPago = await PayphoneService.prepararBotonPago({
            amount: totalCentavos,
            orderId: idOrdenTemporal
        });

        console.log("🔗 URL de pago generada:", urlPago);

        res.json({
            ok: true,
            payUrl: urlPago,
            codigoOrden: idOrdenTemporal
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

// (opcional) login admin
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

    // Para rutas no API, redirigir al index
    return res.status(404).sendFile(path.join(publicPath, 'index.html'));
});

// =========================
// 🚀 EXPORT
// =========================
module.exports = app;