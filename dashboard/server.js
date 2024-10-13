const express = require('express');
const { exec } = require('child_process');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = process.env.SERVER_DASHBOARD_PORT || 3002;
const discoveryServiceUrl = process.env.DISCOVERY_SERVICE_URL || 'http://localhost:3007';
let instanceCount = 0;

// Crear una nueva instancia Docker
app.post('/create-instance', async (req, res) => {
    try {
        const instancePort = 4000 + instanceCount;
        const instanceName = `marca-agua-instance-${instanceCount}`;

        exec(`docker run -d -p ${instancePort}:3000 --name ${instanceName} marca-agua:latest`, async (error) => {
            if (error) {
                console.error(`Error creando la instancia: ${error.message}`);
                return res.status(500).send('Error creando la instancia');
            }

            const instanceUrl = `http://localhost:${instancePort}`;
            await axios.post(`${discoveryServiceUrl}/register`, { instanceUrl });
            console.log(`Nueva instancia creada: ${instanceUrl}`);

            instanceCount++;
            res.send(`Instancia creada en ${instanceUrl}`);
        });
    } catch (error) {
        console.error("Error creando la instancia:", error);
        res.status(500).send('Error creando la instancia');
    }
});

// Destruir un contenedor aleatorio (ingeniería de caos)
app.post('/chaos-monkey', async (req, res) => {
    try {
        // Obtener lista de contenedores en ejecución que coincidan con el prefijo "marca-agua-instance"
        exec(`docker ps --filter "name=marca-agua-instance" --format "{{.Names}}"`, async (error, stdout) => {
            if (error) {
                console.error(`Error obteniendo las instancias: ${error.message}`);
                return res.status(500).send('Error obteniendo las instancias');
            }

            const instanceNames = stdout.trim().split('\n').filter(name => name);
            if (instanceNames.length === 0) {
                return res.status(404).send('No hay instancias disponibles para destruir');
            }

            // Seleccionar una instancia al azar
            const randomIndex = Math.floor(Math.random() * instanceNames.length);
            const instanceName = instanceNames[randomIndex];

            // Eliminar el contenedor seleccionado
            exec(`docker rm -f ${instanceName}`, async (removeError) => {
                if (removeError) {
                    console.error(`Error destruyendo la instancia: ${removeError.message}`);
                    return res.status(500).send('Error destruyendo la instancia');
                }

                const instanceUrl = `http://localhost:${4000 + parseInt(instanceName.split('-').pop())}`;
                await axios.post(`${discoveryServiceUrl}/deregister`, { instanceUrl });
                console.log(`Instancia destruida: ${instanceUrl}`);

                res.send(`Instancia ${instanceName} destruida`);
            });
        });
    } catch (error) {
        console.error("Error ejecutando el caos:", error);
        res.status(500).send('Error ejecutando el caos');
    }
});

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});


app.listen(port, () => {
    console.log(`Server corriendo en http://localhost:${port}`);
});
