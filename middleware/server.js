const express = require('express');
const axios = require('axios');
const httpProxy = require('http-proxy');
const fileUpload = require('express-fileupload');

const app = express();
const proxy = httpProxy.createProxyServer();
const discoveryServiceUrl = 'http://192.168.20.27:6000'; 

let instances = [];
let currentIndex = 0;

app.use(fileUpload());

app.use((req, res, next) => {
    const instanceUrl = `http://192.168.20.27:3000`; 

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

const fetchInstances = async () => {
    try {
        const response = await axios.get(`${discoveryServiceUrl}/instances`);
        console.log('Respuesta del discovery:', response.data);

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

app.use((req, res) => {
    if (!Array.isArray(instances) || instances.length === 0) {
        return res.status(503).send('No instances available');
    }
    proxy.web(req, res, { target: instances[currentIndex] });
    currentIndex = (currentIndex + 1) % instances.length; 
});

setInterval(fetchInstances, 5000);

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://192.168.20.27:${PORT}`);
});
