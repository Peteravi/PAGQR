# PagQR 🎟️

Sistema web para gestión de eventos, venta de entradas con QR y panel administrativo.

---

## 🚀 Estado del proyecto

Este proyecto se encuentra en una fase **funcional intermedia-avanzada (~70%)**.

Actualmente incluye:

- Backend con Node.js + Express
- Base de datos MySQL con inicialización automática
- Frontend público para compra de entradas
- Panel administrativo (eventos, ventas, asistentes)
- Generación de entradas con código QR
- Flujo básico de pagos (integración PayPhone en desarrollo)
- Exportación de asistentes (CSV)

⚠️ **No está listo para producción todavía** (ver sección “Pendientes”).

---

## 📁 Estructura del proyecto
PagQR/
│
├── backend/
│ └── src/
│ ├── app.js
│ ├── server.js
│ ├── config/
│ ├── database/
│ │ ├── connection.js
│ │ ├── init.sql
│ │ └── initDb.js
│ ├── routes/
│ │ ├── eventos.js
│ │ ├── tipos-entrada.js
│ │ ├── ordenes.js
│ │ ├── pagos.js
│ │ ├── entradas.js
│ │ └── asistentes.js
│ └── services/
│
├── frontend/
│ ├── public/
│ │ ├── index.html
│ │ ├── eventos.html
│ │ ├── confirmacion.html
│ │ ├── error-pago.html
│ │ ├── mis-entradas.html
│ │ ├── ticket.html
│ │ └── assets/
│ │
│ └── admin/
│ ├── pages/
│ │ ├── admin.html
│ │ ├── ventas.html
│ │ └── asistente.html
│ └── assets/
│ └── js/
│ ├── admin.js
│ ├── admin-ventas.js
│ └── asistentes.js
│
├── package.json
└── README.md


---

## ⚙️ Tecnologías usadas

### Backend
- Node.js
- Express
- MySQL (`mysql2`)
- Multer (subida de imágenes)
- QRCode (generación de QR)

### Frontend
- HTML + CSS + JavaScript (vanilla)
- Bootstrap (en algunas vistas)

---

## 🧩 Funcionalidades implementadas

### 🎫 Eventos
- Crear eventos
- Editar eventos
- Eliminar eventos
- Subir imagen
- Listar eventos

### 🎟️ Tipos de entrada
- Crear tipos de entrada
- Definir precio y stock
- Relación con eventos

### 🧾 Órdenes
- Crear órdenes
- Asociar cliente
- Validar stock
- Descontar stock automáticamente
- Guardar detalle de compra

### 💳 Pagos (parcial)
- Generación de link de pago
- Webhook para confirmar pago
- Cambio de estado de orden
- Generación de entradas al pagar

⚠️ Integración PayPhone **no finalizada completamente**

### 🎫 Entradas (QR)
- Generación de código QR
- Consulta por email o documento
- Consulta por código único
- Vista de ticket

### 👥 Asistentes (Admin)
- Listado de asistentes
- Filtros por evento y búsqueda
- Paginación
- Exportación CSV
- Validación manual de entradas
- Historial de validaciones

### 📊 Panel Admin
- Gestión de eventos
- Vista de ventas
- Vista de asistentes

---

## ▶️ Cómo ejecutar el proyecto

### 1. Instalar dependencias

```bash
npm install

