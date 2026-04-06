const express = require('express');
const router = express.Router();
const BillBusiness = require('../business/BillBusiness');

router.get('/api/factura/:id_orden', async (req, res) => {
    try {
        const idOrden = req.params.id_orden;

        const { doc, numeroFactura } = await BillBusiness.generarStreamPDF(idOrden);

        // Configuramos las cabeceras para que el navegador sepa que es un PDF descargable
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Factura_${numeroFactura}.pdf`);

        // Conectamos el documento (Stream) directamente con la respuesta (res)
        doc.pipe(res);

    } catch (error) {
        console.error('🚨 [Endpoint Factura] Error al generar PDF:', error.message);

        if (error.message.includes('no encontrada')) {
            return res.status(404).json({ error: 'La factura no existe' });
        }

        return res.status(500).json({ error: 'Error interno generando el PDF' });
    }
});

module.exports = router;