(function () {
    const form = document.getElementById('loginForm');
    const alertBox = document.getElementById('alertBox');
    const btnLogin = document.getElementById('btnLogin');
    const spinner = document.getElementById('loginSpinner');
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    const nextInput = document.getElementById('next');
    const csrfInput = document.getElementById('csrfToken');

    function getNextFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const next = params.get('next');

        if (!next || !next.startsWith('/') || next.startsWith('//')) {
            return '/admin';
        }

        if (
            next.startsWith('/login') ||
            next.startsWith('/logout') ||
            next.startsWith('/api/')
        ) {
            return '/admin';
        }

        return next;
    }

    function showError(message) {
        alertBox.textContent = message || 'Ocurrió un error al iniciar sesión.';
        alertBox.classList.remove('d-none');
    }

    function hideError() {
        alertBox.textContent = '';
        alertBox.classList.add('d-none');
    }

    function setLoading(loading) {
        btnLogin.disabled = loading;
        spinner.classList.toggle('d-none', !loading);
    }

    async function fetchCsrfToken() {
        try {
            const response = await fetch('/api/admin-auth/csrf', {
                method: 'GET',
                credentials: 'same-origin',
                headers: {
                    'Accept': 'application/json'
                }
            });

            const data = await response.json();

            if (response.ok && data.ok && data.csrfToken) {
                csrfInput.value = data.csrfToken;
                return data.csrfToken;
            }

            throw new Error(data.message || 'No se pudo obtener el token CSRF.');
        } catch (error) {
            console.error('Error obteniendo CSRF:', error);
            showError('No se pudo preparar el formulario de acceso.');
            return null;
        }
    }

    async function checkExistingSession() {
        try {
            const response = await fetch('/api/admin-auth/session', {
                credentials: 'same-origin',
                headers: {
                    'Accept': 'application/json'
                }
            });

            const data = await response.json();

            if (data?.csrfToken) {
                csrfInput.value = data.csrfToken;
            }

            if (data.ok && data.authenticated) {
                window.location.href = '/admin';
            }
        } catch (error) {
            console.warn('No se pudo verificar la sesión actual:', error);
        }
    }

    togglePassword?.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        togglePassword.innerHTML = isPassword
            ? '<i class="bi bi-eye-slash"></i>'
            : '<i class="bi bi-eye"></i>';
    });

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();
        setLoading(true);

        const csrfToken = csrfInput.value || await fetchCsrfToken();

        if (!csrfToken) {
            setLoading(false);
            return;
        }

        const payload = {
            username: form.username.value.trim(),
            password: form.password.value,
            next: nextInput.value || '/admin'
        };

        try {
            const response = await fetch('/api/admin-auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'CSRF-Token': csrfToken
                },
                credentials: 'same-origin',
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok || !data.ok) {
                showError(data.message || 'Credenciales inválidas.');

                if (data?.csrfToken) {
                    csrfInput.value = data.csrfToken;
                } else {
                    await fetchCsrfToken();
                }

                setLoading(false);
                return;
            }

            if (data?.csrfToken) {
                csrfInput.value = data.csrfToken;
                sessionStorage.setItem('admin_csrf_token', data.csrfToken);
            }

            window.location.href = data.redirectTo || '/admin';
        } catch (error) {
            console.error('Error en login:', error);
            showError('No se pudo conectar con el servidor.');
            setLoading(false);
        }
    });

    nextInput.value = getNextFromUrl();
    checkExistingSession().then(async () => {
        if (!csrfInput.value) {
            await fetchCsrfToken();
        }
    });
})();