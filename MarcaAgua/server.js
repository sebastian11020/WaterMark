const express = require('express');
const fileUpload = require('express-fileupload');
const Jimp = require('jimp');
const sharp = require('sharp');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const winston = require('winston');

const app = express();
const port = process.env.PORT || 3000;

if (!fs.existsSync('logs')) {
    fs.mkdirSync('logs');
}

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console({
            format: winston.format.simple(),
        }),
        new winston.transports.File({ filename: 'logs/server.log' })
    ],
});

app.use(cors());
app.use(fileUpload());

app.post('/upload', async (req, res) => {
    const logEntry = {
        date: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        status: null,
        payload: req.body || {},
        result: null,
    };

    if (!req.files || Object.keys(req.files).length === 0) {
        logEntry.status = 400;
        logEntry.result = 'No files were uploaded.';
        logger.warn(JSON.stringify(logEntry));
        return res.status(400).send(logEntry.result);
    }

    try {
        let buffer = req.files.image.data;

        const mimeType = req.files.image.mimetype;
        if (mimeType === 'image/webp') {
            buffer = await sharp(buffer).png().toBuffer();
        }

        let image = await Jimp.read(buffer);
        let watermark = await Jimp.read(path.join(__dirname, 'watermark.png'));

        const standardWidth = 800;
        const standardHeight = 600;
        image.resize(standardWidth, standardHeight);

        const watermarkWidth = image.bitmap.width * 0.1; // Ajusta el factor de escala según sea necesario
        watermark.resize(watermarkWidth, Jimp.AUTO);

        const x = image.bitmap.width - watermark.bitmap.width - 10; 
        const y = image.bitmap.height - watermark.bitmap.height - 10; 

        image.composite(watermark, x, y, {
            mode: Jimp.BLEND_SOURCE_OVER,
            opacitySource: 0.5 
        });

        const outputBuffer = await image.getBufferAsync(Jimp.MIME_PNG);
        res.set('Content-Type', 'image/png');
        logEntry.status = 200;
        logEntry.result = 'Image processed successfully';
        logger.info(JSON.stringify(logEntry));
        res.send(outputBuffer);
    } catch (error) {
        logEntry.status = 500;
        logEntry.result = 'Error processing the image: ' + error.message;
        logger.error(JSON.stringify(logEntry));
        res.status(500).send(logEntry.result);
    }
});

app.get('/health-check', (req, res) => {
    const logEntry = {
        date: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        status: 200,
        payload: {},
        result: 'OK',
    };

    logger.info(JSON.stringify(logEntry));
    res.status(200).send('OK');
});

app.listen(port, () => {
    logger.info('Server running at http://localhost:${port}');
});