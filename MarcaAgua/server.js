const express = require('express');
const fileUpload = require('express-fileupload');
const Jimp = require('jimp');
const sharp = require('sharp');
const cors = require('cors');
const path = require('path');
const app = express();
const port = 3000;

app.use(cors());
app.use(fileUpload());


app.post('/upload', async (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).send('No files were uploaded.');
    }

    try {
        let buffer = req.files.image.data;
        
        // Convertir a PNG si es webp usando sharp
        const mimeType = req.files.image.mimetype;
        if (mimeType === 'image/webp') {
            buffer = await sharp(buffer).png().toBuffer();
        }
        
        let image = await Jimp.read(buffer);
        let watermark = await Jimp.read(path.join(__dirname, 'watermark.png'));

        // Redimensionar la imagen a un tamaño estándar (800x600)
        const standardWidth = 800;
        const standardHeight = 600;
        image.resize(standardWidth, standardHeight);

        // Ajustar tamaño de la marca de agua proporcionalmente
        const scaleFactor = 0.2; // Tamaño relativo de la marca de agua (20% del ancho de la imagen)
        const watermarkWidth = image.bitmap.width * scaleFactor;
        watermark.resize(watermarkWidth, Jimp.AUTO);

        // Posicionar la marca de agua en la esquina inferior derecha
        const x = image.bitmap.width - watermark.bitmap.width - 10; // 10 px desde el borde
        const y = image.bitmap.height - watermark.bitmap.height - 10; // 10 px desde el borde

        image.composite(watermark, x, y, {
            mode: Jimp.BLEND_SOURCE_OVER,
            opacitySource: 0.5 // Ajustar opacidad de la marca de agua
        });

        const outputBuffer = await image.getBufferAsync(Jimp.MIME_PNG);
        res.set('Content-Type', 'image/png');
        res.send(outputBuffer);
    } catch (error) {
        console.error("Error processing the image:", error);
        res.status(500).send('Error processing the image.');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});