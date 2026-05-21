const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3002;

app.use(cors());
app.use(express.json());

let activeRooms = {}; 

// Fase de Preparación
app.post('/:roomId/setup', (req, res) => {
    const { roomId } = req.params;
    const { playerNumber, ships } = req.body;

    if (!activeRooms[roomId]) {
        activeRooms[roomId] = {
            players: { 1: { ready: false }, 2: { ready: false } },
            turn: Math.random() < 0.5 ? 1 : 2,
            winner: null,
            lastShot: null
        };
        console.log(`[GAMEPLAY] Sala creada: ${roomId}`);
    }

    activeRooms[roomId].players[playerNumber] = {
        ready: true,
        ships: ships,
        health: ships.length,
        lastSeen: Date.now()
    };

    console.log(`[${roomId}] J${playerNumber} listo con su flota.`);
    res.json({ message: "Flota registrada" });
});

// Consulta de Estado
app.get('/:roomId/state/:playerNumber', (req, res) => {
    const { roomId, playerNumber } = req.params;
    const room = activeRooms[roomId];

    if (!room) return res.status(404).json({ error: "Sala inexistente" });

    if (room.players[playerNumber]) {
        room.players[playerNumber].lastSeen = Date.now();
    }

    const bothReady = room.players[1].ready && room.players[2].ready;
    
    res.json({
        phase: bothReady ? (room.winner ? 'ENDED' : 'PLAYING') : 'SETUP',
        turn: room.turn,
        winner: room.winner,
        lastShot: room.lastShot,
        disconnectReason: room.disconnectReason
    });
});

// Disparar
app.post('/:roomId/shoot', (req, res) => {
    const { roomId } = req.params;
    const { playerNumber, x, y } = req.body;
    const room = activeRooms[roomId];

    if (!room) return res.status(404).json({ error: "Sala inexistente" });
    if (room.winner) return res.status(400).json({ error: "Juego terminado" });
    if (room.turn !== playerNumber) return res.status(403).json({ error: "No es tu turno" });

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
        console.log(`[${roomId}] VICTORIA J${playerNumber}`);
        setTimeout(() => { delete activeRooms[roomId]; }, 15000);
    } else {
        room.turn = opponentNum;
    }

    res.json({ result, x, y, isWinner: room.winner === playerNumber });
});

// Timeout de Inactividad
setInterval(() => {
    const now = Date.now();
    for (const roomId in activeRooms) {
        const room = activeRooms[roomId];
        if (room.winner) continue; 

        for (let p of [1, 2]) {
            const player = room.players[p];
            if (player && player.lastSeen && (now - player.lastSeen > 60000)) {
                const opponentNum = p === 1 ? 2 : 1;
                room.winner = opponentNum;
                room.disconnectReason = "abandono";
                console.log(`[${roomId}] Timeout (60s). J${p} abandonó.`);
                setTimeout(() => { delete activeRooms[roomId]; }, 10000);
                break; 
            }
        }
    }
}, 3000);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Microservicio] Gameplay escuchando en puerto ${PORT}`);
});