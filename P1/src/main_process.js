const express = require('express');
const { Worker } = require('worker_threads');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Instanciamos el worker (hilo secundario)
const cpuWorker = new Worker(path.join(__dirname, 'workers/cpu_worker.js'));

// Estado del Jugador (Vive en el proceso principal)
let playerShips = [];
let playerHealth = 0;

// Endpoint para iniciar partida
app.post('/api/start', (req, res) => {
    playerShips = req.body.ships;
    playerHealth = playerShips.length;
    
    // Mensaje al worker para que inicie su tablero
    cpuWorker.postMessage({ type: 'START_GAME' });
    
    res.json({ message: 'OK', health: playerHealth });
});

// Endpoint para realizar un turno
app.post('/api/shoot', (req, res) => {
    const { x, y } = req.body;

    // PROMESA: Esperamos a que el hilo secundario termine de trabajar
    const processTurn = new Promise((resolve, reject) => {
        
        // Listener de una sola vez para capturar la respuesta específica
        const handleWorkerResponse = (msg) => {
            if (msg.type === 'TURN_COMPLETED') {
                // Limpiamos listener por seguridad
                cpuWorker.off('message', handleWorkerResponse);
                resolve(msg);
            }
        };

        cpuWorker.on('message', handleWorkerResponse);
        
        // Enviamos la orden de procesamiento
        cpuWorker.postMessage({ type: 'PROCESS_TURN', x, y });
    });

    // Cuando el hilo responda, procesamos y respondemos al cliente HTTP
    processTurn.then((workerData) => {
        
        const responsePayload = {
            playerResult: workerData.playerResult,
            botShot: null,
            winner: workerData.gameOver === 'PLAYER_WINS' ? 'PLAYER' : null
        };

        // Si el juego no acabó, procesamos el disparo del BOT que calculó el worker
        if (!responsePayload.winner && workerData.botShot) {
            const bx = workerData.botShot.x;
            const by = workerData.botShot.y;
            
            // Verificamos si el bot nos dio (el worker no sabe dónde están nuestros barcos)
            const hitIndex = playerShips.findIndex(s => s.x === bx && s.y === by);
            let botHitResult = 'MISS';

            if (hitIndex !== -1) {
                botHitResult = 'HIT';
                playerHealth--;
            }

            // Agregamos el resultado del bot a la respuesta
            responsePayload.botShot = {
                x: bx,
                y: by,
                result: botHitResult
            };

            if (playerHealth <= 0) {
                responsePayload.winner = 'BOT';
            }
        }

        // Enviamos JSON al navegador
        res.json(responsePayload);
    });
});

app.listen(3000, () => {
    console.log('Proceso Principal ejecutándose en http://localhost:3000');
});