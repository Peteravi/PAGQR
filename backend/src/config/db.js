const mysql = require('mysql2/promise');
require('dotenv').config();

const {
  DB_HOST = 'mysql.railway.internal',
  DB_PORT = 3306,
  DB_USER = 'root',
  DB_PASSWORD = 'EszZHkoRYvjPnEUDXhqxwwXghsFMsKDu',
  DB_NAME = 'railway'
} = process.env;

const pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true
});

module.exports = pool;