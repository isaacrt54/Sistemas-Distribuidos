const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const ioClient = require('socket.io-client'); // Para conectar con el Maestro
const cors = require('cors');
// Para ejecutar comandos del sistema (llamar al cliente RMI de Java)
const { exec } = require('child_process');
const path = require('path');

// Recibimos el puerto como argumento en la terminal (ej. node game_server.js 3001)
const PORT = process.argv[2] || 3001;
const MASTER_URL = 'http://localhost:3000';

const app = express();
app.use(cors());
const server = http.createServer(app);

// Habilitamos CORS para que los clientes que vienen del puerto 3000 puedan jugar aquí
const io = new Server(server, {
    cors: { origin: "*" }
});

// Estado local del servidor de juego
const MAX_ACTIVE_ROOMS = 2;
let waitingQueue = []; 
let activeRooms = {};
let roomCounter = 0;

function getActiveRoomCount() {
    return Object.keys(activeRooms).length;
}

// Sincronización con el Maestro
const masterSocket = ioClient(MASTER_URL);

masterSocket.on('connect', () => {
    console.log(`[SYNC] Conectado al Servidor Maestro.`);
    // Al encender, nos registramos diciendo cuántas salas soportamos
    masterSocket.emit('register-game-server', { 
        port: PORT, 
        maxRooms: MAX_ACTIVE_ROOMS 
    });
});

// Función para la concurrencia/sincronización: Reportamos al Maestro cada vez que cambiamos el número de salas activas
function reportLoadToMaster() {
    masterSocket.emit('update-load', { activeRooms: getActiveRoomCount() });
    console.log(`[ESTADO] Capacidad reportada al Maestro: ${getActiveRoomCount()}/${MAX_ACTIVE_ROOMS} salas ocupadas.`);
}

function disconnectRoomPlayers(roomId) {
    const room = activeRooms[roomId];
    if (!room) return;
    const playerIds = Object.keys(room.players);
    setTimeout(() => {
        playerIds.forEach((playerId) => {
            const playerSocket = io.sockets.sockets.get(playerId);
            if (playerSocket) playerSocket.disconnect(true);
        });
    }, 300);
}

// Logica de juego y matchmaking local en este servidor de juego
function tryMatchmaking() {
    while (waitingQueue.length >= 2 && getActiveRoomCount() < MAX_ACTIVE_ROOMS) {
        const player1Id = waitingQueue.shift();
        const player2Id = waitingQueue.shift();
        const roomId = `room_${PORT}_${++roomCounter}`;

        activeRooms[roomId] = {
            id: roomId,
            players: {
                [player1Id]: { number: 1, ships: [], health: 0, ready: false },
                [player2Id]: { number: 2, ships: [], health: 0, ready: false }
            },
            turn: Math.random() < 0.5 ? 1 : 2,
            isLocked: false // El Semáforo Mutex
        };

        const socket1 = io.sockets.sockets.get(player1Id);
        const socket2 = io.sockets.sockets.get(player2Id);
        
        if (socket1 && socket2) {
            socket1.roomId = roomId;
            socket2.roomId = roomId;
            socket1.join(roomId);
            socket2.join(roomId);

            console.log(`[SALA CREADA] ${roomId}. Jugadores en sala.`);
            
            socket1.emit('player-number', 1);
            socket2.emit('player-number', 2);
            io.to(roomId).emit('start-setup', '¡Oponente encontrado! Coloquen su flota.');
            
            // Le avisamos al Maestro que tenemos una sala menos disponible
            reportLoadToMaster();
        }
    }
}

io.on('connection', (socket) => {
    console.log(`[CONEXIÓN] Cliente conectado a este Servidor de Juego: ${socket.id}`);

    waitingQueue.push(socket.id);
    socket.emit('waiting-opponent', 'Asignando sala en este servidor...');
    tryMatchmaking();

    socket.on('ships-ready', (ships) => {
        const roomId = socket.roomId;
        if (!roomId || !activeRooms[roomId]) return;

        const room = activeRooms[roomId];
        const player = room.players[socket.id];
        
        player.ships = ships;
        player.health = ships.length;
        player.ready = true;

        if (Object.values(room.players).every(p => p.ready)) {
            io.to(roomId).emit('game-start', { startingPlayer: room.turn });
        }
    });

    socket.on('shoot', (coords) => {
        const roomId = socket.roomId;
        if (!roomId || !activeRooms[roomId]) return;

        const room = activeRooms[roomId];
        const shooter = room.players[socket.id];

        if (shooter.number !== room.turn) return;

        if (room.isLocked) {
            console.log(`[${roomId}] COLISIÓN EVITADA mediante Semáforo.`);
            return;
        }

        room.isLocked = true; 

        const opponentId = Object.keys(room.players).find(id => id !== socket.id);
        const opponent = room.players[opponentId];

        const hitIndex = opponent.ships.findIndex(s => s.x === coords.x && s.y === coords.y);
        let result = 'MISS';

        if (hitIndex !== -1) {
            result = 'HIT';
            opponent.health--;
        }

        socket.emit('shot-result', { x: coords.x, y: coords.y, result });
        io.to(opponentId).emit('receive-shot', { x: coords.x, y: coords.y, result });

        // Verificamos Fin de Juego
        if (opponent.health <= 0) {
            console.log(`[${roomId}] Generando Código de Victoria vía RMI (Java)...`);
            
            // Ruta a tu carpeta rmi_service
            const rmiPath = path.join(__dirname, '../rmi_service');
            
            // Ejecutamos el cliente RMI en una terminal hija
            exec(`java -cp "${rmiPath}" VictoryClient "Jugador_${shooter.number}"`, (error, stdout, stderr) => {
                
                // Si Java falla o el servidor RMI está apagado, damos un código por defecto
                let victoryCode = "ERROR-RMI-OFFLINE";
                if (!error && stdout) {
                    victoryCode = stdout.trim(); // Limpiamos saltos de línea
                }

                console.log(`[${roomId}] FIN DEL JUEGO. Ganador: Jugador ${shooter.number}. Código RMI: ${victoryCode}`);
                
                // Enviamos el evento de Game Over INCLUYENDO el código generado
                io.to(roomId).emit('game-over', { 
                    winner: shooter.number, 
                    code: victoryCode 
                });

                // Limpieza de la sala (Igual que antes)
                disconnectRoomPlayers(roomId);
                delete activeRooms[roomId]; 
                
                reportLoadToMaster();
                tryMatchmaking();
            });
            
            return; // Salimos de la función mientras exec hace su trabajo asíncrono
        }

        room.turn = room.turn === 1 ? 2 : 1;
        io.to(roomId).emit('turn-change', room.turn);
        room.isLocked = false; 
    });

    socket.on('disconnect', () => {
        waitingQueue = waitingQueue.filter(id => id !== socket.id);
        const roomId = socket.roomId;
        if (roomId && activeRooms[roomId]) {
            socket.to(roomId).emit('opponent-disconnected');
            delete activeRooms[roomId];
            
            // Le avisamos al Maestro que liberamos espacio
            reportLoadToMaster();
            tryMatchmaking();
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(`SERVIDOR DE JUEGO (WORKER)`);
    console.log(`Ejecutándose en puerto ${PORT}`);
    console.log(`=========================================\n`);
});