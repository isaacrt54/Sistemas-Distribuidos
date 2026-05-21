const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());

// 1. EL GATEWAY SIRVE LA PWA (FRONTEND)
// Como es el único punto de acceso público, él entrega los archivos HTML/CSS/JS
app.use(express.static(path.join(__dirname, '../public')));

// ==========================================
// 2. ENRUTAMIENTO DE MICROSERVICIOS (REVERSE PROXY)
// ==========================================

// Regla A: Si la petición empieza con /api/lobby, mándala al Matchmaker (Puerto 3001)
app.use('/api/lobby', createProxyMiddleware({ 
    target: 'http://localhost:3001', 
    changeOrigin: true 
}));

// Regla B: Si la petición empieza con /api/game, mándala al Gameplay (Puerto 3002)
app.use('/api/game', createProxyMiddleware({ 
    target: 'http://localhost:3002', 
    changeOrigin: true 
}));

// ==========================================
// INICIO DEL API GATEWAY
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`=================================================`);
    console.log(`🛡️  API GATEWAY (PUNTO DE ENTRADA ÚNICO) 🛡️`);
    console.log(`PWA disponible en:    http://localhost:${PORT}`);
    console.log(`Enrutando /api/lobby  -> Microservicio [3001]`);
    console.log(`Enrutando /api/game   -> Microservicio [3002]`);
    console.log(`=================================================\n`);
});