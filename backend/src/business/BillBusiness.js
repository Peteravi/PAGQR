const BillDB = require('../database/BillDB');
const PDFDocument = require('pdfkit');

class BillBusiness {
    /**
     * Procesa y arma la entidad de la factura
     * @param {Object} ordenEntity - Los datos completos obtenidos de la DB
     */
    async procesarFactura(ordenEntity) {
        try {
            if (!ordenEntity) {
                throw new Error("No hay datos de orden para facturar.");
            }

            const numeroFactura = `FAC-${Date.now().toString().slice(-6)}`;

            const billEntity = {
                id_orden: ordenEntity.id_orden,
                numero_factura: numeroFactura,
                razon_social: `${ordenEntity.nombres} ${ordenEntity.apellidos}`,
                identificacion: ordenEntity.cedula_ruc || '9999999999',
                direccion: ordenEntity.direccion || 'Guayaquil',
                email_facturacion: ordenEntity.email,
                subtotal: ordenEntity.subtotal,
                iva: ordenEntity.iva,
                total: ordenEntity.total
            };

            await BillDB.generarFactura(billEntity);
            console.log(`🧾 [Facturación] Factura interna ${numeroFactura} creada exitosamente.`);

        } catch (error) {
            console.error(`🚨 [Business] Fallo al procesar la factura:`, error.message);
            throw error;
        }
    }
    async generarStreamPDF(idOrden) {
        // 1. Buscamos los datos reales
        const factura = await BillDB.obtenerFacturaPorOrden(idOrden);
        if (!factura) {
            throw new Error('Factura no encontrada para esta orden');
        }

        // 2. Iniciamos el creador de PDF
        const doc = new PDFDocument({ margin: 50 });

        doc.fontSize(20).text('Factura Electrónica', { align: 'center' });
        doc.moveDown();

        doc.fontSize(12).text(`N° Factura: ${factura.numero_factura}`);
        doc.text(`Fecha de Emisión: ${new Date(factura.fecha_emision).toLocaleDateString()}`);
        doc.moveDown();

        doc.text('Datos del Cliente:', { underline: true });
        doc.text(`Razón Social: ${factura.razon_social}`);
        doc.text(`Cédula/RUC: ${factura.identificacion}`);
        doc.text(`Dirección: ${factura.direccion || 'N/A'}`);
        doc.text(`Email: ${factura.email_facturacion}`);
        doc.moveDown(2);

        doc.text('Detalle de Valores:', { underline: true });
        doc.text(`Subtotal: $${factura.subtotal}`);
        doc.text(`IVA (15%): $${factura.iva}`); // Ajusta si el IVA es distinto
        doc.fontSize(14).text(`Total a Pagar: $${factura.total}`, { bold: true });

        // Finalizamos el documento
        doc.end();

        return { doc, numeroFactura: factura.numero_factura };
    }
}

module.exports = new BillBusiness();