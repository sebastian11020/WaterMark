const express = require('express');
const { exec } = require('child_process');
const axios = require('axios');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.SERVER_PORT;
const BASE_PORT = parseInt(process.env.BASE_PORT);
const DISCOVERY_SERVICE_URL = process.env.DISCOVERY_SERVICE_URL; 
const HEALTH_CHECK_TIMEOUT = parseInt(process.env.HEALTH_CHECK_TIMEOUT);
const HEALTH_CHECK_INTERVAL = parseInt(process.env.HEALTH_CHECK_INTERVAL);
const DOCKER_IMAGE_NAME = process.env.DOCKER_IMAGE_NAME;
const IP_ADDRESS = process.env.IP_ADDRESS ; 

let instances = [];
let instancesCount = 0;
let healthHistory = {};

app.use(cors());
app.use(express.json());
app.use(express.static('public')); 

app.post('/create-instance', async (req, res) => {
    const instanceName = `instance-${instancesCount}`;
    const port = BASE_PORT + instancesCount;
    const command = `docker run -d -p ${port}:3000 --name ${instanceName} ${DOCKER_IMAGE_NAME}`;

    exec(command, async (error, stdout) => {
        if (error) {
            console.error(`Error al crear la instancia: ${error}`);
            return res.status(500).send('Error al crear la instancia');
        }
        
        const instanceUrl = `http://${IP_ADDRESS}:${port}`; // Usando la IP

        try {
            await axios.post(`${DISCOVERY_SERVICE_URL}/register`, { instanceUrl });
            console.log(`Instancia registrada en el servicio de discovery: ${instanceUrl}`);
        } catch (err) {
            console.error(`Error al registrar la instancia en el servicio de discovery: ${err.message}`);
        }

        instances.push({ name: instanceName, port: port, status: 'Running', failedChecks: 0 });
        instancesCount++;
        io.emit('update', { instances, healthHistory });
        res.status(201).send(`Instancia creada exitosamente: ${instanceName}`);
    });
});

app.post('/chaos-engineering', (req, res) => {
    if (instances.length === 0) {
        return res.status(400).send('No hay instancias disponibles para eliminar');
    }
    const randomIndex = Math.floor(Math.random() * instances.length);
    const instanceToRemove = instances[randomIndex];

    const command = `docker rm -f ${instanceToRemove.name}`;

    exec(command, async (error, stdout) => {
        if (error) {
            console.error(`Error al eliminar la instancia: ${error}`);
            return res.status(500).send('Error al eliminar la instancia');
        }

        const instanceUrl = `http://${IP_ADDRESS}:${instanceToRemove.port}`; // Usando la IP

        try {
            await axios.post(`${DISCOVERY_SERVICE_URL}/deregister`, { instanceUrl });
            console.log(`Instancia desregistrada del servicio de discovery: ${instanceUrl}`);
        } catch (err) {
            console.error(`Error al desregistrar la instancia en el servicio de discovery: ${err.message}`);
        }

        instances.splice(randomIndex, 1);
        io.emit('update', { instances, healthHistory });

        const newInstanceName = `instance-${instancesCount}`;
        const newPort = BASE_PORT + instancesCount;
        const newCommand = `docker run -d -p ${newPort}:3000 --name ${newInstanceName} ${DOCKER_IMAGE_NAME}`;

        exec(newCommand, async (error, stdout) => {
            if (error) {
                console.error(`Error al reiniciar la instancia ${newInstanceName}: ${error}`);
                return res.status(500).send('Error al reiniciar la instancia');
            }
            instances.push({ name: newInstanceName, port: newPort, status: 'Running', failedChecks: 0 });
            instancesCount++;
            io.emit('update', { instances, healthHistory });
            console.log(`Instancia reiniciada exitosamente: ${newInstanceName}`);

            const newInstanceUrl = `http://${IP_ADDRESS}:${newPort}`; // Usando la IP
            try {
                await axios.post(`${DISCOVERY_SERVICE_URL}/register`, { instanceUrl: newInstanceUrl });
                console.log(`Instancia registrada en el servicio de discovery: ${newInstanceUrl}`);
            } catch (err) {
                console.error(`Error al registrar la nueva instancia en el servicio de discovery: ${err.message}`);
            }
        });

        res.status(200).send(`Instancia eliminada y nueva instancia creada: ${instanceToRemove.name}`);
    });
});

app.get('/instances', (req, res) => {
    res.status(200).json(instances);
});

app.get('/health-check', async (req, res) => {
    const statuses = [];

    for (const instance of instances) {
        try {
            const start = Date.now();
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), HEALTH_CHECK_TIMEOUT));

            await Promise.race([
                axios.get(`http://${IP_ADDRESS}:${instance.port}/health-check`), // Usando la IP
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
    res.status(200).json(statuses);
});

const removeAndRestartInstance = async (instance) => {
    const command = `docker rm -f ${instance.name}`;
    exec(command, (error, stdout) => {
        if (error) {
            console.error(`Error al eliminar la instancia ${instance.name}: ${error}`);
            return;
        }
        instances = instances.filter(inst => inst.name !== instance.name);
        io.emit('update', { instances, healthHistory });

        const newInstanceName = `instance-${instancesCount}`;
        const newPort = BASE_PORT + instancesCount;
        const newCommand = `docker run -d -p ${newPort}:3000 --name ${newInstanceName} ${DOCKER_IMAGE_NAME}`;
        
        exec(newCommand, (error, stdout) => {
            if (error) {
                console.error(`Error al reiniciar la instancia ${newInstanceName}: ${error}`);
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
    res.status(200).json(healthHistory);
});

server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://${IP_ADDRESS}:${PORT}`); // Usando la IP
});

setInterval(async () => {
    try {
        await axios.get(`http://${IP_ADDRESS}:${PORT}/health-check`); // Usando la IP
    } catch (error) {
        console.error(`Error al verificar salud: ${error.message}`);
    }
}, HEALTH_CHECK_INTERVAL);
