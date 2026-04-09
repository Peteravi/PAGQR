(function () {
    'use strict';

    const CAMERA_API_BASE = '/api/asistentes';
    const COOLDOWN_MS = 1800;

    const cameraDom = {
        btnIniciar: document.getElementById('btnIniciarCamara'),
        btnDetener: document.getElementById('btnDetenerCamara'),
        btnLimpiar: document.getElementById('btnLimpiarResultadoCamara'),
        selectCamera: document.getElementById('scannerCameraSelect'),
        qrReader: document.getElementById('qr-reader'),
        placeholder: document.getElementById('scannerPlaceholder'),
        puntoAcceso: document.getElementById('puntoAccesoCamara'),
        validadoPor: document.getElementById('validadoPorCamara'),
        estadoBadge: document.getElementById('scannerEstadoBadge'),
        estadoTexto: document.getElementById('scannerEstadoTexto'),
        ultimoCodigo: document.getElementById('scannerUltimoCodigo'),
        resultadoCard: document.getElementById('scannerResultadoCard'),
        resultadoTitulo: document.getElementById('scannerResultadoTitulo'),
        resultadoSubtitulo: document.getElementById('scannerResultadoSubtitulo'),
        resultadoBadge: document.getElementById('scannerResultadoBadge'),
        detalleAsistente: document.getElementById('scannerDetalleAsistente'),
        detalleEvento: document.getElementById('scannerDetalleEvento'),
        detalleTipoEntrada: document.getElementById('scannerDetalleTipoEntrada'),
        detalleEstado: document.getElementById('scannerDetalleEstado'),
        detalleMensaje: document.getElementById('scannerDetalleMensaje'),
        detalleCodigo: document.getElementById('scannerDetalleCodigo')
    };

    const scannerState = {
        html5QrCode: null,
        cameras: [],
        isRunning: false,
        isProcessing: false,
        lastScanText: '',
        lastScanAt: 0,
        currentCameraId: ''
    };

    function reproducirTono(tipo = 'success') {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;

            const audioCtx = new AudioContextClass();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            oscillator.type = 'sine';
            oscillator.frequency.value = tipo === 'success' ? 880 : 280;
            gainNode.gain.value = 0.04;

            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            oscillator.start();

            setTimeout(() => {
                oscillator.stop();
                audioCtx.close().catch(() => { });
            }, tipo === 'success' ? 120 : 220);
        } catch (_) {
            // sin sonido si el navegador no lo permite
        }
    }

    function setPlaceholderVisible(visible) {
        if (!cameraDom.placeholder) return;
        cameraDom.placeholder.style.display = visible ? 'flex' : 'none';
    }

    function setEstado(texto, badgeTexto) {
        if (cameraDom.estadoTexto) {
            cameraDom.estadoTexto.textContent = texto || 'Sin estado';
        }
        if (cameraDom.estadoBadge) {
            cameraDom.estadoBadge.textContent = badgeTexto || texto || 'Sin estado';
        }
    }

    function setButtonsState() {
        if (cameraDom.btnIniciar) {
            cameraDom.btnIniciar.disabled = scannerState.isRunning || scannerState.isProcessing;
        }

        if (cameraDom.btnDetener) {
            cameraDom.btnDetener.disabled = !scannerState.isRunning;
        }

        if (cameraDom.selectCamera) {
            cameraDom.selectCamera.disabled = scannerState.isRunning || scannerState.cameras.length === 0;
        }
    }

    function extraerEntrada(data) {
        return data?.entrada || data?.asistente || data?.detalle || data || {};
    }

    function extraerNombreAsistente(data) {
        const entrada = extraerEntrada(data);
        return (
            entrada?.asistente?.nombre ||
            entrada?.nombre_asistente ||
            data?.asistente?.nombre ||
            data?.nombre ||
            '-'
        );
    }

    function extraerEvento(data) {
        const entrada = extraerEntrada(data);
        return (
            entrada?.evento?.titulo ||
            entrada?.evento ||
            data?.evento?.titulo ||
            data?.titulo_evento ||
            '-'
        );
    }

    function extraerTipoEntrada(data) {
        const entrada = extraerEntrada(data);
        return (
            entrada?.tipo_entrada?.nombre ||
            entrada?.tipo_entrada ||
            data?.tipo_entrada?.nombre ||
            data?.tipo_entrada_nombre ||
            '-'
        );
    }

    function extraerEstado(data) {
        const entrada = extraerEntrada(data);
        return (
            entrada?.estado ||
            data?.estado ||
            (data?.ok ? 'válida' : 'rechazada') ||
            '-'
        );
    }

    function normalizarResultadoVisual(data) {
        const ok = !!data?.ok;
        const message = data?.message || (ok ? 'Entrada validada correctamente' : 'No se pudo validar la entrada');

        let variant = 'warning';
        let badge = 'REVISAR';
        let titulo = 'Resultado de validación';
        let subtitulo = message;

        const lowerMessage = String(message).toLowerCase();
        const estado = String(extraerEstado(data)).toLowerCase();
        const resultado = String(data?.resultado || '').toLowerCase();

        if (ok) {
            variant = 'success';
            badge = 'VÁLIDO';
            titulo = 'Entrada válida';
        } else if (
            resultado === 'duplicado' ||
            lowerMessage.includes('usada') ||
            lowerMessage.includes('duplicad') ||
            estado.includes('usada')
        ) {
            variant = 'error';
            badge = 'DUPLICADO';
            titulo = 'Entrada ya utilizada';
        } else if (
            resultado === 'rechazado' ||
            lowerMessage.includes('cancelad') ||
            estado.includes('cancelada')
        ) {
            variant = 'error';
            badge = 'CANCELADA';
            titulo = 'Entrada cancelada';
        } else if (
            lowerMessage.includes('no existe') ||
            lowerMessage.includes('no encontrado') ||
            lowerMessage.includes('inválid') ||
            lowerMessage.includes('invalida')
        ) {
            variant = 'error';
            badge = 'INVÁLIDO';
            titulo = 'Código no válido';
        }

        return {
            ok,
            message,
            variant,
            badge,
            titulo,
            subtitulo,
            asistente: extraerNombreAsistente(data),
            evento: extraerEvento(data),
            tipoEntrada: extraerTipoEntrada(data),
            estado: extraerEstado(data)
        };
    }

    function renderResultado(data, codigo) {
        if (!cameraDom.resultadoCard) return;

        const visual = normalizarResultadoVisual(data);

        cameraDom.resultadoCard.classList.remove('d-none', 'is-success', 'is-error', 'is-warning');
        cameraDom.resultadoCard.classList.add(
            visual.variant === 'success'
                ? 'is-success'
                : visual.variant === 'error'
                    ? 'is-error'
                    : 'is-warning'
        );

        if (cameraDom.resultadoTitulo) cameraDom.resultadoTitulo.textContent = visual.titulo;
        if (cameraDom.resultadoSubtitulo) cameraDom.resultadoSubtitulo.textContent = visual.subtitulo;
        if (cameraDom.resultadoBadge) cameraDom.resultadoBadge.textContent = visual.badge;
        if (cameraDom.detalleAsistente) cameraDom.detalleAsistente.textContent = visual.asistente;
        if (cameraDom.detalleEvento) cameraDom.detalleEvento.textContent = visual.evento;
        if (cameraDom.detalleTipoEntrada) cameraDom.detalleTipoEntrada.textContent = visual.tipoEntrada;
        if (cameraDom.detalleEstado) cameraDom.detalleEstado.textContent = visual.estado;
        if (cameraDom.detalleMensaje) cameraDom.detalleMensaje.textContent = visual.message;
        if (cameraDom.detalleCodigo) cameraDom.detalleCodigo.textContent = codigo || '-';

        if (visual.variant === 'success') {
            setEstado('Validación exitosa', 'Entrada válida');
            reproducirTono('success');
        } else if (visual.variant === 'error') {
            setEstado('Lectura rechazada', visual.badge);
            reproducirTono('error');
        } else {
            setEstado('Lectura completada con observación', visual.badge);
        }
    }

    function limpiarResultado() {
        if (cameraDom.resultadoCard) {
            cameraDom.resultadoCard.classList.add('d-none');
            cameraDom.resultadoCard.classList.remove('is-success', 'is-error', 'is-warning');
        }

        if (cameraDom.resultadoTitulo) cameraDom.resultadoTitulo.textContent = 'Resultado';
        if (cameraDom.resultadoSubtitulo) cameraDom.resultadoSubtitulo.textContent = 'Aún no se ha validado ninguna entrada.';
        if (cameraDom.resultadoBadge) cameraDom.resultadoBadge.textContent = '---';
        if (cameraDom.detalleAsistente) cameraDom.detalleAsistente.textContent = '-';
        if (cameraDom.detalleEvento) cameraDom.detalleEvento.textContent = '-';
        if (cameraDom.detalleTipoEntrada) cameraDom.detalleTipoEntrada.textContent = '-';
        if (cameraDom.detalleEstado) cameraDom.detalleEstado.textContent = '-';
        if (cameraDom.detalleMensaje) cameraDom.detalleMensaje.textContent = '-';
        if (cameraDom.detalleCodigo) cameraDom.detalleCodigo.textContent = '-';

        setEstado(scannerState.isRunning ? 'Escaneando QR...' : 'Esperando acción', scannerState.isRunning ? 'Cámara activa' : 'Cámara inactiva');
    }

    function poblarSelectCamaras() {
        if (!cameraDom.selectCamera) return;

        cameraDom.selectCamera.innerHTML = '';

        if (!scannerState.cameras.length) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No se detectaron cámaras';
            cameraDom.selectCamera.appendChild(option);
            cameraDom.selectCamera.disabled = true;
            return;
        }

        scannerState.cameras.forEach((camera, index) => {
            const option = document.createElement('option');
            option.value = camera.id;
            option.textContent = camera.label || `Cámara ${index + 1}`;
            cameraDom.selectCamera.appendChild(option);
        });

        const preferida =
            scannerState.cameras.find(c => /back|rear|environment|tr[aá]s/i.test(c.label || '')) ||
            scannerState.cameras[0];

        scannerState.currentCameraId = preferida.id;
        cameraDom.selectCamera.value = preferida.id;
        cameraDom.selectCamera.disabled = false;
    }

    async function cargarCamaras() {
        if (typeof Html5Qrcode === 'undefined' || !window.Html5Qrcode) {
            throw new Error('La librería html5-qrcode no está disponible');
        }

        const cameras = await Html5Qrcode.getCameras();
        scannerState.cameras = Array.isArray(cameras) ? cameras : [];
        poblarSelectCamaras();

        if (!scannerState.cameras.length) {
            throw new Error('No se detectaron cámaras disponibles en este dispositivo');
        }
    }

    function obtenerConfigEscaner() {
        return {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
            rememberLastUsedCamera: true
        };
    }

    async function iniciarCamara() {
        try {
            if (scannerState.isRunning || scannerState.isProcessing) return;

            if (typeof Html5Qrcode === 'undefined' || !window.Html5Qrcode) {
                throw new Error('No se cargó la librería de escaneo QR');
            }

            if (!cameraDom.qrReader) {
                throw new Error('No se encontró el contenedor del lector QR');
            }

            setEstado('Preparando cámara...', 'Inicializando');
            setButtonsState();

            if (!scannerState.cameras.length) {
                await cargarCamaras();
            }

            const cameraId = cameraDom.selectCamera?.value || scannerState.currentCameraId || scannerState.cameras[0]?.id;

            if (!cameraId) {
                throw new Error('No hay una cámara seleccionada');
            }

            scannerState.currentCameraId = cameraId;

            if (!scannerState.html5QrCode) {
                scannerState.html5QrCode = new Html5Qrcode('qr-reader');
            }

            setPlaceholderVisible(false);

            await scannerState.html5QrCode.start(
                { deviceId: { exact: cameraId } },
                obtenerConfigEscaner(),
                onScanSuccess,
                onScanFailure
            );

            scannerState.isRunning = true;
            setEstado('Escaneando QR...', 'Cámara activa');
            setButtonsState();

            if (typeof mostrarToast === 'function') {
                mostrarToast('Cámara iniciada correctamente', 'success');
            }
        } catch (error) {
            console.error('Error iniciando cámara:', error);
            scannerState.isRunning = false;
            setButtonsState();
            setPlaceholderVisible(true);
            setEstado('No se pudo iniciar la cámara', 'Error cámara');

            if (typeof mostrarToast === 'function') {
                mostrarToast(error.message || 'No se pudo iniciar la cámara', 'error');
            }
        }
    }

    async function detenerCamara() {
        try {
            if (!scannerState.html5QrCode || !scannerState.isRunning) {
                scannerState.isRunning = false;
                setButtonsState();
                setPlaceholderVisible(true);
                setEstado('Cámara detenida', 'Cámara inactiva');
                return;
            }

            setEstado('Deteniendo cámara...', 'Cerrando');

            await scannerState.html5QrCode.stop();
            await scannerState.html5QrCode.clear();

            scannerState.html5QrCode = null;
            scannerState.isRunning = false;
            scannerState.isProcessing = false;

            setPlaceholderVisible(true);
            setEstado('Cámara detenida', 'Cámara inactiva');
            setButtonsState();

            if (typeof mostrarToast === 'function') {
                mostrarToast('Cámara detenida', 'info');
            }
        } catch (error) {
            console.error('Error deteniendo cámara:', error);

            scannerState.isRunning = false;
            scannerState.isProcessing = false;
            scannerState.html5QrCode = null;

            setPlaceholderVisible(true);
            setEstado('Cámara detenida con recuperación', 'Cámara inactiva');
            setButtonsState();

            if (typeof mostrarToast === 'function') {
                mostrarToast('La cámara se cerró con recuperación', 'warning');
            }
        }
    }

    function onScanFailure() {
        // lectura fallida normal en tiempo real
    }

    async function onScanSuccess(decodedText) {
        const codigo = String(decodedText || '').trim();
        if (!codigo) return;

        const now = Date.now();

        if (scannerState.isProcessing) return;

        if (
            codigo === scannerState.lastScanText &&
            (now - scannerState.lastScanAt) < COOLDOWN_MS
        ) {
            return;
        }

        scannerState.lastScanText = codigo;
        scannerState.lastScanAt = now;
        scannerState.isProcessing = true;
        setButtonsState();

        if (cameraDom.ultimoCodigo) {
            cameraDom.ultimoCodigo.textContent = codigo;
        }

        setEstado('Validando código escaneado...', 'Validando');

        try {
            await validarCodigoEscaneado(codigo);
        } finally {
            window.setTimeout(() => {
                scannerState.isProcessing = false;
                if (scannerState.isRunning) {
                    setEstado('Escaneando QR...', 'Cámara activa');
                }
                setButtonsState();
            }, COOLDOWN_MS);
        }
    }

    async function validarCodigoEscaneado(codigo) {
        const punto_acceso = cameraDom.puntoAcceso?.value?.trim() || 'Principal';
        const validado_por = cameraDom.validadoPor?.value?.trim() || 'Admin';

        try {
            if (typeof mostrarLoading === 'function') {
                mostrarLoading(true);
            }

            const fetchFn = typeof fetchConCsrf === 'function'
                ? fetchConCsrf
                : window.fetch.bind(window);

            const response = await fetchFn(`${CAMERA_API_BASE}/validar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'same-origin',
                body: JSON.stringify({
                    codigo,
                    punto_acceso,
                    validado_por
                })
            });

            const data = await response.json().catch(() => ({}));

            renderResultado(data, codigo);

            if (data.ok) {
                if (typeof mostrarToast === 'function') {
                    mostrarToast(data.message || 'Entrada validada correctamente', 'success');
                }

                if (typeof cargarResumen === 'function') {
                    await cargarResumen();
                }

                if (typeof cargarAsistentes === 'function') {
                    await cargarAsistentes(false);
                }
            } else {
                if (typeof mostrarToast === 'function') {
                    mostrarToast(data.message || 'No se pudo validar la entrada', 'warning');
                }
            }
        } catch (error) {
            console.error('Error validando código escaneado:', error);

            const errorData = {
                ok: false,
                message: error.message || 'Error validando entrada'
            };

            renderResultado(errorData, codigo);

            if (typeof mostrarToast === 'function') {
                mostrarToast('Error validando entrada escaneada', 'error');
            }
        } finally {
            if (typeof mostrarLoading === 'function') {
                mostrarLoading(false);
            }
        }
    }

    function bindEvents() {
        if (cameraDom.btnIniciar) {
            cameraDom.btnIniciar.addEventListener('click', iniciarCamara);
        }

        if (cameraDom.btnDetener) {
            cameraDom.btnDetener.addEventListener('click', detenerCamara);
        }

        if (cameraDom.btnLimpiar) {
            cameraDom.btnLimpiar.addEventListener('click', limpiarResultado);
        }

        if (cameraDom.selectCamera) {
            cameraDom.selectCamera.addEventListener('change', (event) => {
                scannerState.currentCameraId = event.target.value || '';
            });
        }

        window.addEventListener('beforeunload', () => {
            if (scannerState.html5QrCode && scannerState.isRunning) {
                scannerState.html5QrCode.stop().catch(() => { });
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden && scannerState.isRunning) {
                detenerCamara().catch(() => { });
            }
        });
    }

    async function initCameraModule() {
        const hayUICompleta =
            cameraDom.btnIniciar &&
            cameraDom.btnDetener &&
            cameraDom.selectCamera &&
            cameraDom.qrReader;

        if (!hayUICompleta) {
            return;
        }

        limpiarResultado();
        setButtonsState();

        try {
            await cargarCamaras();
            setEstado('Cámara lista para iniciar', 'Disponible');
        } catch (error) {
            console.warn('Módulo de cámara no listo:', error);
            setEstado('No hay cámara disponible', 'Sin cámara');

            if (cameraDom.selectCamera) {
                cameraDom.selectCamera.disabled = true;
            }
        }

        bindEvents();
    }

    document.addEventListener('DOMContentLoaded', () => {
        initCameraModule().catch((error) => {
            console.error('Error inicializando asistente-camera.js:', error);

            if (typeof mostrarToast === 'function') {
                mostrarToast('No se pudo inicializar el escáner QR', 'error');
            }
        });
    });
})();