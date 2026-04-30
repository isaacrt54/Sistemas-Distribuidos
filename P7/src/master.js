const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

// Servimos el frontend estático
app.use(express.static(path.join(__dirname, '../public')));

let gameServers = {}; 
let waitingQueue = []; // Lista de IDs de jugadores esperando
let playersStatus = {}; // Diccionario para que los jugadores consulten su estado

// Matchmaking: Intentamos emparejar a los jugadores en espera con servidores de juego disponibles
function matchmake() {
    while (waitingQueue.length >= 2) {
        const availableServerId = Object.keys(gameServers).find(id => {
            const gs = gameServers[id];
            return gs.activeRooms < gs.maxRooms;
        });

        if (!availableServerId) {
            console.log(`[MAESTRO] Servidores llenos. Jugadores en cola: ${waitingQueue.length}`);
            break;
        }

        const player1Id = waitingQueue.shift();
        const player2Id = waitingQueue.shift();
        const serverToUse = gameServers[availableServerId];

        const newRoomId = `room_${uuidv4().substring(0,6)}`;

        console.log(`[MAESTRO] Match exitoso! Sala: ${newRoomId} en Puerto: ${serverToUse.port}`);

        playersStatus[player1Id] = {
            status: 'matched',
            port: serverToUse.port,
            roomId: newRoomId,
            playerNumber: 1
        };

        playersStatus[player2Id] = {
            status: 'matched',
            port: serverToUse.port,
            roomId: newRoomId,
            playerNumber: 2
        };

        serverToUse.activeRooms++;
    }
}

// Rutas para servidores de juego
// Registrar un nuevo Servidor de Juego
app.post('/api/servers/register', (req, res) => {
    const { port, maxRooms } = req.body;
    const serverId = uuidv4(); // Le damos un ID al servidor

    gameServers[serverId] = { port, activeRooms: 0, maxRooms };
    console.log(`[NODO ACTIVO] Servidor registrado en puerto ${port}. ID: ${serverId}`);
    
    matchmake();
    
    // Le devolvemos su ID para que lo use al actualizar su carga
    res.status(201).json({ message: 'Registrado', serverId });
});

// Actualizar la carga de un Servidor de Juego
app.put('/api/servers/:serverId/load', (req, res) => {
    const serverId = req.params.serverId;
    const { activeRooms } = req.body;

    if (gameServers[serverId]) {
        gameServers[serverId].activeRooms = activeRooms;
        matchmake();
        res.json({ message: 'Carga actualizada' });
    } else {
        res.status(404).json({ error: 'Servidor no encontrado' });
    }
});

// Rutas para jugadores
// El cliente entra a la página y pide unirse a la cola
app.post('/api/lobby/join', (req, res) => {
    const playerId = uuidv4();
    
    playersStatus[playerId] = { status: 'waiting' };
    waitingQueue.push(playerId);
    
    console.log(`[LOBBY] Nuevo jugador en cola: ${playerId}`);
    matchmake();

    // Le devolvemos su ID para que pueda consultar su estado después
    res.status(200).json({ playerId, status: 'waiting' });
});

app.get('/api/lobby/status/:playerId', (req, res) => {
    const playerId = req.params.playerId;
    const statusInfo = playersStatus[playerId];

    if (!statusInfo) {
        return res.status(404).json({ error: 'Jugador no encontrado en el sistema' });
    }

    res.json(statusInfo);
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`=================================================`);
    console.log(`SERVIDOR MAESTRO REST API`);
    console.log(`Escuchando en el puerto ${PORT}`);
    console.log(`=================================================\n`);
});