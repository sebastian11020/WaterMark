const express = require('express');
const { exec } = require('child_process');
const axios = require('axios');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 7000;

let instances = [];
let instancesCount = 0;
let healthHistory = {};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); 

app.post('/create-instance', async (req, res) => {
    const instanceName = `instance-${instancesCount}`;
    const port = 5000 + instancesCount;
    const command = `docker run -d -p ${port}:3000 --name ${instanceName} marcaagua`;

    exec(command, async (error, stdout) => {
        if (error) {
            console.error(`Error al crear la instancia: ${error}`);
            return res.status(500).send('Error al crear la instancia');
        }
        
        const instanceUrl = `http://localhost:${port}`;

        try {
            await axios.post(`http://localhost:6000/register`, { instanceUrl });
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

        const instanceUrl = `http://localhost:${instanceToRemove.port}`;

        // Llamada para desregistrar la instancia del servicio de discovery
        try {
            await axios.post(`http://localhost:6000/deregister`, { instanceUrl });
            console.log(`Instancia desregistrada del servicio de discovery: ${instanceUrl}`);
        } catch (err) {
            console.error(`Error al desregistrar la instancia en el servicio de discovery: ${err.message}`);
        }

        // Eliminar la instancia de la lista local y notificar la actualización
        instances.splice(randomIndex, 1);
        io.emit('update', { instances, healthHistory });

        // Crear una nueva instancia para reemplazar la eliminada
        const newInstanceName = `instance-${instancesCount}`;
        const newPort = 5000 + instancesCount;
        const newCommand = `docker run -d -p ${newPort}:3000 --name ${newInstanceName} marcaagua`;

        exec(newCommand, async (error, stdout) => {
            if (error) {
                console.error(`Error al reiniciar la instancia ${newInstanceName}: ${error}`);
                return res.status(500).send('Error al reiniciar la instancia');
            }
            instances.push({ name: newInstanceName, port: newPort, status: 'Running', failedChecks: 0 });
            instancesCount++;
            io.emit('update', { instances, healthHistory });
            console.log(`Instancia reiniciada exitosamente: ${newInstanceName}`);

            // Registrar la nueva instancia en el servicio de discovery
            const newInstanceUrl = `http://localhost:${newPort}`;
            try {
                await axios.post(`http://localhost:6000/register`, { instanceUrl: newInstanceUrl });
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
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 30000));

            await Promise.race([
                axios.get(`http://localhost:${instance.port}/health-check`),
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
        const newPort = 5000 + instancesCount;
        const newCommand = `docker run -d -p ${newPort}:3000 --name ${newInstanceName} marcaagua`;
        
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
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

setInterval(async () => {
    try {
        await axios.get(`http://localhost:${PORT}/health-check`);
    } catch (error) {
        console.error(`Error al verificar salud: ${error.message}`);
    }
}, 5000);
