const express = require('express');
const router = express.Router();
const EmailService = require('../services/EmailService');

const SUPPORT_EMAILS = ['pagqrticket@gmail.com', 'sogralquito@gmail.com'];

router.post('/', async (req, res) => {
    try {
        const { nombres, apellidos, email, telefono, asunto, mensaje } = req.body;

        if (!nombres || !apellidos || !email || !asunto || !mensaje) {
            return res.status(400).json({
                ok: false,
                message: 'Todos los campos obligatorios deben ser completados.'
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                ok: false,
                message: 'El correo electrónico no es válido.'
            });
        }

        const mailOptions = {
            from: `PagQR Contacto <${process.env.SMTP_USER || 'noreply@pagqr.com'}>`,
            to: SUPPORT_EMAILS.join(', '),
            subject: `[PagQR Contacto] ${asunto} - ${nombres} ${apellidos}`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <style>
                        body { font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
                        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                        .header { background: #1a1a2e; color: white; padding: 20px; text-align: center; }
                        .header h1 { margin: 0; font-size: 20px; }
                        .content { padding: 25px; }
                        .info-item { margin-bottom: 15px; padding: 12px; background: #f9fafb; border-radius: 6px; }
                        .info-label { font-size: 12px; color: #6b7280; text-transform: uppercase; }
                        .info-value { font-size: 14px; font-weight: bold; color: #1f2937; margin-top: 5px; }
                        .mensaje-box { margin-top: 20px; padding: 15px; background: #f3f4f6; border-radius: 8px; border-left: 4px solid #0d6efd; }
                        .footer { background: #1f2937; color: #9ca3af; padding: 15px; text-align: center; font-size: 12px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>📩 Nuevo mensaje de contacto</h1>
                        </div>
                        <div class="content">
                            <div class="info-item">
                                <div class="info-label">Nombre completo</div>
                                <div class="info-value">${nombres} ${apellidos}</div>
                            </div>
                            
                            <div class="info-item">
                                <div class="info-label">Correo electrónico</div>
                                <div class="info-value">${email}</div>
                            </div>
                            
                            ${telefono ? `
                            <div class="info-item">
                                <div class="info-label">Teléfono</div>
                                <div class="info-value">${telefono}</div>
                            </div>
                            ` : ''}
                            
                            <div class="info-item">
                                <div class="info-label">Asunto</div>
                                <div class="info-value">${asunto}</div>
                            </div>
                            
                            <div class="mensaje-box">
                                <div class="info-label">Mensaje</div>
                                <div class="info-value" style="white-space: pre-wrap;">${mensaje}</div>
                            </div>
                        </div>
                        <div class="footer">
                            <p>Este correo fue enviado desde la página de contacto de PagQR</p>
                        </div>
                    </div>
                </body>
                </html>
            `
        };

        await EmailService.transporter.sendMail(mailOptions);

        console.log(`✅ [Contacto] Mensaje enviado desde ${email} - Asunto: ${asunto}`);

        res.json({
            ok: true,
            message: 'Mensaje enviado correctamente.'
        });

    } catch (error) {
        console.error('❌ [Contacto] Error:', error.message);
        res.status(500).json({
            ok: false,
            message: 'Error al enviar el mensaje. Intenta de nuevo.'
        });
    }
});

module.exports = router;