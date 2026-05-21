const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// --- BASE DE DATOS LOCAL DEL MICROSERVICIO ---
let waitingQueue = []; 
let playersStatus = {}; 

// Lógica pura de emparejamiento
function matchmake() {
    while (waitingQueue.length >= 2) {
        const player1Id = waitingQueue.shift();
        const player2Id = waitingQueue.shift();
        
        const newRoomId = `room_${uuidv4().substring(0,6)}`;

        console.log(`[MATCHMAKER] Emparejamiento exitoso -> Sala: ${newRoomId}`);

        // Ya no enviamos "puertos", solo el ID de la sala
        playersStatus[player1Id] = { status: 'matched', roomId: newRoomId, playerNumber: 1 };
        playersStatus[player2Id] = { status: 'matched', roomId: newRoomId, playerNumber: 2 };
    }
}

// ==========================================
// RUTAS DEL MICROSERVICIO
// Nota: El Gateway nos manda la ruta completa que inicia con /api/lobby
// ==========================================

app.post('/join', (req, res) => {
    const playerId = uuidv4();
    playersStatus[playerId] = { status: 'waiting' };
    waitingQueue.push(playerId);
    
    console.log(`[LOBBY] Nuevo jugador esperando. ID: ${playerId.substring(0,8)}...`);
    matchmake();

    res.status(200).json({ playerId, status: 'waiting' });
});

app.get('/status/:playerId', (req, res) => {
    const playerId = req.params.playerId;
    const statusInfo = playersStatus[playerId];

    if (!statusInfo) return res.status(404).json({ error: 'Jugador no encontrado' });
    res.json(statusInfo);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Microservicio] Matchmaker escuchando en puerto ${PORT}`);
});