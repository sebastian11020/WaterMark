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
app.use(express.static('public')); // Servir archivos estáticos

// Ruta para crear una nueva instancia
app.post('/create-instance', async (req, res) => {
    const instanceName = `instance-${instancesCount}`;
    const port = 5000 + instancesCount;
    const command = `docker run -d -p ${port}:3000 --name ${instanceName} marcaagua`;

    exec(command, async (error, stdout) => {
        if (error) {
            console.error(`Error al crear la instancia: ${error}`);
            return res.status(500).send('Error al crear la instancia');
        }
        
        // Crear la URL de la nueva instancia
        const instanceUrl = `http://192.168.20.27:${port}`;
        
        // Registrar la nueva instancia en el servicio de discovery
        try {
            await axios.post(`http://192.168.20.27:6000/register`, { instanceUrl });
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
        
        // Remover la instancia de la lista
        instances.splice(randomIndex, 1);
        io.emit('update', { instances, healthHistory });

        // Crear nueva instancia para reemplazar la eliminada
        const newInstanceName = `instance-${instancesCount}`;
        const newPort = 5000 + instancesCount;
        const newCommand = `docker run -d -p ${newPort}:3000 --name ${newInstanceName} marcaagua`;
        
        exec(newCommand, (error, stdout) => {
            if (error) {
                console.error(`Error al reiniciar la instancia ${newInstanceName}: ${error}`);
                return res.status(500).send('Error al reiniciar la instancia');
            }
            instances.push({ name: newInstanceName, port: newPort, status: 'Running', failedChecks: 0 });
            instancesCount++;
            io.emit('update', { instances, healthHistory });
            console.log(`Instancia reiniciada exitosamente: ${newInstanceName}`);
        });

        res.status(200).send(`Instancia eliminada y nueva instancia creada: ${instanceToRemove.name}`);
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
            // Configuración de timeout de 30 segundos
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 30000));

            await Promise.race([
                axios.get(`http://192.168.20.27:${instance.port}/health-check`),
                timeout
            ]);

            const latency = Date.now() - start;
            statuses.push({ instance: instance.name, status: 'Running', latency });
            // Actualiza el historial de salud
            if (!healthHistory[instance.name]) {
                healthHistory[instance.name] = [];
            }
            healthHistory[instance.name].push({ timestamp: Date.now(), latency, status: 'Running' });
            
            // Reinicia el contador de fallos
            instance.failedChecks = 0; 
        } catch (error) {
            console.error(`Error en la instancia ${instance.name}: ${error.message}`);
            statuses.push({ instance: instance.name, status: 'Dead', latency: null });
            // Actualiza el historial de salud
            if (!healthHistory[instance.name]) {
                healthHistory[instance.name] = [];
            }
            healthHistory[instance.name].push({ timestamp: Date.now(), latency: null, status: 'Dead' });

            // Aumenta el contador de fallos
            instance.failedChecks++;

            // Eliminar y recrear la instancia si ha fallado 3 veces
            if (instance.failedChecks >= 3) {
                await removeAndRestartInstance(instance);
            }
        }
    }
    
    io.emit('update', { instances, healthHistory });
    res.status(200).json(statuses);
});

// Función para eliminar y reiniciar una instancia
const removeAndRestartInstance = async (instance) => {
    const command = `docker rm -f ${instance.name}`;
    exec(command, (error, stdout) => {
        if (error) {
            console.error(`Error al eliminar la instancia ${instance.name}: ${error}`);
            return;
        }
        instances = instances.filter(inst => inst.name !== instance.name);
        io.emit('update', { instances, healthHistory });
        
        // Reiniciar la instancia
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

// Endpoint para obtener el historial de salud
app.get('/health-history', (req, res) => {
    res.status(200).json(healthHistory);
});

// Iniciar el servidor
server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://192.168.20.27:${PORT}`);
});

// Intervalo para verificar la salud de las instancias
setInterval(async () => {
    try {
        await axios.get(`http://192.168.20.27:${PORT}/health-check`);
    } catch (error) {
        console.error(`Error al verificar salud: ${error.message}`);
    }
}, 5000);
