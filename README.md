require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Gmail transporter configuration
const createTransporter = () => {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD
        }
    });
};

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Send email endpoint
app.post('/send-email', upload.single('file'), async (req, res) => {
    try {
        const { to, subject, message } = req.body;
        const file = req.file;

        // Validate required fields
        if (!to || !subject) {
            return res.status(400).json({
                error: 'Missing required fields: to, subject'
            });
        }

        // Validate Gmail credentials
        if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
            return res.status(500).json({
                error: 'Gmail credentials not configured. Please check .env file.'
            });
        }

        // Create transporter
        const transporter = createTransporter();

        // Email options
        const mailOptions = {
            from: `"Escáner QR" <${process.env.GMAIL_USER}>`,
            to: to,
            subject: subject,
            text: message || 'Adjunto encontrarás los códigos QR escaneados.',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #6366f1;">Códigos QR Escaneados</h2>
                    <p style="color: #333; line-height: 1.6;">
                        ${message || 'Adjunto encontrarás los códigos QR escaneados.'}
                    </p>
                    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                    <p style="color: #6b7280; font-size: 12px;">
                        Este correo fue enviado desde la aplicación Escáner QR
                    </p>
                </div>
            `,
            attachments: file ? [{
                filename: file.originalname,
                content: file.buffer,
                contentType: file.mimetype
            }] : []
        };

        // Send email
        const info = await transporter.sendMail(mailOptions);

        console.log('Email sent successfully:', info.messageId);
        res.json({
            success: true,
            message: 'Email sent successfully',
            messageId: info.messageId
        });

    } catch (error) {
        console.error('Error sending email:', error);

        let errorMessage = 'Error sending email';

        if (error.code === 'EAUTH') {
            errorMessage = 'Authentication failed. Please check Gmail credentials.';
        } else if (error.code === 'ESOCKET') {
            errorMessage = 'Network error. Please check your internet connection.';
        } else if (error.message) {
            errorMessage = error.message;
        }

        res.status(500).json({
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Serve index.html for root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    let localIP = 'localhost';

    // Find local IP address
    for (const interfaceName in networkInterfaces) {
        for (const iface of networkInterfaces[interfaceName]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                localIP = iface.address;
                break;
            }
        }
    }

    console.log(`
╔════════════════════════════════════════════╗
║   QR Scanner Server                        ║
║   Running on: http://localhost:${PORT}       ║
║   Network:    http://${localIP}:${PORT}  ║
╚════════════════════════════════════════════╝

📱 Para acceder desde tu teléfono Android:
   1. Asegúrate de que tu teléfono esté en la misma red WiFi
   2. Abre el navegador en tu teléfono
   3. Visita: http://${localIP}:${PORT}

📧 Gmail Configuration:
   User: ${process.env.GMAIL_USER || '❌ NOT SET'}
   Password: ${process.env.GMAIL_APP_PASSWORD ? '✅ SET' : '❌ NOT SET'}

${!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD ?
            `⚠️  WARNING: Gmail credentials not configured!
   Please create a .env file with:
   GMAIL_USER=your-email@gmail.com
   GMAIL_APP_PASSWORD=your-app-password
` : '✅ Ready to send emails!'}
    `);
});

// Error handling
process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});
