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
    
    console.log('\n=========================================');
    console.log(`[SERVER] NUEVA PARTIDA INICIADA`);
    console.log(`[SERVER] Flota del jugador registrada: ${playerHealth} celdas.`);
    console.log('=========================================\n');

    // Mensaje al worker para que inicie su tablero
    cpuWorker.postMessage({ type: 'START_GAME' });
    
    res.json({ message: 'OK', health: playerHealth });
});

// Endpoint para realizar un turno
app.post('/api/shoot', (req, res) => {
    const { x, y } = req.body;

    console.log(`\n--- INICIO DE TURNO ---`);
    console.log(`[JUGADOR] Dispara a coordenadas: (${x}, ${y})`);

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
        
        console.log(`[WORKER] Procesamiento finalizado.`);
        console.log(`[RESULTADO JUGADOR] ¿Acertó al bot?: ${workerData.playerResult}`);

        const responsePayload = {
            playerResult: workerData.playerResult,
            botShot: null,
            winner: workerData.gameOver === 'PLAYER_WINS' ? 'PLAYER' : null
        };

        // Si el juego no acabó, procesamos el disparo del BOT que calculó el worker
        if (!responsePayload.winner && workerData.botShot) {
            const bx = workerData.botShot.x;
            const by = workerData.botShot.y;
            
            console.log(`[BOT] Ejecuta contraataque en: (${bx}, ${by})`);

            // Verificamos si el bot nos dio (el worker no sabe dónde están nuestros barcos)
            const hitIndex = playerShips.findIndex(s => s.x === bx && s.y === by);
            let botHitResult = 'MISS';

            if (hitIndex !== -1) {
                botHitResult = 'HIT';
                playerHealth--;
                console.log(`[ALERTA] ¡El Bot impactó un barco del jugador!`);
            } else {
                console.log(`[INFO] El Bot falló su disparo.`);
            }
            
            console.log(`[ESTADO] Vidas restantes del Jugador: ${playerHealth}`);

            // Agregamos el resultado del bot a la respuesta
            responsePayload.botShot = {
                x: bx,
                y: by,
                result: botHitResult
            };

            if (playerHealth <= 0) {
                responsePayload.winner = 'BOT';
                console.log(`\n!!! FIN DEL JUEGO: EL BOT HA GANADO !!!\n`);
            }
        } else if (responsePayload.winner === 'PLAYER') {
            console.log(`\n!!! FIN DEL JUEGO: EL JUGADOR HA GANADO !!!\n`);
        }

        console.log(`--- FIN DE TURNO ---\n`);

        // Enviamos JSON al navegador
        res.json(responsePayload);
    });
});

app.listen(3000, () => {
    console.log('Proceso Principal ejecutándose en http://localhost:3000');
    console.log('Esperando conexiones...\n');
});