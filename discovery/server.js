require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const PORT= process.env.SERVER_PORT;
const IP_ADDRESS = process.env.IP_ADDRESS;

let instances = [];

app.use(express.json());

app.post('/register', (req, res) => {
    const { instanceUrl } = req.body;
    console.log(`Solicitud de registro recibida: ${JSON.stringify(req.body)}`); 
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

    console.log('Instancias actuales:', instances); 
    res.status(200).send('Instancia registrada');
});


app.post('/deregister', (req, res) => {
    const { instanceUrl } = req.body;
    if (!instanceUrl) {
        return res.status(400).send('No instance URL provided');
    }

    instances = instances.filter(url => url !== instanceUrl);
    console.log(`Instancia desregistrada: ${instanceUrl}`);

    notifyServices();
    console.log('Instancias actuales:', instances); 
    res.status(200).send('Instancia desregistrada');
});


app.get('/instances', (req, res) => {
    console.log('Solicitando instancias registradas');
    res.status(200).json({ instances }); 
});

const notifyServices = async () => {
    const loadBalancerUrl = process.env.LOAD_BALANCER_URL;
    const monitoringServiceUrl = process.env.MONITORING_SERVICE_URL;

    try {
        await axios.post(`${loadBalancerUrl}/update-instances`, { instances });
        console.log('Lista de instancias enviada al balanceador de carga');

        await axios.post(`${monitoringServiceUrl}/update-instances`, { instances });
        console.log('Lista de instancias enviada al servicio de monitoreo');
    } catch (error) {
        console.error('Error notificando a los servicios:', error.message);
    }
};

setInterval(notifyServices, 10000); 

app.listen(PORT, () => {
    console.log(`Servicio de descubrimiento corriendo en http://${IP_ADDRESS}:${PORT}`);

    notifyServices();
});
