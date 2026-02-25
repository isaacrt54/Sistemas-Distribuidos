const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '../public')));

let players = {}; 
let readyCount = 0;
let turn = 1;

io.on('connection', (socket) => {
    // Maximo 2 jugadores
    if (Object.keys(players).length >= 2) {
        // Si ya hay 2, rechazamos al tercero
        socket.emit('server-full', 'La sala está llena. Intenta más tarde.');
        socket.disconnect();
        return;
    }

    // Asignamos Jugador 1 o Jugador 2
    const playerNumber = Object.keys(players).length === 0 ? 1 : 2;
    players[socket.id] = {
        number: playerNumber,
        ships: [],
        health: 0,
        ready: false
    };
    console.log(`\n[CONEXIÓN] Jugador ${playerNumber} conectado (ID: ${socket.id})`);
    socket.emit('player-number', playerNumber);

    // Si ya somos 2, avisamos a ambos que pueden empezar a colocar barcos
    if (Object.keys(players).length === 2) {
        console.log(`[SISTEMA] Sala completa. Iniciando fase de preparación...`);
        io.emit('start-setup', 'Ambos jugadores conectados. ¡Coloquen su flota!');
    } else {
        socket.emit('waiting-opponent', 'Esperando a que se conecte un rival...');
    }

    // Fase de preparacion
    socket.on('ships-ready', (ships) => {
        const player = players[socket.id];
        player.ships = ships;
        player.health = ships.length; // 10 vidas por defecto
        player.ready = true;
        readyCount++;

        console.log(`[SISTEMA] Jugador ${player.number} tiene su flota lista.`);

        // Si ambos estan listos, arranca la guerra
        if (readyCount === 2) {
            console.log(`[SISTEMA] Ambos jugadores listos. ¡Inicia el combate!`);
            // Elegimos al azar quien empieza (Jugador 1 o 2)
            turn = Math.random() < 0.5 ? 1 : 2;
            console.log(`[TURNO] El servidor dictamina que empieza el Jugador ${turn}`);
            
            io.emit('game-start', { startingPlayer: turn });
        }
    });

    // Logica de combate
    socket.on('shoot', (coords) => {
        const shooter = players[socket.id];
        
        // Validacion de seguridad
        if (shooter.number !== turn) {
            console.log(`[ALERTA] Jugador ${shooter.number} intentó disparar fuera de turno.`);
            return;
        }

        console.log(`\n--- TURNO DEL JUGADOR ${shooter.number} ---`);
        console.log(`[DISPARO] Coordenadas: (${coords.x}, ${coords.y})`);

        // Encontrar al oponente
        const opponentId = Object.keys(players).find(id => id !== socket.id);
        const opponent = players[opponentId];

        // Validar si el disparo dio en un barco del oponente
        const hitIndex = opponent.ships.findIndex(s => s.x === coords.x && s.y === coords.y);
        let result = 'MISS';

        if (hitIndex !== -1) {
            result = 'HIT';
            opponent.health--;
            console.log(`[IMPACTO] ¡El Jugador ${shooter.number} acertó!`);
        } else {
            console.log(`[FALLO] Tiro al agua.`);
        }

        // Avisamos al tirador del resultado de su disparo
        socket.emit('shot-result', { x: coords.x, y: coords.y, result: result });
        
        // Avisamos al oponente que recibio un disparo
        io.to(opponentId).emit('receive-shot', { x: coords.x, y: coords.y, result: result });

        // Verificamos si hay un ganador
        console.log(`[ESTADO] Vidas J1: ${players[Object.keys(players).find(id => players[id].number === 1)].health} | Vidas J2: ${players[Object.keys(players).find(id => players[id].number === 2)].health}`);

        if (opponent.health <= 0) {
            console.log(`\n!!! FIN DEL JUEGO: JUGADOR ${shooter.number} GANA !!!\n`);
            io.emit('game-over', { winner: shooter.number });
            return;
        }

        // Cambiamos el turno
        turn = turn === 1 ? 2 : 1;
        console.log(`[TURNO] Cambio de turno. Ahora le toca al Jugador ${turn}`);
        io.emit('turn-change', turn);
    });

    // Manejo de desconexiones
    socket.on('disconnect', () => {
        const player = players[socket.id];
        if (player) {
            console.log(`\n[DESCONEXIÓN] Jugador ${player.number} abandonó la partida.`);
            delete players[socket.id];
            readyCount = Object.values(players).filter(p => p.ready).length;
            
            // Si el otro jugador sigue ahi, le avisamos que gano por abandono
            if (Object.keys(players).length > 0) {
                io.emit('opponent-disconnected');
            }
        }
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(`Árbitro Central ejecutándose en el puerto ${PORT}`);
    console.log(`Accede desde otra PC usando tu IP Local`);
    console.log(`=========================================\n`);
});