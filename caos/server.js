require('dotenv').config();
const express = require('express');
const { exec } = require('child_process');
const app = express();
const port = process.env.CHAOS_SERVICE_PORT || 3008;

app.use(express.json());

app.post('/chaos', (req, res) => {
    exec('docker ps -q', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error listing containers: ${error}`);
            return res.status(500).send('Error listing containers');
        }
        const containers = stdout.split('\n').filter(id => id);
        if (containers.length === 0) {
            return res.status(400).send('No containers to destroy');
        }
        const randomContainer = containers[Math.floor(Math.random() * containers.length)];
        exec(`docker stop ${randomContainer} && docker rm ${randomContainer}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error destroying container: ${error}`);
                return res.status(500).send('Error destroying container');
            }
            console.log(`Container destroyed: ${randomContainer}`);
            res.send(`Container destroyed: ${randomContainer}`);
        });
    });
});

app.listen(port, () => {
    console.log(`Chaos engineering service running at http://localhost:${port}`);
});