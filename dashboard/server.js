const express = require('express');
const { exec } = require('child_process');
const axios = require('axios');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const winston = require('winston');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.SERVER_PORT;
const BASE_PORT = parseInt(process.env.BASE_PORT);
const DISCOVERY_SERVICE_URL = process.env.DISCOVERY_SERVICE_URL; 
const HEALTH_CHECK_TIMEOUT = parseInt(process.env.HEALTH_CHECK_TIMEOUT);
const HEALTH_CHECK_INTERVAL = parseInt(process.env.HEALTH_CHECK_INTERVAL);
const DOCKER_IMAGE_NAME = process.env.DOCKER_IMAGE_NAME;
const IP_ADDRESS = process.env.IP_ADDRESS; 

let instances = [];
let instancesCount = 0;
let healthHistory = {};

// Crear la carpeta de logs si no existe
if (!fs.existsSync('logs')) {
    fs.mkdirSync('logs');
}

// Configuración de winston para los logs
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console({
            format: winston.format.simple(),
        }),
        new winston.transports.File({ filename: 'logs/server.log' })
    ],
});

app.use(cors());
app.use(express.json());
app.use(express.static('public')); 

app.post('/create-instance', async (req, res) => {
    const logEntry = {
        date: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        status: null,
        payload: req.body || {},
        result: null,
    };

    const instanceName = `instance-${instancesCount}`;
    const port = BASE_PORT + instancesCount;
    const command = `docker run -d -p ${port}:3000 --name ${instanceName} ${DOCKER_IMAGE_NAME}`;

    exec(command, async (error, stdout) => {
        if (error) {
            logEntry.status = 500;
            logEntry.result = `Error al crear la instancia: ${error.message}`;
            logger.error(JSON.stringify(logEntry));
            return res.status(500).send(logEntry.result);
        }
        
        const instanceUrl = `http://${IP_ADDRESS}:${port}`; 

        try {
            await axios.post(`${DISCOVERY_SERVICE_URL}/register`, { instanceUrl });
            logEntry.status = 201;
            logEntry.result = `Instancia registrada en el servicio de discovery: ${instanceUrl}`;
            logger.info(JSON.stringify(logEntry));
        } catch (err) {
            logEntry.status = 500;
            logEntry.result = `Error al registrar la instancia en el servicio de discovery: ${err.message}`;
            logger.error(JSON.stringify(logEntry));
        }

        instances.push({ name: instanceName, port: port, status: 'Running', failedChecks: 0 });
        instancesCount++;
        io.emit('update', { instances, healthHistory });
        res.status(201).send(`Instancia creada exitosamente: ${instanceName}`);
    });
});

app.post('/chaos-engineering', (req, res) => {
    const logEntry = {
        date: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        status: null,
        payload: req.body || {},
        result: null,
    };

    if (instances.length === 0) {
        logEntry.status = 400;
        logEntry.result = 'No hay instancias disponibles para eliminar';
        logger.warn(JSON.stringify(logEntry));
        return res.status(400).send(logEntry.result);
    }
    
    const randomIndex = Math.floor(Math.random() * instances.length);
    const instanceToRemove = instances[randomIndex];

    const command = `docker rm -f ${instanceToRemove.name}`;

    exec(command, async (error, stdout) => {
        if (error) {
            logEntry.status = 500;
            logEntry.result = `Error al eliminar la instancia: ${error.message}`;
            logger.error(JSON.stringify(logEntry));
            return res.status(500).send(logEntry.result);
        }

        const instanceUrl = `http://${IP_ADDRESS}:${instanceToRemove.port}`;

        try {
            await axios.post(`${DISCOVERY_SERVICE_URL}/deregister`, { instanceUrl });
            logEntry.status = 200;
            logEntry.result = `Instancia desregistrada del servicio de discovery: ${instanceUrl}`;
            logger.info(JSON.stringify(logEntry));
        } catch (err) {
            logEntry.status = 500;
            logEntry.result = `Error al desregistrar la instancia en el servicio de discovery: ${err.message}`;
            logger.error(JSON.stringify(logEntry));
        }

        instances.splice(randomIndex, 1);
        io.emit('update', { instances, healthHistory });

        const newInstanceName = `instance-${instancesCount}`;
        const newPort = BASE_PORT + instancesCount;
        const newCommand = `docker run -d -p ${newPort}:3000 --name ${newInstanceName} ${DOCKER_IMAGE_NAME}`;

        exec(newCommand, async (error, stdout) => {
            if (error) {
                logEntry.status = 500;
                logEntry.result = `Error al reiniciar la instancia ${newInstanceName}: ${error.message}`;
                logger.error(JSON.stringify(logEntry));
                return res.status(500).send(logEntry.result);
            }
            instances.push({ name: newInstanceName, port: newPort, status: 'Running', failedChecks: 0 });
            instancesCount++;
            io.emit('update', { instances, healthHistory });
            logEntry.status = 200;
            logEntry.result = `Instancia reiniciada exitosamente: ${newInstanceName}`;
            logger.info(JSON.stringify(logEntry));

            const newInstanceUrl = `http://${IP_ADDRESS}:${newPort}`; 
            try {
                await axios.post(`${DISCOVERY_SERVICE_URL}/register`, { instanceUrl: newInstanceUrl });
                logEntry.status = 200;
                logEntry.result = `Instancia registrada en el servicio de discovery: ${newInstanceUrl}`;
                logger.info(JSON.stringify(logEntry));
            } catch (err) {
                logEntry.status = 500;
                logEntry.result = `Error al registrar la nueva instancia en el servicio de discovery: ${err.message}`;
                logger.error(JSON.stringify(logEntry));
            }
        });

        res.status(200).send(`Instancia eliminada y nueva instancia creada: ${instanceToRemove.name}`);
    });
});

