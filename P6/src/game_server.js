const express = require('express');
const cors = require('cors');

// Recibimos el puerto de la consola
const PORT = process.argv[2] || 3001;
const MASTER_URL = 'http://localhost:3000';
const MAX_ROOMS = 2; // Límite de carga

const app = express();
app.use(cors());
app.use(express.json());

let serverId = null;
let activeRooms = {}; 

function getActiveRoomCount() {
    return Object.keys(activeRooms).length;
}

// Función para reportarle al Maestro nuestra carga vía HTTP PUT
async function updateMasterLoad() {
    if (!serverId) return;
    try {
        await fetch(`${MASTER_URL}/api/servers/${serverId}/load`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activeRooms: getActiveRoomCount() })
        });
        console.log(`[SYNC] Carga reportada al Maestro: ${getActiveRoomCount()}/${MAX_ROOMS}`);
    } catch (e) {
        console.error("[ERROR] Fallo al sincronizar con el Maestro.");
    }
}

// Rutas para el juego de Batalla Naval
// Fase de Preparación
app.post('/api/game/:roomId/setup', (req, res) => {
    const { roomId } = req.params;
    const { playerNumber, ships } = req.body;

    // Patrón de Instanciación Perezosa: Si la sala no existe, la creamos
    if (!activeRooms[roomId]) {
        activeRooms[roomId] = {
            players: { 1: { ready: false }, 2: { ready: false } },
            turn: Math.random() < 0.5 ? 1 : 2,
            winner: null,
            lastShot: null // Guardaremos el último disparo para que el rival lo vea
        };
        console.log(`[SALA CREADA] ${roomId}`);
        updateMasterLoad(); // Hay una sala nueva, avisamos al Maestro
    }

    const room = activeRooms[roomId];
    room.players[playerNumber] = {
        ready: true,
        ships: ships,
        health: ships.length
    };

    console.log(`[${roomId}] Jugador ${playerNumber} reportó su flota.`);
    res.json({ message: "Flota registrada correctamente" });
});

// Consulta de Estado
app.get('/api/game/:roomId/state/:playerNumber', (req, res) => {
    const { roomId, playerNumber } = req.params;
    const room = activeRooms[roomId];

    if (!room) {
        return res.status(404).json({ error: "La sala aún no existe o ya fue destruida" });
    }

    const bothReady = room.players[1].ready && room.players[2].ready;
    
    // Devolvemos la radiografía exacta del juego en este milisegundo
    res.json({
        phase: bothReady ? (room.winner ? 'ENDED' : 'PLAYING') : 'SETUP',
        turn: room.turn,
        winner: room.winner,
        lastShot: room.lastShot 
    });
});

// Disparar
app.post('/api/game/:roomId/shoot', (req, res) => {
    const { roomId } = req.params;
    const { playerNumber, x, y } = req.body;
    const room = activeRooms[roomId];

    if (!room) return res.status(404).json({ error: "Sala inexistente" });
    if (room.winner) return res.status(400).json({ error: "El juego ya terminó" });
    if (room.turn !== playerNumber) return res.status(403).json({ error: "Tranquilo, no es tu turno" });

    const opponentNum = playerNumber === 1 ? 2 : 1;
    const opponent = room.players[opponentNum];
    
    const hitIndex = opponent.ships.findIndex(s => s.x === x && s.y === y);
    let result = 'MISS';

    if (hitIndex !== -1) {
        result = 'HIT';
        opponent.health--;
    }

    room.lastShot = { x, y, result, shooter: playerNumber };
    console.log(`[${roomId}] J${playerNumber} disparó a (${x},${y}) -> ${result}`);

    if (opponent.health <= 0) {
        room.winner = playerNumber;
        console.log(`[${roomId}] FIN DEL JUEGO. Ganador: Jugador ${playerNumber}`);
        
        // Destruimos la sala de la RAM después de 15 segundos para que los clientes alcancen a leer el 'ENDED'
        setTimeout(() => {
            delete activeRooms[roomId];
            updateMasterLoad();
        }, 15000);
    } else {
        // Cambiamos el turno
        room.turn = opponentNum;
    }

    // Le respondemos inmediatamente al que disparó
    res.json({ result, x, y, isWinner: room.winner === playerNumber });
});


app.listen(PORT, '0.0.0.0', async () => {
    console.log(`=========================================`);
    console.log(`WORKER API REST (Puerto ${PORT})`);
    
    // Al encender, nos registramos como esclavos del Maestro mediante HTTP
    try {
        const resp = await fetch(`${MASTER_URL}/api/servers/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ port: PORT, maxRooms: MAX_ROOMS })
        });
        
        if (resp.ok) {
            const data = await resp.json();
            serverId = data.serverId;
            console.log(`[SYNC] Registrado con éxito en el Maestro. ID: ${serverId}`);
        }
    } catch (e) {
        console.error("[ALERTA] No se pudo conectar al Maestro. ¿Está encendido?");
    }
    console.log(`=========================================\n`);
});