const express = require('express');
const path = require('path');

const eventosRoutes = require('./routes/eventos');
const ventasRoutes = require('./routes/ventas');
const ordenesRoutes = require('./routes/ordenes');
const tiposEntradaRoutes = require('./routes/tipos-entrada');
const pagosRouter = require('./routes/pagos');
const entradasRoutes = require('./routes/entradas');
const asistentesRoutes = require('./routes/asistentes');

const app = express();

// =====================================================
// IMPORTANTE:
// EL WEBHOOK DE PAYPHONE DEBE RECIBIR EL BODY RAW
// ANTES DE express.json()
// =====================================================
app.use('/api/pagos/webhook', express.raw({ type: 'application/json' }));

// =====================================================
// MIDDLEWARES
// =====================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log simple
app.use((req, res, next) => {
    console.log(`➡️ ${req.method} ${req.url}`);
    next();
});

// =====================================================
// ARCHIVOS ESTÁTICOS
// =====================================================
// Assets públicos del frontend principal
app.use('/assets', express.static(path.join(__dirname, '../../frontend/public/assets')));

// Uploads reales de imágenes
app.use('/uploads', express.static(path.join(__dirname, '../../frontend/public/uploads')));

// Archivos estáticos del panel admin
app.use('/admin', express.static(path.join(__dirname, '../../frontend/admin')));

// HTML público
app.use(express.static(path.join(__dirname, '../../frontend/public')));

// =====================================================
// API ROUTES
// =====================================================
app.use('/api/eventos', eventosRoutes);
app.use('/api/ordenes', ordenesRoutes);
app.use('/api/entradas', entradasRoutes);
app.use('/api/tipos-entrada', tiposEntradaRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/pagos', pagosRouter);
app.use('/api/asistentes', asistentesRoutes);

// =====================================================
// RUTAS HTML - FRONTEND PÚBLICO
// =====================================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/public/index.html'));
});

app.get('/eventos', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/public/eventos.html'));
});

app.get('/confirmacion', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/public/confirmacion.html'));
});

app.get('/error-pago', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/public/error-pago.html'));
});

app.get('/mis-entradas', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/public/mis-entradas.html'));
});

app.get('/ticket', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/public/ticket.html'));
});

// =====================================================
// RUTAS HTML - PANEL ADMIN
// =====================================================
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/admin/pages/admin.html'));
});

app.get('/ventas', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/admin/pages/ventas.html'));
});

app.get('/asistentes', (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/admin/pages/asistente.html'));
});

// =====================================================
// 404 API
// =====================================================
app.use('/api', (req, res) => {
    res.status(404).json({
        ok: false,
        message: 'Ruta API no encontrada'
    });
});

// =====================================================
// 404 GENERAL
// =====================================================
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '../../frontend/public/index.html'));
});

module.exports = app;