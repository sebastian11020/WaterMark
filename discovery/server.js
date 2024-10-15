require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.DISCOVERY_SERVICE_PORT || 6000;

let instances = [];

// Middleware para manejar JSON
app.use(express.json());

// Ruta para registrar instancias
app.post('/register', (req, res) => {
    const { instanceUrl } = req.body;
    console.log(`Solicitud de registro recibida: ${JSON.stringify(req.body)}`); // Log del cuerpo de la solicitud
    if (!instanceUrl) {
        return res.status(400).send('No instance URL provided');
    }

    if (!instances.includes(instanceUrl)) {
        instances.push(instanceUrl);
        console.log(`Instancia registrada: ${instanceUrl}`);
        notifyServices();
    } else {
        console.log(`La instancia ya está registrada: ${instanceUrl}`);
    }

    console.log('Instancias actuales:', instances); // Log de las instancias registradas
    res.status(200).send('Instancia registrada');
});


// Ruta para desregistrar instancias
app.post('/deregister', (req, res) => {
    const { instanceUrl } = req.body;
    if (!instanceUrl) {
        return res.status(400).send('No instance URL provided');
    }

    instances = instances.filter(url => url !== instanceUrl);
    console.log(`Instancia desregistrada: ${instanceUrl}`);
    // Notificar a otros servicios después de un desregistro
    notifyServices();
    console.log('Instancias actuales:', instances); // Log de las instancias registradas
    res.status(200).send('Instancia desregistrada');
});

// Ruta para obtener la lista de instancias registradas
app.get('/instances', (req, res) => {
    console.log('Solicitando instancias registradas');
    res.status(200).json({ instances }); // Cambia esto
});


// Función para enviar la lista de instancias a otros servicios
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
        console.error('Error notificando a los servicios:', error.message);
    }
};

// Revisión periódica de instancias
setInterval(notifyServices, 10000); // Revisa cada 10 segundos

app.listen(port, () => {
    console.log(`Servicio de descubrimiento corriendo en http://localhost:${port}`);

    // Al iniciar, notificar a los servicios de las instancias registradas
    notifyServices();
});
