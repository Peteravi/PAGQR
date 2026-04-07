const express = require('express');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const csrf = require('csurf');
const cookieParser = require('cookie-parser');

const eventosRoutes = require('./routes/eventos');
const ventasRoutes = require('./routes/ventas');
const ordenesRoutes = require('./routes/ordenes');
const tiposEntradaRoutes = require('./routes/tipos-entrada');
const pagosRouter = require('./routes/pagos');
const entradasRoutes = require('./routes/entradas');
const asistentesRoutes = require('./routes/asistentes');
const adminAuthRoutes = require('./routes/admin-auth');
const eventosPublicosRoutes = require('./routes/eventos-publicos');

const {
    requireAdminPage,
    requireAdminApi,
    redirectIfAuthenticated
} = require('./middlewares/adminAuth');

const app = express();

const isProduction = process.env.NODE_ENV === 'production';

// =====================================================
// TRUST PROXY
// =====================================================
app.set('trust proxy', 1);

// =====================================================
// SEGURIDAD (HEADERS)
// =====================================================
app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false
}));

// =====================================================
// WEBHOOK RAW BODY
// =====================================================
app.use('/api/pagos/webhook', express.raw({ type: 'application/json' }));

// =====================================================
// PARSERS
// =====================================================
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// =====================================================
// SESIONES SEGURAS
// =====================================================
app.use(session({
    name: process.env.SESSION_COOKIE_NAME || 'pagqr_admin_sid',
    secret: process.env.SESSION_SECRET || 'CAMBIA_ESTO_EN_PRODUCCION',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    proxy: isProduction,
    cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 30
    }
}));

// =====================================================
// RATE LIMIT LOGIN
// =====================================================
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        ok: false,
        message: 'Demasiados intentos. Intenta más tarde.'
    }
});

// =====================================================
// CSRF PROTECTION
// =====================================================
const csrfProtection = csrf({
    cookie: false
});

// IMPORTANTE:
// Excluir el webhook de PayPhone de CSRF.
// El frontend público sí puede usar CSRF pidiéndolo por /api/admin-auth/csrf,
// pero PayPhone no enviará ese token.
app.use((req, res, next) => {
    if (req.path.startsWith('/api/pagos/')) {
        return next();
    }

    if (req.path === '/api/ordenes' && req.method === 'POST') {
        return next();
    }

    if (req.path.startsWith('/api/admin-auth/')) {
        return csrfProtection(req, res, next);
    }

    return next();
});

// =====================================================
// LOG SIMPLE
// =====================================================
app.use((req, res, next) => {
    console.log(`➡️ ${req.method} ${req.url}`);
    next();
});

// =====================================================
// ARCHIVOS ESTÁTICOS
// =====================================================
app.use('/assets', express.static(path.join(__dirname, '../../frontend/public/assets')));
app.use('/uploads', express.static(path.join(__dirname, '../../frontend/public/uploads')));
app.use('/admin/assets', express.static(path.join(__dirname, '../../frontend/admin/assets')));
app.use(express.static(path.join(__dirname, '../../frontend/public')));

// =====================================================
// AUTH ADMIN (LOGIN + SESSION)
// =====================================================
app.use('/api/admin-auth/login', loginLimiter);
app.use('/api/admin-auth', adminAuthRoutes);

// =====================================================
// API ROUTES
// =====================================================

// 🔓 Públicas
app.use('/api/ordenes', ordenesRoutes);
app.use('/api/entradas', entradasRoutes);
app.use('/api/pagos', pagosRouter);
app.use('/api/eventos-publicos', eventosPublicosRoutes);

// 🔐 Protegidas admin
app.use('/api/eventos', requireAdminApi, eventosRoutes);
app.use('/api/tipos-entrada', requireAdminApi, tiposEntradaRoutes);
app.use('/api/ventas', requireAdminApi, ventasRoutes);
app.use('/api/asistentes', requireAdminApi, asistentesRoutes);

// =====================================================
// LOGIN
// =====================================================
app.get('/login', redirectIfAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/admin/pages/login.html'));
});

// =====================================================
// LOGOUT
// =====================================================
app.get('/logout', (req, res) => {
    if (!req.session) return res.redirect('/login');

    req.session.destroy((err) => {
        if (err) {
            console.error('❌ Error logout:', err);
            return res.redirect('/login');
        }

        res.clearCookie(process.env.SESSION_COOKIE_NAME || 'pagqr_admin_sid', {
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax'
        });

        return res.redirect('/login');
    });
});

// =====================================================
// FRONTEND PÚBLICO
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
// PANEL ADMIN
// =====================================================
app.get('/admin', requireAdminPage, (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/admin/pages/admin.html'));
});

app.get('/ventas', requireAdminPage, (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/admin/pages/ventas.html'));
});

app.get('/asistentes', requireAdminPage, (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/admin/pages/asistente.html'));
});

// =====================================================
// CSRF ERROR HANDLER
// =====================================================
app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({
            ok: false,
            message: 'Token CSRF inválido o expirado.'
        });
    }
    next(err);
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