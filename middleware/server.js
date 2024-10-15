require('dotenv').config();
const express = require('express');
const fileUpload = require('express-fileupload');
const Jimp = require('jimp');
const sharp = require('sharp');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const httpProxy = require('http-proxy');
const app = express();
const port = process.env.PORT || 3000;
const loadBalancerPort = process.env.LOAD_BALANCER_PORT || 4000;

app.use(cors());
app.use(fileUpload());

const discoveryServiceUrl = process.env.DISCOVERY_SERVICE_URL;

const registerInstance = async () => {
    try {
        await axios.post(`${discoveryServiceUrl}/register`, { instanceUrl: `http://localhost:${port}` });
        console.log('Instance registered with discovery service');
    } catch (error) {
        console.error('Error registering instance:', error);
    }
};

const deregisterInstance = async () => {
    try {
        await axios.post(`${discoveryServiceUrl}/deregister`, { instanceUrl: `http://localhost:${port}` });
        console.log('Instance deregistered from discovery service');
    } catch (error) {
        console.error('Error deregistering instance:', error);
    }
};

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

app.listen(port, async () => {
    console.log(`Server running at http://localhost:${port}`);
    await registerInstance();
});

process.on('SIGINT', async () => {
    await deregisterInstance();
    process.exit();
});

// Balanceador de carga round-robin
const proxy = httpProxy.createProxyServer({});
let instances = [];

app.post('/update-instances', (req, res) => {
    instances = req.body.instances;
    console.log('Lista de instancias actualizada en el balanceador de carga:', instances);
    res.send('Instancias actualizadas');
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

const fetchInstances = async () => {
    try {
        const response = await axios.get(`${discoveryServiceUrl}/instances`);
        instances = response.data;
    } catch (error) {
        console.error('Error fetching instances:', error);
    }
};

setInterval(fetchInstances, 5000); // Fetch instances every 5 seconds

let currentIndex = 0;

const loadBalancerApp = express();

loadBalancerApp.use((req, res) => {
    if (instances.length === 0) {
        return res.status(503).send('No instances available');
    }
    proxy.web(req, res, { target: instances[currentIndex] });
    currentIndex = (currentIndex + 1) % instances.length; // Round Robin
});

loadBalancerApp.listen(loadBalancerPort, () => {
    console.log(`Load balancer running at http://localhost:${loadBalancerPort}`);
    fetchInstances();
});

app.listen(loadBalancerPort, () => {
    console.log(`Balanceador de carga corriendo en http://localhost:${loadBalancerPort}`);
    fetchInstances(); // Obtener las instancias al inicio
});