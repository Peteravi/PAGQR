document.addEventListener('DOMContentLoaded', () => {
    const $ = (id) => document.getElementById(id);
    const API_CONTACTO = '/api/contacto';
    const API_CSRF = '/api/admin-auth/csrf';

    let csrfTokenCache = null;
    let enviando = false;

    async function obtenerCsrfToken(forceRefresh = false) {
        if (csrfTokenCache && !forceRefresh) return csrfTokenCache;

        const response = await fetch(API_CSRF, {
            method: 'GET',
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json'
            }
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.ok || !data.csrfToken) {
            throw new Error(data.message || 'No se pudo obtener el token CSRF.');
        }

        csrfTokenCache = data.csrfToken;
        return csrfTokenCache;
    }

    function mostrarAlerta(mensaje, tipo = 'info') {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${tipo} alert-dismissible fade show position-fixed top-0 end-0 m-3`;
        alertDiv.style.zIndex = '9999';
        alertDiv.innerHTML = `
            ${mensaje}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        document.body.appendChild(alertDiv);
        setTimeout(() => alertDiv.remove(), 5000);
    }

    function setEstadoBoton(enviando) {
        const boton = $('btnEnviar');
        if (!boton) return;

        boton.disabled = enviando;

        if (enviando) {
            boton.dataset.originalText = boton.innerHTML;
            boton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Enviando...';
        } else {
            boton.innerHTML = boton.dataset.originalText || '<i class="bi bi-send me-2"></i>Enviar mensaje';
        }
    }

    function validarFormulario() {
        const campos = [
            { id: 'nombres', label: 'nombres' },
            { id: 'apellidos', label: 'apellidos' },
            { id: 'email', label: 'correo electrónico' },
            { id: 'asunto', label: 'asunto' },
            { id: 'mensaje', label: 'mensaje' }
        ];

        for (const campo of campos) {
            const input = $(campo.id);
            if (!input || !String(input.value || '').trim()) {
                mostrarAlerta(`Debes ingresar ${campo.label}.`, 'warning');
                input?.focus();
                return false;
            }
        }

        const email = $('email')?.value.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            mostrarAlerta('Ingresa un correo electrónico válido.', 'warning');
            $('email')?.focus();
            return false;
        }

        if (String($('mensaje')?.value || '').trim().length < 10) {
            mostrarAlerta('El mensaje debe tener al menos 10 caracteres.', 'warning');
            $('mensaje')?.focus();
            return false;
        }

        return true;
    }

    function construirPayload() {
        return {
            nombres: $('nombres')?.value.trim(),
            apellidos: $('apellidos')?.value.trim(),
            email: $('email')?.value.trim(),
            telefono: $('telefono')?.value.trim() || null,
            asunto: $('asunto')?.value.trim(),
            mensaje: $('mensaje')?.value.trim()
        };
    }

    async function enviarMensaje(payload) {
        const csrfToken = await obtenerCsrfToken(false);

        const response = await fetch(API_CONTACTO, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'CSRF-Token': csrfToken
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.ok) {
            throw new Error(data.message || 'No se pudo enviar el mensaje.');
        }

        return data;
    }

    async function manejarEnvio(e) {
        e.preventDefault();

        if (enviando) return;
        if (!validarFormulario()) return;

        try {
            enviando = true;
            setEstadoBoton(true);

            const payload = construirPayload();
            await enviarMensaje(payload);

            mostrarAlerta('¡Mensaje enviado correctamente! Nuestro equipo de soporte te contactará pronto.', 'success');

            $('contactoForm')?.reset();

        } catch (error) {
            console.error('Error enviando mensaje:', error);
            mostrarAlerta(error.message || 'No se pudo enviar el mensaje. Intenta de nuevo.', 'danger');
        } finally {
            enviando = false;
            setEstadoBoton(false);
        }
    }

    $('contactoForm')?.addEventListener('submit', manejarEnvio);

    $('btnEnviar')?.addEventListener('click', async (e) => {
        await manejarEnvio(e);
    });
});