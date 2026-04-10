require('dotenv').config();

const app = require('./app');
const pool = require('./config/db');
const initDatabase = require('./database/initDb');
const OrderDB = require('./database/OrderDB');

const PORT = process.env.PORT || 3000;
const ORDER_EXPIRATION_CHECK_MS = (() => {
  const raw = Number(process.env.ORDER_EXPIRATION_CHECK_MS);
  return Number.isInteger(raw) && raw > 0 ? raw : 60 * 1000;
})();

let expirationJobRunning = false;

async function processExpiredOrders() {
  if (expirationJobRunning) {
    return;
  }

  expirationJobRunning = true;

  try {
    const result = await OrderDB.expirarOrdenesPendientes(100);

    if (result && result.expired > 0) {
      console.log(
        `⏰ Órdenes expiradas automáticamente: ${result.expired} de ${result.processed} revisadas`
      );
    }
  } catch (error) {
    console.error('❌ Error expirando órdenes pendientes:', error.message);
  } finally {
    expirationJobRunning = false;
  }
}

function startOrderExpirationJob() {
  console.log(
    `🕒 Expiración automática de órdenes activada cada ${Math.floor(ORDER_EXPIRATION_CHECK_MS / 1000)} segundos`
  );

  setInterval(() => {
    processExpiredOrders().catch((error) => {
      console.error('❌ Error en tarea programada de expiración:', error.message);
    });
  }, ORDER_EXPIRATION_CHECK_MS);

  setTimeout(() => {
    processExpiredOrders().catch((error) => {
      console.error('❌ Error en primera revisión de expiración:', error.message);
    });
  }, 5000);
}

async function startServer() {
  try {
    await initDatabase(pool);

    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    });

    startOrderExpirationJob();
  } catch (error) {
    console.error('❌ No se pudo iniciar el servidor:', error.message);
    process.exit(1);
  }
}

startServer();