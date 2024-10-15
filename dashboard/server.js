const express = require('express');
const { exec } = require('child_process');
const axios = require('axios');
const cors = require('cors');
const app = express();

const PORT = 7000;

let instances = []; // Array para guardar las instancias
let instancesCount = 0; // Contador de instancias
let healthHistory = {}; // Almacenar historial de salud

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Servir archivos estáticos

// Ruta para crear una nueva instancia
app.post('/create-instance', (req, res) => {
    
    const instanceName = `instance-${instancesCount}`;
    const port = 5000 + instancesCount;
    const instanceUrl = `http://localhost:${port}`;
    const command = `docker run -d -p ${port}:3000 --name ${instanceName} marcaagua`;

    exec(command, (error, stdout) => {
        if (error) {
            console.error(`Error al crear la instancia: ${error}`);
            return res.status(500).send('Error al crear la instancia');
        }
        console.log(`Nueva instancia creada: ${stdout}`);
        instances.push({ name: instanceName, port: port, status: 'Running' }); // Guardar la instancia

        axios.post(`${DISCOVERY_SERVICE_URL}/register`, { instanceUrl })
        .then(() => console.log(`Instancia registrada en el discovery: ${instanceUrl}`))
        .catch(err => console.error('Error registrando la instancia en el discovery', err));

        instancesCount++;
        res.status(201).send(`Instancia creada exitosamente: ${instanceName}`);
    });
});

// Ruta para hacer ingeniería de caos (destruir un contenedor aleatorio)
app.post('/chaos-engineering', (req, res) => {
    if (instances.length === 0) {
        return res.status(400).send('No hay instancias disponibles para eliminar');
    }

    const instanceUrl = `http://localhost:${instanceToRemove.port}`;

    // Seleccionar una instancia aleatoria
    const randomIndex = Math.floor(Math.random() * instances.length);
    const instanceToRemove = instances[randomIndex];

    // Comando para eliminar el contenedor Docker
    const command = `docker rm -f ${instanceToRemove.name}`;

    exec(command, (error, stdout) => {
        if (error) {
            console.error(`Error al eliminar la instancia: ${error}`);
            return res.status(500).send('Error al eliminar la instancia');
        }
        console.log(`Instancia eliminada: ${stdout}`);

        // Remover la instancia del arreglo de instancias
        instances.splice(randomIndex, 1);


        axios.post(`${DISCOVERY_SERVICE_URL}/deregister`, { instanceUrl })
            .then(() => console.log(`Instancia desregistrada del discovery: ${instanceUrl}`))
            .catch(err => console.error('Error desregistrando la instancia del discovery', err));

        res.status(200).send(`Instancia eliminada exitosamente: ${instanceToRemove.name}`);
    });
});


// Ruta para obtener todas las instancias
app.get('/instances', (req, res) => {
    res.status(200).json(instances);
});

// Endpoint para el health check de las instancias
app.get('/health-check', async (req, res) => {
    const statuses = [];
    for (const instance of instances) {
        try {
            const response = await axios.get(`http://${instance}:80`);
            const status = { instance, status: response.status };
            statuses.push(status);
            healthHistory[instance].push({ timestamp: new Date(), status: response.status });
        } catch (error) {
            const status = { instance, status: 'down' };
            statuses.push(status);
            healthHistory[instance].push({ timestamp: new Date(), status: 'down' });
        }
    }
    res.status(200).json(statuses);
});

// Endpoint para obtener el historial de salud
app.get('/health-history', (req, res) => {
    res.status(200).json(healthHistory);
});

// Monitoreo de instancias cada cierto tiempo
setInterval(async () => {
    for (const instance of instances) {
        try {
            const response = await axios.get(`http://localhost:${instance.port}/health-check`);
            instance.status = response.status === 200 ? 'Running' : 'Not Responding';
        } catch (error) {
            instance.status = 'Not Responding';
        }
    }
    console.log('Estado de instancias actualizado:', instances);
}, 5000); // Cada 5 segundos

app.listen(PORT, () => {
    console.log(`Servidor de monitoring escuchando en http://localhost:${PORT}`);
});
