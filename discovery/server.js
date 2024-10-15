require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
const port = process.env.DISCOVERY_SERVICE_PORT || 6000;

let instances = [];

// Middleware para parsear JSON
app.use(cors());
app.use(express.json());

// Registrar una nueva instancia
app.post('/register', (req, res) => {
    const { instanceUrl } = req.body;
    if (!instances.includes(instanceUrl)) {
        instances.push(instanceUrl);
        console.log(`Instancia registrada: ${instanceUrl}`);
    }
    res.send('Instancia registrada');
});

// Desregistrar una instancia
app.post('/deregister', (req, res) => {
    const { instanceUrl } = req.body;
    instances = instances.filter(url => url !== instanceUrl);
    console.log(`Instancia desregistrada: ${instanceUrl}`);
    res.send('Instancia desregistrada');
});

// Obtener todas las instancias registradas
app.get('/instances', (req, res) => {
    res.json(instances);
});

// Función para notificar a los servicios (balanceador de carga, monitoreo)
const notifyServices = async () => {
    const loadBalancerUrl = process.env.LOAD_BALANCER_URL || 'http://localhost:4000';
    const monitoringServiceUrl = process.env.MONITORING_SERVICE_URL || 'http://localhost:7000';

    try {
        // Notificar al balanceador de carga
        await axios.post(`${loadBalancerUrl}/update-instances`, { instances });
        console.log('Lista de instancias enviada al balanceador de carga');

        // Notificar al servicio de monitoreo
        await axios.post(`${monitoringServiceUrl}/update-instances`, { instances });
        console.log('Lista de instancias enviada al servicio de monitoreo');
    } catch (error) {
        console.error('Error notificando a los servicios', error);
    }
};

// Revisar y notificar servicios cada 10 segundos
setInterval(notifyServices, 10000); // Revisión periódica

app.listen(port, () => {
    console.log(`Servicio de descubrimiento corriendo en http://localhost:${port}`);
});
