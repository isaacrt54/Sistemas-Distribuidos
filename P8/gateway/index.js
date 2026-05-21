const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));

// Si la petición empieza con /api/lobby, mándarla al Lobby (Puerto 3001)
app.use('/api/lobby', createProxyMiddleware({ 
    target: 'http://localhost:3001', 
    changeOrigin: true 
}));

// Si la petición empieza con /api/game, mándarla al Gameplay (Puerto 3002)
app.use('/api/game', createProxyMiddleware({ 
    target: 'http://localhost:3002', 
    changeOrigin: true 
}));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`=================================================`);
    console.log(`API GATEWAY`);
    console.log(`PWA disponible en:    http://localhost:${PORT}`);
    console.log(`Enrutando /api/lobby  -> Microservicio [3001]`);
    console.log(`Enrutando /api/game   -> Microservicio [3002]`);
    console.log(`=================================================\n`);
});