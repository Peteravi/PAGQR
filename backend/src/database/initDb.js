const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const {
  DB_HOST = 'mysql.railway.internal',
  DB_PORT = 3306,
  DB_USER = 'root',
  DB_PASSWORD = 'EszZHkoRYvjPnEUDXhqxwwXghsFMsKDu',
  DB_NAME = 'railway'
} = process.env;

const REQUIRED_TABLES = [
  'clientes',
  'eventos',
  'tipos_entrada',
  'ordenes',
  'orden_detalle',
  'pagos',
  'entradas',
  'validaciones_qr',
  'facturas'
];

const REQUIRED_INDEXES = [
  { table: 'eventos', index: 'idx_eventos_fecha', sql: 'CREATE INDEX idx_eventos_fecha ON eventos(fecha_evento)' },
  { table: 'tipos_entrada', index: 'idx_tipos_entrada_evento', sql: 'CREATE INDEX idx_tipos_entrada_evento ON tipos_entrada(id_evento)' },
  { table: 'ordenes', index: 'idx_ordenes_cliente', sql: 'CREATE INDEX idx_ordenes_cliente ON ordenes(id_cliente)' },
  { table: 'ordenes', index: 'idx_ordenes_estado', sql: 'CREATE INDEX idx_ordenes_estado ON ordenes(estado)' },
  { table: 'pagos', index: 'idx_pagos_estado', sql: 'CREATE INDEX idx_pagos_estado ON pagos(estado)' },
  { table: 'entradas', index: 'idx_entradas_evento', sql: 'CREATE INDEX idx_entradas_evento ON entradas(id_evento)' },
  { table: 'entradas', index: 'idx_entradas_estado', sql: 'CREATE INDEX idx_entradas_estado ON entradas(estado)' },
  { table: 'validaciones_qr', index: 'idx_validaciones_fecha', sql: 'CREATE INDEX idx_validaciones_fecha ON validaciones_qr(fecha_validacion)' },
  { table: 'ordenes', index: 'idx_ordenes_expiracion', sql: 'CREATE INDEX idx_ordenes_expiracion ON ordenes(estado, fecha_expiracion)' }
];

async function ensureDatabase() {
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: Number(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true
  });

  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );

  await connection.end();
}

async function testConnection(pool) {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
    console.log('✅ Conexión a MySQL verificada');
  } finally {
    connection.release();
  }
}

async function runInitSql(pool) {
  const sqlPath = path.join(__dirname, 'init.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
  console.log('✅ Script init.sql ejecutado');
}

async function ensureColumnExists(pool, tableName, columnName, alterSql) {
  const [rows] = await pool.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = ?
      AND table_name = ?
      AND column_name = ?
    LIMIT 1
    `,
    [DB_NAME, tableName, columnName]
  );

  if (rows.length === 0) {
    await pool.query(alterSql);
    console.log(`➕ Columna creada: ${tableName}.${columnName}`);
  } else {
    console.log(`✅ Columna existente: ${tableName}.${columnName}`);
  }
}

async function ensureOrdenesEstadoEnum(pool) {
  const [rows] = await pool.query(
    `
    SELECT COLUMN_TYPE
    FROM information_schema.columns
    WHERE table_schema = ?
      AND table_name = 'ordenes'
      AND column_name = 'estado'
    LIMIT 1
    `,
    [DB_NAME]
  );

  if (!rows.length) {
    throw new Error('No se encontró la columna ordenes.estado');
  }

  const columnType = String(rows[0].COLUMN_TYPE || '').toLowerCase();

  if (columnType.includes("'expirada'")) {
    console.log('✅ ENUM existente: ordenes.estado ya incluye "expirada"');
    return;
  }

  await pool.query(`
    ALTER TABLE ordenes
    MODIFY COLUMN estado ENUM('pendiente', 'pagada', 'fallida', 'cancelada', 'reembolsada', 'expirada')
    NOT NULL DEFAULT 'pendiente'
  `);

  console.log('➕ ENUM actualizado: ordenes.estado ahora incluye "expirada"');
}

async function ensureOrdenesSchema(pool) {
  await ensureColumnExists(
    pool,
    'ordenes',
    'fecha_expiracion',
    `ALTER TABLE ordenes ADD COLUMN fecha_expiracion DATETIME NULL AFTER metodo_pago`
  );

  await ensureColumnExists(
    pool,
    'ordenes',
    'observacion',
    `ALTER TABLE ordenes ADD COLUMN observacion TEXT NULL AFTER fecha_expiracion`
  );

  await ensureOrdenesEstadoEnum(pool);
}

async function ensureEventosPayphoneColumns(pool) {
  await ensureColumnExists(
    pool,
    'eventos',
    'payphone_token',
    `ALTER TABLE eventos ADD COLUMN payphone_token TEXT NULL`
  );

  await ensureColumnExists(
    pool,
    'eventos',
    'payphone_app_id',
    `ALTER TABLE eventos ADD COLUMN payphone_app_id VARCHAR(500) NULL`
  );
}

async function ensureIndexes(pool) {
  for (const item of REQUIRED_INDEXES) {
    const [rows] = await pool.query(
      `
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = ?
        AND table_name = ?
        AND index_name = ?
      LIMIT 1
      `,
      [DB_NAME, item.table, item.index]
    );

    if (rows.length === 0) {
      await pool.query(item.sql);
      console.log(`➕ Índice creado: ${item.index}`);
    } else {
      console.log(`✅ Índice existente: ${item.index}`);
    }
  }
}

async function verifyTables(pool) {
  for (const table of REQUIRED_TABLES) {
    const [rows] = await pool.query(
      `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = ?
        AND table_name = ?
      LIMIT 1
      `,
      [DB_NAME, table]
    );

    if (rows.length === 0) {
      throw new Error(`La tabla ${table} no existe después de la inicialización`);
    }

    console.log(`✅ Tabla verificada: ${table}`);
  }
}

async function initDatabase(pool) {
  try {
    console.log('⏳ Validando base de datos...');
    await ensureDatabase();
    await testConnection(pool);
    await runInitSql(pool);
    await verifyTables(pool);
    await ensureOrdenesSchema(pool);
    await ensureEventosPayphoneColumns(pool);
    await ensureIndexes(pool);
    console.log('✅ Base de datos lista y validada');
  } catch (error) {
    console.error('❌ Error inicializando la base de datos:', error.message);
    throw error;
  }
}

module.exports = initDatabase;