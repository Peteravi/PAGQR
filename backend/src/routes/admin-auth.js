const express = require('express');
const crypto = require('crypto');

const router = express.Router();

function safeEqual(a = '', b = '') {
    const valueA = String(a);
    const valueB = String(b);

    const bufferA = Buffer.from(valueA, 'utf8');
    const bufferB = Buffer.from(valueB, 'utf8');

    if (bufferA.length !== bufferB.length) {
        return false;
    }

    return crypto.timingSafeEqual(bufferA, bufferB);
}

function normalizeNextPath(value) {
    if (!value || typeof value !== 'string') return '/admin';
    if (!value.startsWith('/')) return '/admin';
    if (value.startsWith('//')) return '/admin';
    if (value.startsWith('/login')) return '/admin';
    if (value.startsWith('/logout')) return '/admin';
    if (value.startsWith('/api/')) return '/admin';
    return value;
}

function getPublicSessionData(req) {
    const isAuthenticated = Boolean(req.session?.adminAuthenticated === true);

    return {
        ok: true,
        authenticated: isAuthenticated,
        user: isAuthenticated ? (req.session?.adminUser || null) : null,
        csrfToken: req.csrfToken ? req.csrfToken() : null
    };
}

router.get('/session', (req, res) => {
    return res.json(getPublicSessionData(req));
});

router.get('/csrf', (req, res) => {
    return res.json({
        ok: true,
        csrfToken: req.csrfToken ? req.csrfToken() : null
    });
});

router.post('/login', (req, res) => {
    const adminUser = process.env.ADMIN_USER;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminUser || !adminPassword) {
        return res.status(500).json({
            ok: false,
            message: 'Faltan ADMIN_USER o ADMIN_PASSWORD en las variables de entorno.'
        });
    }

    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const nextPath = normalizeNextPath(req.body?.next);

    if (!username || !password) {
        return res.status(400).json({
            ok: false,
            message: 'Debes ingresar usuario y contraseña.'
        });
    }

    const validUser = safeEqual(username, adminUser);
    const validPassword = safeEqual(password, adminPassword);

    if (!validUser || !validPassword) {
        return res.status(401).json({
            ok: false,
            message: 'Credenciales incorrectas.'
        });
    }

    req.session.regenerate((err) => {
        if (err) {
            console.error('❌ Error regenerando sesión:', err);
            return res.status(500).json({
                ok: false,
                message: 'No se pudo iniciar sesión.'
            });
        }

        req.session.adminAuthenticated = true;
        req.session.adminUser = adminUser;
        req.session.userRole = 'admin';

        req.session.save((saveErr) => {
            if (saveErr) {
                console.error('❌ Error guardando sesión:', saveErr);
                return res.status(500).json({
                    ok: false,
                    message: 'No se pudo guardar la sesión.'
                });
            }

            return res.json({
                ok: true,
                message: 'Login correcto.',
                redirectTo: nextPath,
                csrfToken: req.csrfToken ? req.csrfToken() : null
            });
        });
    });
});

router.post('/logout', (req, res) => {
    if (!req.session) {
        res.clearCookie(process.env.SESSION_COOKIE_NAME || 'pagqr_admin_sid');
        return res.json({
            ok: true,
            message: 'Sesión cerrada.'
        });
    }

    req.session.destroy((err) => {
        if (err) {
            console.error('❌ Error cerrando sesión:', err);
            return res.status(500).json({
                ok: false,
                message: 'No se pudo cerrar la sesión.'
            });
        }

        res.clearCookie(process.env.SESSION_COOKIE_NAME || 'pagqr_admin_sid', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        });

        return res.json({
            ok: true,
            message: 'Sesión cerrada correctamente.'
        });
    });
});

module.exports = router;