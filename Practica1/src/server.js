const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Worker } = require('worker_threads');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir los archivos estáticos (HTML, CSS, JS del cliente)
app.use(express.static(path.join(__dirname, '../public')));

// --- INICIALIZACIÓN DEL WORKER (MULTIPROCESAMIENTO) ---
// Creamos el hilo secundario que contendrá la lógica del Bot
const botWorker = new Worker(path.join(__dirname, 'workers/botWorker.js'));

// --- ESTADO DEL JUEGO (EN MEMORIA DEL SERVIDOR) ---
let playerShips = []; // Aquí guardaremos las coordenadas de tus barcos
let playerHealth = 0; // Vidas restantes del jugador

// --- 1. ESCUCHAR MENSAJES DEL WORKER (BOT) ---
botWorker.on('message', (msg) => {
    
    // CASO A: El Worker responde al disparo del jugador
    if (msg.type === 'HIT_RESULT') {
        console.log(`Jugador disparó a (${msg.x}, ${msg.y}) -> ${msg.result}`);
        
        // Le avisamos al cliente para que pinte la casilla (Rojo o Gris)
        io.emit('shot-result', msg);

        // Verificamos si el Bot perdió
        if (msg.gameOver) {
            io.emit('game-over', { winner: 'PLAYER' });
            console.log('FIN DEL JUEGO: Ganó el Jugador');
        } 
        // Si el jugador falló, es turno del Bot
        else if (msg.result === 'MISS') {
            botWorker.postMessage({ type: 'YOUR_TURN' });
        }
        // (Opcional) Si el jugador acertó ('HIT'), podría volver a tirar.
        // Por simplicidad, cambiamos turno también o dejamos que tire de nuevo.
        // Aquí cambiamos turno para hacerlo más dinámico:
        else {
             botWorker.postMessage({ type: 'YOUR_TURN' });
        }
    } 
    
    // CASO B: El Bot decidió disparar (es su turno)
    else if (msg.type === 'BOT_SHOT') {
        
        // El servidor verifica si el disparo golpeó al jugador
        // (Porque el Worker no tiene acceso a la variable playerShips)
        const hitIndex = playerShips.findIndex(s => s.x === msg.x && s.y === msg.y);
        let result = 'MISS';

        if (hitIndex !== -1) {
            result = 'HIT';
            playerHealth--; // Restamos vida al jugador
        }

        console.log(`Bot dispara a (${msg.x}, ${msg.y}) -> ${result}. Vidas restantes: ${playerHealth}`);

        // Enviamos el resultado al cliente para que se pinte en su tablero
        io.emit('bot-shot', { 
            x: msg.x, 
            y: msg.y, 
            result: result 
        });

        // Verificamos si el Jugador perdió
        if (playerHealth <= 0) {
            io.emit('game-over', { winner: 'BOT' });
            console.log('FIN DEL JUEGO: Ganó el Bot');
        }
    }
});

// --- 2. ESCUCHAR AL CLIENTE (SOCKETS) ---
io.on('connection', (socket) => {
    console.log('Un usuario se ha conectado al juego.');

    // Evento: Iniciar juego (El cliente manda sus barcos)
    socket.on('start-game', (ships) => {
        playerShips = ships;
        playerHealth = ships.length; // Total de vidas = número de celdas de barco
        console.log(`Juego iniciado. Flota del jugador recibida (${playerHealth} celdas).`);
        
        // Opcional: Reiniciar el worker para una nueva partida limpia
        // botWorker.postMessage({ type: 'RESET' }); // (Si implementas reset en el worker)
    });

    // Evento: Jugador dispara
    socket.on('player-shot', (coords) => {
        // Le pasamos la coordenadas al Worker para que verifique si le dimos a sus barcos
        botWorker.postMessage({ 
            type: 'CHECK_HIT', 
            x: coords.x, 
            y: coords.y 
        });
    });

    socket.on('disconnect', () => {
        console.log('Usuario desconectado.');
    });
});

// --- ARRANCAR SERVIDOR ---
const PORT = 5000;
server.listen(PORT, () => {
    console.log(`Servidor de Batalla Naval corriendo en http://localhost:${PORT}`);
});