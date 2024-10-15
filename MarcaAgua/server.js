const express = require('express');
const fileUpload = require('express-fileupload');
const Jimp = require('jimp');
const sharp = require('sharp');
const cors = require('cors');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(fileUpload());

app.post('/upload', async (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).send('No files were uploaded.');
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
        res.send(outputBuffer);
    } catch (error) {
        console.error("Error processing the image:", error);
        res.status(500).send('Error processing the image.');
    }
});

app.get('/health-check', (req, res) => {
    res.status(200).send('OK');
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});