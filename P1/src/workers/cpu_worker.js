const { parentPort } = require('worker_threads');

// Variables locales del hilo
const boardSize = 10;
let botShips = []; 
const shotsFiredByBot = new Set(); 
const fleetConfig = [3, 2, 2, 1, 1, 1]; 
let botHealth = 0;

function placeRandomShips() {
    botShips = []; 
    botHealth = fleetConfig.reduce((a, b) => a + b, 0); 
    const occupied = new Set();

    fleetConfig.forEach(size => {
        let placed = false;
        while (!placed) {
            const horizontal = Math.random() < 0.5;
            const x = Math.floor(Math.random() * boardSize);
            const y = Math.floor(Math.random() * boardSize);

            if (canPlaceShip(x, y, size, horizontal, occupied)) {
                for (let i = 0; i < size; i++) {
                    const px = horizontal ? x + i : x;
                    const py = horizontal ? y : y + i;
                    botShips.push({ x: px, y: py });
                    occupied.add(`${px},${py}`);
                }
                placed = true;
            }
        }
    });
}

function canPlaceShip(x, y, size, horizontal, occupied) {
    for (let i = 0; i < size; i++) {
        const px = horizontal ? x + i : x;
        const py = horizontal ? y : y + i;
        if (px >= boardSize || py >= boardSize) return false;
        if (occupied.has(`${px},${py}`)) return false;
    }
    return true;
}

function calculateBotShot() {
    let x, y, key;
    // IA simple: busca una casilla no disparada
    do {
        x = Math.floor(Math.random() * boardSize);
        y = Math.floor(Math.random() * boardSize);
        key = `${x},${y}`;
    } while (shotsFiredByBot.has(key));
    shotsFiredByBot.add(key);
    return { x, y };
}

// Inicializamos el tablero del bot al cargar el hilo
placeRandomShips();

parentPort.on('message', (msg) => {
    
    // CASO 1: REINICIAR JUEGO
    if (msg.type === 'START_GAME') {
        placeRandomShips();
        shotsFiredByBot.clear();
        parentPort.postMessage({ type: 'GAME_STARTED' });
    }

    // CASO 2: PROCESAR TURNO COMPLETO
    else if (msg.type === 'PROCESS_TURN') {
        const playerX = msg.x;
        const playerY = msg.y;

        // Verificar disparo del jugador
        const hitIndex = botShips.findIndex(s => s.x === playerX && s.y === playerY);
        let playerResult = 'MISS';
        
        if (hitIndex !== -1) {
            playerResult = 'HIT';
            botHealth--;
        }

        // Verificar si el jugador ganó
        if (botHealth === 0) {
            parentPort.postMessage({
                type: 'TURN_COMPLETED',
                playerResult: 'HIT',
                gameOver: 'PLAYER_WINS',
                botShot: null // El bot ya no dispara si murió
            });
            return;
        }

        // Calcular disparo del bot (Contraataque)
        // Simulamos un pequeño tiempo de cómputo
        setTimeout(() => {
            const botShot = calculateBotShot();
            
            // Devolvemos el paquete de datos
            parentPort.postMessage({
                type: 'TURN_COMPLETED',
                playerResult: playerResult,
                gameOver: null, // El juego sigue
                botShot: { x: botShot.x, y: botShot.y }
            });
        }, 100); // 100ms es suficiente para que no se sienta instantáneo
    }
});