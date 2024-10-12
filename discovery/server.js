require('dotenv').config();
const express = require('express');
const app = express();
const port = process.env.DISCOVERY_SERVICE_PORT || 3007;

let instances = [];

app.use(express.json());

app.post('/register', (req, res) => {
    const { instanceUrl } = req.body;
    if (!instances.includes(instanceUrl)) {
        instances.push(instanceUrl);
        console.log(`Instance registered: ${instanceUrl}`);
    }
    res.send('Instance registered');
});

app.post('/deregister', (req, res) => {
    const { instanceUrl } = req.body;
    instances = instances.filter(url => url !== instanceUrl);
    console.log(`Instance deregistered: ${instanceUrl}`);
    res.send('Instance deregistered');
});

app.get('/instances', (req, res) => {
    res.json(instances);
});

app.listen(port, () => {
    console.log(`Discovery service running at http://localhost:${port}`);
});