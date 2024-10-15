const express = require('express');
const axios = require('axios');
const httpProxy = require('http-proxy');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');
const cors = require('cors');

const app = express();
const discoveryServiceUrl = process.env.DISCOVERY_SERVICE_URL; 
const PORT = process.env.PORT;
const IP_ADDRESS = process.env.IP_ADDRESS;

let instances = [];
let currentIndex = 0;

app.use(cors()); 
app.use(fileUpload());

const fetchInstances = async () => {
    try {
        console.log("Obteniendo instancias del servicio de discovery...");
        const response = await axios.get(`${discoveryServiceUrl}/instances`);
        console.log('Respuesta del discovery:', response.data);

        if (response.data && Array.isArray(response.data.instances)) {
            instances = response.data.instances;
            console.log('Instancias obtenidas:', instances);
        } else {
            console.error('La respuesta del discovery no tiene la propiedad esperada:', response.data);
        }
    } catch (error) {
        console.error('Error al obtener las instancias:', error.message);
    }
};

app.post('/upload', (req, res) => {
    console.log("Petición de subida recibida en el middleware:", req.headers);

    if (!req.files || !req.files.image) {
        console.error("No se subió ninguna imagen.");
        return res.status(400).send('No image uploaded');
    }

    const imageFile = req.files.image;
    const tempImagePath = path.join(__dirname, 'uploads', imageFile.name);

    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir);
    }

    console.log("Archivo recibido:", imageFile.name);

    imageFile.mv(tempImagePath, (err) => {
        if (err) {
            console.error('Error al guardar la imagen:', err.message);
            return res.status(500).send('Error saving the image');
        }

        if (instances.length === 0) {
            console.error("No hay instancias disponibles para procesar la imagen.");
            return res.status(503).send('No instances available');
        }

        const targetInstance = instances[currentIndex];
        currentIndex = (currentIndex + 1) % instances.length;

        console.log(`Redirigiendo la imagen a la instancia: ${targetInstance}`);

        const formData = new FormData();
        formData.append('image', fs.createReadStream(tempImagePath));

        axios.post(`${targetInstance}/upload`, formData, {
            headers: formData.getHeaders(),
            responseType: 'arraybuffer',
        })
        .then(response => {
            console.log('Imagen procesada por la instancia:', targetInstance);
            res.set('Content-Type', 'image/png');
            res.send(response.data);
        })
        .catch(error => {
            console.error('Error al enviar la imagen a la instancia:', error.response ? error.response.data : error.message);
            res.status(500).send('Error processing the image');
        })
        .finally(() => {
            if (fs.existsSync(tempImagePath)) {
                fs.unlinkSync(tempImagePath);
                console.log('Archivo temporal eliminado:', tempImagePath);
            }
        });
    });
});

setInterval(fetchInstances, 5000);

app.listen(PORT, () => {
    console.log(`Middleware corriendo en http://${IP_ADDRESS}:${PORT}`);
});
