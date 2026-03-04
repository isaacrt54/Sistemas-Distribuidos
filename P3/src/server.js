const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '../public')));

// Cola de espera para matchmaking
let waitingQueue = []; 

// Objeto para gestionar las salas activas y sus estados
let activeRooms = {};
// Contador para asignar IDs únicos a las salas
let roomCounter = 0;

// Función de matchmaking simple
function tryMatchmaking() {
    // Si hay 2 o más jugadores en la cola, creamos una sala
    while (waitingQueue.length >= 2) {
        const player1Id = waitingQueue.shift();
        const player2Id = waitingQueue.shift();
        
        const roomId = `room_${++roomCounter}`;

        // Creamos la sala con su estado inicial
        activeRooms[roomId] = {
            id: roomId,
            players: {
                [player1Id]: { number: 1, ships: [], health: 0, ready: false },
                [player2Id]: { number: 2, ships: [], health: 0, ready: false }
            },
            turn: Math.random() < 0.5 ? 1 : 2,
            
            // Semáforo binario para evitar condiciones de carrera en la fase de combate
            isLocked: false 
        };

        const socket1 = io.sockets.sockets.get(player1Id);
        const socket2 = io.sockets.sockets.get(player2Id);
        socket1.roomId = roomId;
        socket2.roomId = roomId;

        if (socket1 && socket2) {
            // Metemos a los sockets en una "burbuja" de red (Room)
            socket1.join(roomId);
            socket2.join(roomId);

            console.log(`[MATCHMAKING] Sala creada: ${roomId}. Emparejando a ${player1Id} con ${player2Id}`);

            // Avisamos a cada jugador quién es
            socket1.emit('player-number', 1);
            socket2.emit('player-number', 2);

            // Emitimos SOLO A ESTA SALA que pueden empezar a colocar barcos
            io.to(roomId).emit('start-setup', '¡Oponente encontrado! Coloquen su flota.');
        }
    }
}

// Conexión de clientes
io.on('connection', (socket) => {
    console.log(`[CONEXIÓN] Nuevo cliente: ${socket.id}`);

    // Lo metemos a la cola de espera y avisamos
    waitingQueue.push(socket.id);
    socket.emit('waiting-opponent', 'Buscando partida en el servidor...');
    console.log(`[LOBBY] Clientes en cola de espera: ${waitingQueue.length}`);

    // Intentamos emparejar cada que alguien entra
    tryMatchmaking();

    // Fase de Setup: Recibimos la configuración de barcos de cada jugador
    socket.on('ships-ready', (ships) => {
        const roomId = socket.roomId;
        if (!roomId || !activeRooms[roomId]) return;

        const room = activeRooms[roomId];
        const player = room.players[socket.id];
        
        player.ships = ships;
        player.health = ships.length;
        player.ready = true;

        console.log(`[${roomId}] Jugador ${player.number} reporta flota lista.`);

        // Verificamos si ambos jugadores de la sala están listos
        if (Object.values(room.players).every(p => p.ready)) {
            console.log(`[${roomId}] ¡Partida iniciada! Empieza Jugador ${room.turn}`);
            io.to(roomId).emit('game-start', { startingPlayer: room.turn });
        }
    });

    // Fase de Combate: Recibimos disparos de los jugadores
    socket.on('shoot', (coords) => {
        const roomId = socket.roomId;
        if (!roomId || !activeRooms[roomId]) return;

        const room = activeRooms[roomId];
        const shooter = room.players[socket.id];

        // Validación de turno
        if (shooter.number !== room.turn) {
            console.log(`[${roomId}] RECHAZO: Jugador ${shooter.number} disparó fuera de turno.`);
            return;
        }

        // Validación de concurrencia
        if (room.isLocked) {
            console.log(`[${roomId}] COLISIÓN EVITADA: Paquete descartado, el servidor está calculando un impacto previo.`);
            return; // Bloqueamos la condición de carrera (Race Condition)
        }

        // Adquirimos el Lock (Semáforo en ROJO)
        room.isLocked = true; 

        // Encontramos al oponente de esta sala específica
        const opponentId = Object.keys(room.players).find(id => id !== socket.id);
        const opponent = room.players[opponentId];

        // Procesar impacto
        const hitIndex = opponent.ships.findIndex(s => s.x === coords.x && s.y === coords.y);
        let result = 'MISS';

        if (hitIndex !== -1) {
            result = 'HIT';
            opponent.health--;
        }

        // Enviamos resultados dirigidos
        socket.emit('shot-result', { x: coords.x, y: coords.y, result });
        io.to(opponentId).emit('receive-shot', { x: coords.x, y: coords.y, result });

        // Verificamos Fin de Juego
        if (opponent.health <= 0) {
            console.log(`[${roomId}] FIN DEL JUEGO. Ganador: Jugador ${shooter.number}`);
            io.to(roomId).emit('game-over', { winner: shooter.number });
            delete activeRooms[roomId]; // Destruimos la sala para liberar memoria
            return; 
        }

        // Cambiar turno y Liberar Semáforo
        room.turn = room.turn === 1 ? 2 : 1;
        io.to(roomId).emit('turn-change', room.turn);

        // Liberamos el Lock (Semáforo en VERDE) para el siguiente turno
        room.isLocked = false; 
    });

    // Manejo de desconexiones
    socket.on('disconnect', () => {
        console.log(`[DESCONEXIÓN] Cliente perdido: ${socket.id}`);

        // Caso A: Estaba en la cola de espera (Lo sacamos)
        waitingQueue = waitingQueue.filter(id => id !== socket.id);

        // Caso B: Estaba jugando en una sala
        const roomId = socket.roomId;
        if (roomId && activeRooms[roomId]) {
            console.log(`[${roomId}] Partida cancelada por desconexión.`);
            
            // Avisamos al que se quedó en la sala que ganó por abandono
            socket.to(roomId).emit('opponent-disconnected');
            
            // Destruimos la sala para liberar memoria
            delete activeRooms[roomId];
        }
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`=================================================`);
    console.log(`🚀 SERVIDOR MULTIPLAYER MASSIVO EJECUTÁNDOSE 🚀`);
    console.log(`Escuchando en el puerto ${PORT}`);
    console.log(`Mecanismo Anti-Colisión (Semáforo) ACTIVO`);
    console.log(`=================================================\n`);
});
