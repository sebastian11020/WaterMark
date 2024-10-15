const express = require('express');
const { exec } = require('child_process');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 7000;

let instances = [];
let instancesCount = 0;
let healthHistory = {};

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Servir archivos estáticos

// Ruta para crear una nueva instancia
app.post('/create-instance', (req, res) => {
    const instanceName = `instance-${instancesCount}`;
    const port = 5000 + instancesCount;
    const command = `docker run -d -p ${port}:3000 --name ${instanceName} marcaagua`;

    exec(command, (error, stdout) => {
        if (error) {
            console.error(`Error al crear la instancia: ${error}`);
            return res.status(500).send('Error al crear la instancia');
        }
        instances.push({ name: instanceName, port: port, status: 'Running' });
        instancesCount++;
        io.emit('update', { instances, healthHistory });
        res.status(201).send(`Instancia creada exitosamente: ${instanceName}`);
    });
});

// Ruta para hacer ingeniería de caos (eliminar una instancia aleatoria)
app.post('/chaos-engineering', (req, res) => {
    if (instances.length === 0) {
        return res.status(400).send('No hay instancias disponibles para eliminar');
    }

    const randomIndex = Math.floor(Math.random() * instances.length);
    const instanceToRemove = instances[randomIndex];
    const command = `docker rm -f ${instanceToRemove.name}`;

    exec(command, (error, stdout) => {
        if (error) {
            console.error(`Error al eliminar la instancia: ${error}`);
            return res.status(500).send('Error al eliminar la instancia');
        }
        instances.splice(randomIndex, 1);
        io.emit('update', { instances, healthHistory });
        res.status(200).send(`Instancia eliminada exitosamente: ${instanceToRemove.name}`);
    });
});

// Ruta para obtener todas las instancias
app.get('/instances', (req, res) => {
    res.status(200).json(instances);
});

// Ruta para hacer un health check de las instancias
app.get('/health-check', async (req, res) => {
    const statuses = [];
    for (const instance of instances) {
        try {
            const start = Date.now();
            await axios.get(`http://localhost:${instance.port}/health-check`);
            const latency = Date.now() - start;
            statuses.push({ instance: instance.name, status: 'Running', latency });
            
            // Inicializar el historial de salud si no existe para la instancia
            if (!healthHistory[instance.name]) {
                healthHistory[instance.name] = [];
            }
            
            healthHistory[instance.name].push({ timestamp: Date.now(), latency, status: 'Running' });
        } catch (error) {
            statuses.push({ instance: instance.name, status: 'Dead', latency: null });
            
            // Inicializar el historial de salud si no existe para la instancia
            if (!healthHistory[instance.name]) {
                healthHistory[instance.name] = [];
            }

            healthHistory[instance.name].push({ timestamp: Date.now(), latency: null, status: 'Dead' });
        }
    }
    io.emit('update', { instances, healthHistory });
    res.status(200).json(statuses);
});

app.get('/health-history', (req, res) => {
    res.status(200).json(healthHistory);
});

server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

setInterval(async () => {
    await axios.get(`http://localhost:${PORT}/health-check`);
}, 5000);