app.get('/instances', (req, res) => {
    const logEntry = {
        date: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        status: 200,
        payload: {},
        result: 'Lista de instancias',
    };
    logger.info(JSON.stringify(logEntry));
    res.status(200).json(instances);
});

app.get('/health-check', async (req, res) => {
    const statuses = [];

    for (const instance of instances) {
        try {
            const start = Date.now();
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), HEALTH_CHECK_TIMEOUT));

            await Promise.race([
                axios.get(`http://${IP_ADDRESS}:${instance.port}/health-check`), 
                timeout
            ]);

            const latency = Date.now() - start;
            statuses.push({ instance: instance.name, status: 'Running', latency });
            if (!healthHistory[instance.name]) {
                healthHistory[instance.name] = [];
            }
            healthHistory[instance.name].push({ timestamp: Date.now(), latency, status: 'Running' });

            instance.failedChecks = 0; 
        } catch (error) {
            console.error(`Error en la instancia ${instance.name}: ${error.message}`);
            statuses.push({ instance: instance.name, status: 'Dead', latency: null });

            if (!healthHistory[instance.name]) {
                healthHistory[instance.name] = [];
            }
            healthHistory[instance.name].push({ timestamp: Date.now(), latency: null, status: 'Dead' });

            instance.failedChecks++;

            if (instance.failedChecks >= 3) {
                await removeAndRestartInstance(instance);
            }
        }
    }
    
    io.emit('update', { instances, healthHistory });
    const logEntry = {
        date: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        status: 200,
        payload: {},
        result: statuses,
    };
    logger.info(JSON.stringify(logEntry));
    res.status(200).json(statuses);
});

const removeAndRestartInstance = async (instance) => {
    const command = `docker rm -f ${instance.name}`;
    exec(command, (error, stdout) => {
        if (error) {
            console.error(`Error al eliminar la instancia ${instance.name}: ${error.message}`);
            return;
        }
        instances = instances.filter(inst => inst.name !== instance.name);
        io.emit('update', { instances, healthHistory });

        const newInstanceName = `instance-${instancesCount}`;
        const newPort = BASE_PORT + instancesCount;
        const newCommand = `docker run -d -p ${newPort}:3000 --name ${newInstanceName} ${DOCKER_IMAGE_NAME}`;
        
        exec(newCommand, (error, stdout) => {
            if (error) {
                console.error(`Error al reiniciar la instancia ${newInstanceName}: ${error.message}`);
                return;
            }
            instances.push({ name: newInstanceName, port: newPort, status: 'Running', failedChecks: 0 });
            instancesCount++;
            io.emit('update', { instances, healthHistory });
            console.log(`Instancia reiniciada exitosamente: ${newInstanceName}`);
        });
    });
};

app.get('/health-history', (req, res) => {
    const logEntry = {
        date: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl,
        status: 200,
        payload: {},
        result: healthHistory,
    };
    logger.info(JSON.stringify(logEntry));
    res.status(200).json(healthHistory);
});

server.listen(PORT, () => {
    logger.info(`Servidor corriendo en http://${IP_ADDRESS}:${PORT}`); 
});

setInterval(async () => {
    try {
        await axios.get(`http://${IP_ADDRESS}:${PORT}/health-check`); 
    } catch (error) {
        console.error(`Error al verificar salud: ${error.message}`);
    }
}, HEALTH_CHECK_INTERVAL);
