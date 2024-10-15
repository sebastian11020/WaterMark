require('dotenv').config();
const express = require('express');
const axios = require('axios');
const winston = require('winston');
const fs = require('fs');

const app = express();
const PORT = process.env.SERVER_PORT;
const IP_ADDRESS = process.env.IP_ADDRESS;

let instances = [];

if (!fs.existsSync('logs')) {
    fs.mkdirSync('logs');
}

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console({
            format: winston.format.simple(),
        }),
        new winston.transports.File({ filename: 'logs/service.log' })
    ],
});

app.use(express.json());

app.post('/register', (req, res) => {
    const { instanceUrl } = req.body;
    let result;

    const logEntry = {
        date: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        status: null,
        payload: req.body || {},
        result: null,
    };

    if (!instanceUrl) {
        logEntry.status = 400;
        logEntry.result = 'No instance URL provided';
        logger.warn(JSON.stringify(logEntry));
        return res.status(400).send(logEntry.result);
    }

    if (!instances.includes(instanceUrl)) {
        instances.push(instanceUrl);
        logEntry.status = 200;
        logEntry.result = `Instancia registrada: ${instanceUrl}`;
        notifyServices();
    } else {
        logEntry.status = 200;
        logEntry.result = `La instancia ya está registrada: ${instanceUrl}`;
    }

    logger.info(JSON.stringify(logEntry));
    res.status(200).send(logEntry.result);
});

app.post('/deregister', (req, res) => {
    const { instanceUrl } = req.body;
    let result;

    const logEntry = {
        date: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        status: null,
        payload: req.body || {},
        result: null,
    };

    if (!instanceUrl) {
        logEntry.status = 400;
        logEntry.result = 'No instance URL provided';
        logger.warn(JSON.stringify(logEntry));
        return res.status(400).send(logEntry.result);
    }

    instances = instances.filter(url => url !== instanceUrl);
    logEntry.status = 200;
    logEntry.result = `Instancia desregistrada: ${instanceUrl}`;

    notifyServices();
    logger.info(JSON.stringify(logEntry));
    res.status(200).send(logEntry.result);
});

app.get('/instances', (req, res) => {
    const logEntry = {
        date: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        status: 200,
        payload: {},
        result: instances,
    };

    logger.info(JSON.stringify(logEntry));
    res.status(200).json({ instances });
});

const notifyServices = async () => {
    const loadBalancerUrl = process.env.LOAD_BALANCER_URL;
    const monitoringServiceUrl = process.env.MONITORING_SERVICE_URL;

    try {
        await axios.post(`${loadBalancerUrl}/update-instances`, { instances });
        logger.info('Lista de instancias enviada al balanceador de carga');

        await axios.post(`${monitoringServiceUrl}/update-instances`, { instances });
        logger.info('Lista de instancias enviada al servicio de monitoreo');
    } catch (error) {
        logger.error('Error notificando a los servicios: ' + error.message);
    }
};

setInterval(notifyServices, 10000);

app.listen(PORT, () => {
    logger.info(`Servicio de descubrimiento corriendo en http://${IP_ADDRESS}:${PORT}`);
    notifyServices();
});
