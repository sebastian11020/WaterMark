const express = require('express');
const axios = require('axios');
const httpProxy = require('http-proxy');
const fileUpload = require('express-fileupload');

const app = express();
const proxy = httpProxy.createProxyServer();
const discoveryServiceUrl = 'http://192.168.20.27:6000'; // Puerto del servicio discovery

let instances = [];
let currentIndex = 0;

app.use(fileUpload());

// Middleware para registrar la instancia en el discovery
app.use((req, res, next) => {
    const instanceUrl = `http://192.168.20.27:3000`; // Cambiar al puerto adecuado según sea necesario

    // Aquí se registran las instancias
    axios.post(`${discoveryServiceUrl}/register`, { url: instanceUrl })
        .then(response => {
            console.log('Instance registered with discovery service');
            next();
        })
        .catch(error => {
            console.error('Error registering instance:', error.message);
            res.status(500).send('Failed to register instance');
        });
});

// Función para obtener instancias del discovery
const fetchInstances = async () => {
    try {
        const response = await axios.get(`${discoveryServiceUrl}/instances`);
        console.log('Respuesta del discovery:', response.data);

        // Accede a instances desde la respuesta
        if (response.data && Array.isArray(response.data.instances)) {
            instances = response.data.instances;
            console.log('Instancias obtenidas:', instances);
        } else {
            console.error('La respuesta del discovery no tiene la propiedad "instances":', response.data);
        }
    } catch (error) {
        console.error('Error fetching instances:', error.message);
    }
};

// Endpoint para manejar las peticiones al load balancer
app.use((req, res) => {
    if (!Array.isArray(instances) || instances.length === 0) {
        return res.status(503).send('No instances available');
    }
    // Realiza el balanceo de carga
    proxy.web(req, res, { target: instances[currentIndex] });
    currentIndex = (currentIndex + 1) % instances.length; // Round Robin
});

// Ejecutar la función fetchInstances cada cierto tiempo
setInterval(fetchInstances, 5000); // Cada 5 segundos

// Iniciar el servidor
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://192.168.20.27:${PORT}`);
});
