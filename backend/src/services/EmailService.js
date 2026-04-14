const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: Number(process.env.SMTP_PORT) || 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        this.fromEmail = process.env.SMTP_FROM || 'PagQR <noreply@pagqr.com>';
        this.frontendUrl = process.env.FRONTEND_URL || 'https://pagqr-production.up.railway.app';
    }

    async enviarConfirmacionCompra(datosOrden, entradas) {
        try {
            const { email, nombres, apellidos, codigo_orden, total, fecha_evento, titulo, lugar, ciudad } = datosOrden;
            
            if (!email) {
                console.warn('⚠️ [Email] No se encontró email para enviar confirmación');
                return { ok: false, message: 'Email no disponible' };
            }

            const entradasHtml = await Promise.all(entradas.map(async (entrada) => {
                const qrImage = await QRCode.toDataURL(entrada.codigo_qr, {
                    width: 200,
                    margin: 1
                });

                return `
                    <div style="background: #f8f9fa; border-radius: 8px; padding: 15px; margin: 10px 0;">
                        <h4 style="margin: 0 0 10px 0; color: #333;">${entrada.tipo_nombre}</h4>
                        <p style="margin: 5px 0;"><strong>Código:</strong> ${entrada.codigo_entrada}</p>
                        <p style="margin: 5px 0;"><strong>QR:</strong></p>
                        <img src="${qrImage}" alt="QR Code" style="width: 150px; height: 150px;" />
                    </div>
                `;
            }));

            const mailOptions = {
                from: this.fromEmail,
                to: email,
                subject: `Confirmación de compra - ${titulo}`,
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <style>
                            body { font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
                            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                            .header { background: #4f46e5; color: white; padding: 30px; text-align: center; }
                            .header h1 { margin: 0; font-size: 24px; }
                            .content { padding: 30px; }
                            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
                            .info-item { background: #f9fafb; padding: 15px; border-radius: 8px; }
                            .info-label { font-size: 12px; color: #6b7280; text-transform: uppercase; }
                            .info-value { font-size: 16px; font-weight: bold; color: #1f2937; margin-top: 5px; }
                            .entradas-section { margin-top: 25px; }
                            .footer { background: #1f2937; color: #9ca3af; padding: 20px; text-align: center; font-size: 12px; }
                            .btn { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1>🎫 Confirmación de Compra</h1>
                            </div>
                            <div class="content">
                                <p style="font-size: 16px;">Hola <strong>${nombres} ${apellidos}</strong>,</p>
                                <p>Tu compra ha sido confirmada. Aquí están tus entradas:</p>
                                
                                <div class="info-grid">
                                    <div class="info-item">
                                        <div class="info-label">Número de Orden</div>
                                        <div class="info-value">${codigo_orden}</div>
                                    </div>
                                    <div class="info-item">
                                        <div class="info-label">Total Pagado</div>
                                        <div class="info-value">$${total.toFixed(2)}</div>
                                    </div>
                                    <div class="info-item">
                                        <div class="info-label">Evento</div>
                                        <div class="info-value">${titulo}</div>
                                    </div>
                                    <div class="info-item">
                                        <div class="info-label">Fecha del Evento</div>
                                        <div class="info-value">${new Date(fecha_evento).toLocaleString()}</div>
                                    </div>
                                    <div class="info-item">
                                        <div class="info-label">Lugar</div>
                                        <div class="info-value">${lugar}${ciudad ? ', ' + ciudad : ''}</div>
                                    </div>
                                </div>

                                <div class="entradas-section">
                                    <h3 style="color: #1f2937;">Tus Entradas</h3>
                                    ${entradasHtml.join('')}
                                </div>

                                <p style="margin-top: 25px; color: #6b7280; font-size: 14px;">
                                    Presentas los códigos QR en la entrada del evento. 
                                    También puedes ver tus entradas en cualquier momento en nuestra plataforma.
                                </p>

                                <a href="${this.frontendUrl}/mis-entradas.html" class="btn">Ver Mis Entradas</a>
                            </div>
                            <div class="footer">
                                <p>Gracias por confiar en PagQR</p>
                                <p>Este es un correo automático, por favor no respondas este mensaje.</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            };

            const result = await this.transporter.sendMail(mailOptions);
            console.log(`✅ [Email] Correo enviado a ${email}`);
            return { ok: true, messageId: result.messageId };

        } catch (error) {
            console.error(`❌ [Email] Error enviando correo:`, error.message);
            return { ok: false, error: error.message };
        }
    }
}

module.exports = new EmailService();
