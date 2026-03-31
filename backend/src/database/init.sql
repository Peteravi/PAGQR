CREATE TABLE IF NOT EXISTS clientes (
    id_cliente INT AUTO_INCREMENT PRIMARY KEY,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    telefono VARCHAR(20),
    cedula_ruc VARCHAR(20),
    direccion VARCHAR(255),
    fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado ENUM('activo', 'inactivo') NOT NULL DEFAULT 'activo'
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS eventos (
    id_evento INT AUTO_INCREMENT PRIMARY KEY,
    titulo VARCHAR(150) NOT NULL,
    descripcion TEXT,
    categoria VARCHAR(100),
    lugar VARCHAR(150) NOT NULL,
    direccion VARCHAR(255),
    ciudad VARCHAR(100),
    fecha_evento DATETIME NOT NULL,
    fecha_fin_evento DATETIME NULL,
    imagen_url VARCHAR(255),
    organizador VARCHAR(150),
    estado ENUM('borrador', 'publicado', 'agotado', 'cancelado', 'finalizado') NOT NULL DEFAULT 'borrador',
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;


ALTER TABLE eventos ADD COLUMN precio DECIMAL(10,2) DEFAULT 0.00 NOT NULL;

CREATE TABLE IF NOT EXISTS tipos_entrada (
    id_tipo_entrada INT AUTO_INCREMENT PRIMARY KEY,
    id_evento INT NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    descripcion VARCHAR(255),
    precio DECIMAL(10,2) NOT NULL,
    stock_total INT NOT NULL,
    stock_disponible INT NOT NULL,
    max_por_compra INT NOT NULL DEFAULT 10,
    fecha_inicio_venta DATETIME NULL,
    fecha_fin_venta DATETIME NULL,
    estado ENUM('activo', 'inactivo', 'agotado') NOT NULL DEFAULT 'activo',
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tipos_entrada_evento
        FOREIGN KEY (id_evento) REFERENCES eventos(id_evento)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ordenes (
    id_orden INT AUTO_INCREMENT PRIMARY KEY,
    id_cliente INT NOT NULL,
    codigo_orden VARCHAR(50) NOT NULL UNIQUE,
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    iva DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    moneda VARCHAR(10) NOT NULL DEFAULT 'USD',
    estado ENUM('pendiente', 'pagada', 'fallida', 'cancelada', 'reembolsada') NOT NULL DEFAULT 'pendiente',
    metodo_pago VARCHAR(50) DEFAULT 'Payphone',
    observacion TEXT NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_ordenes_cliente
        FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orden_detalle (
    id_detalle INT AUTO_INCREMENT PRIMARY KEY,
    id_orden INT NOT NULL,
    id_tipo_entrada INT NOT NULL,
    cantidad INT NOT NULL,
    precio_unitario DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    CONSTRAINT fk_orden_detalle_orden
        FOREIGN KEY (id_orden) REFERENCES ordenes(id_orden)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_orden_detalle_tipo_entrada
        FOREIGN KEY (id_tipo_entrada) REFERENCES tipos_entrada(id_tipo_entrada)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pagos (
    id_pago INT AUTO_INCREMENT PRIMARY KEY,
    id_orden INT NOT NULL,
    proveedor_pago VARCHAR(50) NOT NULL DEFAULT 'Payphone',
    transaccion_id VARCHAR(100) NULL,
    referencia_pago VARCHAR(100) NULL,
    authorization_code VARCHAR(100) NULL,
    monto DECIMAL(10,2) NOT NULL,
    moneda VARCHAR(10) NOT NULL DEFAULT 'USD',
    estado ENUM('iniciado', 'pendiente', 'aprobado', 'rechazado', 'anulado', 'reembolsado') NOT NULL DEFAULT 'iniciado',
    respuesta_gateway JSON NULL,
    fecha_pago DATETIME NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_pagos_orden
        FOREIGN KEY (id_orden) REFERENCES ordenes(id_orden)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS entradas (
    id_entrada INT AUTO_INCREMENT PRIMARY KEY,
    id_orden INT NOT NULL,
    id_evento INT NOT NULL,
    id_tipo_entrada INT NOT NULL,
    codigo_entrada VARCHAR(100) NOT NULL UNIQUE,
    codigo_qr VARCHAR(255) NOT NULL UNIQUE,
    nombre_asistente VARCHAR(150) NULL,
    email_asistente VARCHAR(150) NULL,
    estado ENUM('generada', 'enviada', 'usada', 'cancelada') NOT NULL DEFAULT 'generada',
    fecha_generacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_uso DATETIME NULL,
    CONSTRAINT fk_entradas_orden
        FOREIGN KEY (id_orden) REFERENCES ordenes(id_orden)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_entradas_evento
        FOREIGN KEY (id_evento) REFERENCES eventos(id_evento)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_entradas_tipo_entrada
        FOREIGN KEY (id_tipo_entrada) REFERENCES tipos_entrada(id_tipo_entrada)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS validaciones_qr (
    id_validacion INT AUTO_INCREMENT PRIMARY KEY,
    id_entrada INT NOT NULL,
    fecha_validacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    punto_acceso VARCHAR(100) NULL,
    validado_por VARCHAR(100) NULL,
    resultado ENUM('valido', 'rechazado', 'duplicado') NOT NULL,
    observacion VARCHAR(255) NULL,
    CONSTRAINT fk_validaciones_entrada
        FOREIGN KEY (id_entrada) REFERENCES entradas(id_entrada)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS facturas (
    id_factura INT AUTO_INCREMENT PRIMARY KEY,
    id_orden INT NOT NULL,
    numero_factura VARCHAR(50) NOT NULL UNIQUE,
    razon_social VARCHAR(150) NOT NULL,
    identificacion VARCHAR(20) NOT NULL,
    direccion VARCHAR(255),
    email_facturacion VARCHAR(150),
    subtotal DECIMAL(10,2) NOT NULL,
    iva DECIMAL(10,2) NOT NULL,
    total DECIMAL(10,2) NOT NULL,
    fecha_emision DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado ENUM('emitida', 'anulada') NOT NULL DEFAULT 'emitida',
    CONSTRAINT fk_facturas_orden
        FOREIGN KEY (id_orden) REFERENCES ordenes(id_orden)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
) ENGINE=InnoDB;
