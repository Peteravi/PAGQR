const express = require('express');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const publicPath = path.join(__dirname, '../../frontend/public');
const uploadsPath = path.join(publicPath, 'uploads');

// Archivos estáticos
app.use('/assets', express.static(path.join(publicPath, 'assets')));
app.use('/uploads', express.static(uploadsPath));

// API base
app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        message: 'API funcionando correctamente'
    });
});

// Rutas frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

app.get('/confirmacion', (req, res) => {
    res.sendFile(path.join(publicPath, 'confirmacion.html'));
});

app.get('/error-pago', (req, res) => {
    res.sendFile(path.join(publicPath, 'error-pago.html'));
});

app.get('/mis-entradas', (req, res) => {
    res.sendFile(path.join(publicPath, 'mis-entradas.html'));
});

app.get('/ticket', (req, res) => {
    res.sendFile(path.join(publicPath, 'ticket.html'));
});

// Fallback para rutas no encontradas
app.use((req, res) => {
    if (req.originalUrl.startsWith('/api/')) {
        return res.status(404).json({
            ok: false,
            message: 'Endpoint no encontrado'
        });
    }

    return res.status(404).sendFile(path.join(publicPath, 'index.html'));
});

module.exports = app;