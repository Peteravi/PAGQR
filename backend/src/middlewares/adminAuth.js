const DEFAULT_LOGIN_PATH = '/login';
const DEFAULT_DASHBOARD_PATH = '/admin';

function isAdminAuthenticated(req) {
    return Boolean(req.session?.adminAuthenticated === true);
}

function normalizeNextPath(value) {
    if (!value || typeof value !== 'string') return DEFAULT_DASHBOARD_PATH;
    if (!value.startsWith('/')) return DEFAULT_DASHBOARD_PATH;
    if (value.startsWith('//')) return DEFAULT_DASHBOARD_PATH;
    if (value.startsWith('/login')) return DEFAULT_DASHBOARD_PATH;
    if (value.startsWith('/logout')) return DEFAULT_DASHBOARD_PATH;
    if (value.startsWith('/api/')) return DEFAULT_DASHBOARD_PATH;
    return value;
}

function requireAdminPage(req, res, next) {
    if (isAdminAuthenticated(req)) {
        return next();
    }

    const nextUrl = normalizeNextPath(req.originalUrl || DEFAULT_DASHBOARD_PATH);
    return res.redirect(`${DEFAULT_LOGIN_PATH}?next=${encodeURIComponent(nextUrl)}`);
}

function requireAdminApi(req, res, next) {
    if (isAdminAuthenticated(req)) {
        return next();
    }

    return res.status(401).json({
        ok: false,
        message: 'No autorizado. Debes iniciar sesión como administrador.'
    });
}

function requireAdminRole(...allowedRoles) {
    return (req, res, next) => {
        if (!isAdminAuthenticated(req)) {
            return res.status(401).json({
                ok: false,
                message: 'No autorizado. Debes iniciar sesión.'
            });
        }

        const userRole = req.session?.userRole;
        if (allowedRoles.length === 0 || allowedRoles.includes(userRole)) {
            return next();
        }

        return res.status(403).json({
            ok: false,
            message: 'No tienes permisos para acceder a este recurso.'
        });
    };
}

function redirectIfAuthenticated(req, res, next) {
    if (isAdminAuthenticated(req)) {
        return res.redirect(DEFAULT_DASHBOARD_PATH);
    }

    return next();
}

module.exports = {
    isAdminAuthenticated,
    normalizeNextPath,
    requireAdminPage,
    requireAdminApi,
    requireAdminRole,
    redirectIfAuthenticated
};