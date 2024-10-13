// discovery/server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.DISCOVERY_SERVICE_PORT || 3007;

let instances = [];

// Middleware para parsear JSON
app.use(express.json());

app.post('/register', (req, res) => {
    const { instanceUrl } = req.body;
    if (!instances.includes(instanceUrl)) {
        instances.push(instanceUrl);
        console.log(`Instancia registrada: ${instanceUrl}`);
    }
    res.send('Instancia registrada');
});

app.post('/deregister', (req, res) => {
    const { instanceUrl } = req.body;
    instances = instances.filter(url => url !== instanceUrl);
    console.log(`Instancia desregistrada: ${instanceUrl}`);
    res.send('Instancia desregistrada');
});

app.get('/instances', (req, res) => {
    res.json(instances);
});

// Función para enviar la lista de instancias a los otros servicios
const notifyServices = async () => {
    const loadBalancerUrl = process.env.LOAD_BALANCER_URL || 'http://localhost:3001';
    const monitoringServiceUrl = process.env.MONITORING_SERVICE_URL || 'http://localhost:3003';

    try {
        // Notificar al balanceador de carga
        await axios.post(`${loadBalancerUrl}/update-instances`, { instances });
        console.log('Lista de instancias enviada al balanceador de carga');

        // Notificar al servicio de monitoreo
        await axios.post(`${monitoringServiceUrl}/update-instances`, { instances });
        console.log('Lista de instancias enviada al servicio de monitoreo');
    } catch (error) {
        console.error('Error notificando a los servicios:', error);
    }
};

// Revisión periódica de instancias
setInterval(notifyServices, 10000); // Revisa cada 10 segundos

app.listen(port, () => {
    console.log(`Servicio de descubrimiento corriendo en http://localhost:${port}`);
});
