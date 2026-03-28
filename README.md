🎟️ Plataforma de Venta de Entradas Online

Sistema web para la gestión y venta de entradas para eventos, con generación de códigos QR únicos, integración de pagos mediante PayPhone y almacenamiento de datos en MySQL.

📌 Descripción General

Esta plataforma permite a los usuarios:

Explorar eventos disponibles
Comprar entradas online
Realizar pagos mediante PayPhone
Recibir un ticket digital con QR único
Validar entradas mediante escaneo QR

Además, incluye un panel administrativo para la gestión de eventos, ventas, clientes y validación de accesos.

🏗️ Arquitectura del Proyecto

El sistema está dividido en tres partes principales:

Frontend: Interfaz de usuario (HTML, CSS, JS)
Backend: API y lógica del sistema (Node.js)
Base de datos: Gestión de datos (MySQL)

🎨frontend/

Contiene toda la parte visual del sistema (lado cliente).

public/
Archivos públicos accesibles para los usuarios finales.

assets/: Recursos estáticos (CSS, JS, imágenes, íconos, fuentes)
uploads/: Imágenes subidas (eventos, banners, organizadores)
pages/: Vistas organizadas por funcionalidad
Archivos .html: Páginas principales del sitio


admin/
Panel administrativo del sistema.

assets/: Recursos del panel admin
pages/: Vistas del dashboard (eventos, ventas, clientes, reportes)
Archivos .html: Interfaces del panel de administración


⚙️backend/

Contiene toda la lógica del sistema y la API.

src/
config/: Configuraciones generales (BD, entorno, PayPhone, correo)
controllers/: Controladores que manejan las peticiones HTTP
routes/: Definición de endpoints de la API
services/: Lógica de negocio (QR, pagos, emails, PDF, etc.)
models/: Modelos de datos (representación de tablas en MySQL)
database/: Migraciones, seeders y scripts SQL


🗄️ database/

Contiene la estructura y gestión de la base de datos MySQL.

schema/: Definición de tablas