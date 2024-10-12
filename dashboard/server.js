require('dotenv').config();
const express = require('express');
const { exec } = require('child_process');
const app = express();
const port = process.env.DASHBOARD_PORT || 3004;

app.use(express.static('public'));
app.use(express.json());

app.post('/create-instance', (req, res) => {
    exec('docker run -d -p 3000:3000 middleware', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error creating instance: ${error}`);
            return res.status(500).send('Error creating instance');
        }
        res.send(`Instance created: ${stdout.trim()}`);
    });
});

app.post('/destroy-instance', (req, res) => {
    const containerId = req.body.containerId;
    exec(`docker stop ${containerId} && docker rm ${containerId}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error destroying instance: ${error}`);
            return res.status(500).send('Error destroying instance');
        }
        res.send(`Instance destroyed: ${containerId}`);
    });
});

app.listen(port, () => {
    console.log(`Dashboard running at http://localhost:${port}`);
});