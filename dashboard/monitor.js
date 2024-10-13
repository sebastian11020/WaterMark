// monitor-service.js
const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = process.env.SERVER_PORT || 3003;
const discoveryServiceUrl = process.env.DISCOVERY_SERVICE_URL || 'http://localhost:3007';
const instanceManagerUrl = process.env.SERVER_DASHBOARD_URL || 'http://localhost:3002';

let instances = [];
let instanceStatusHistory = {}; // Almacena el historial de estados de cada instancia
const responseTimeThreshold = 2000; // Tiempo de respuesta máximo permitido en ms
const unhealthyLimit = 3; // Número de veces que un servidor puede fallar antes de ser reemplazado
let failureCount = {}; // Almacena el conteo de fallos por instancia

// Realizar health check a todas las instancias
const performHealthCheck = async () => {
    try {
        const response = await axios.get(`${discoveryServiceUrl}/instances`);
        const instances = response.data;

        for (const instanceUrl of instances) {
            try {
                const startTime = Date.now();
                const healthResponse = await axios.get(`${instanceUrl}/health`);
                const responseTime = Date.now() - startTime;

                const isHealthy = healthResponse.status === 200 && responseTime <= responseTimeThreshold;

                // Actualizar historial
                if (!instanceStatusHistory[instanceUrl]) {
                    instanceStatusHistory[instanceUrl] = [];
                }
                instanceStatusHistory[instanceUrl].push({ timestamp: new Date(), status: isHealthy ? 'healthy' : 'unhealthy' });

                // Resetear el conteo de fallos si es saludable
                if (isHealthy) {
                    failureCount[instanceUrl] = 0;
                } else {
                    // Incrementar el conteo de fallos si no es saludable
                    failureCount[instanceUrl] = (failureCount[instanceUrl] || 0) + 1;

                    // Verificar si ha alcanzado el límite de fallos
                    if (failureCount[instanceUrl] >= unhealthyLimit) {
                        console.log(`Instancia ${instanceUrl} alcanzó el límite de fallos. Lanzando una nueva instancia.`);
                        await launchNewInstance();
                    }
                }

                console.log(`Health check para ${instanceUrl}: ${isHealthy ? 'healthy' : 'unhealthy'}, Tiempo de respuesta: ${responseTime}ms`);
            } catch (error) {
                // Si falla el health check, registrar como 'unhealthy' y contar el fallo
                if (!instanceStatusHistory[instanceUrl]) {
                    instanceStatusHistory[instanceUrl] = [];
                }
                instanceStatusHistory[instanceUrl].push({ timestamp: new Date(), status: 'unhealthy' });

                failureCount[instanceUrl] = (failureCount[instanceUrl] || 0) + 1;

                // Verificar si ha alcanzado el límite de fallos
                if (failureCount[instanceUrl] >= unhealthyLimit) {
                    console.log(`Instancia ${instanceUrl} no responde. Lanzando una nueva instancia.`);
                    await launchNewInstance();
                }

                console.log(`Health check para ${instanceUrl}: unhealthy (error)`);
            }
        }
    } catch (error) {
        console.error('Error realizando health check:', error);
    }
};

// Función para lanzar una nueva instancia
const launchNewInstance = async () => {
    try {
        const response = await axios.post(`${instanceManagerUrl}/create-instance`);
        if (response.status === 200) {
            console.log('Nueva instancia lanzada exitosamente.');
        } else {
            console.log('Error al lanzar una nueva instancia.');
        }
    } catch (error) {
        console.error('Error lanzando nueva instancia:', error);
    }
};

// Ejecutar health check cada 30 segundos
setInterval(performHealthCheck, 30000);

app.use(express.json());

app.post('/update-instances', (req, res) => {
    instances = req.body.instances;
    console.log('Lista de instancias actualizada en el servicio de monitoreo:', instances);
    res.send('Instancias actualizadas');
});

// Endpoint para obtener el historial de estados
app.get('/status-history', (req, res) => {
    res.json(instanceStatusHistory);
});


app.listen(port, () => {
    console.log(`Servicio de monitoreo corriendo en http://localhost:${port}`);
});
