const { parentPort } = require('worker_threads');

const boardSize = 10;
let botShips = []; 
const shotsFired = new Set(); 
const fleetConfig = [3, 2, 2, 1, 1, 1]; 
let botHealth = fleetConfig.reduce((a, b) => a + b, 0); // Total de vidas (10)

function canPlaceShip(x, y, size, horizontal, occupied) {
    if (horizontal) {
        if (x + size > boardSize) return false;
    } else {
        if (y + size > boardSize) return false;
    }

    for (let i = 0; i < size; i++) {
        const px = horizontal ? x + i : x;
        const py = horizontal ? y : y + i;
        if (occupied.has(`${px},${py}`)) return false;
    }

    return true;
}

function placeRandomShips() {
    botShips = []; 
    botHealth = fleetConfig.reduce((a, b) => a + b, 0); // Reiniciar salud
    // ... (El resto de la lógica de colocar barcos sigue igual) ...
    // ... Copia tu lógica de placeRandomShips aquí ...
    // (Resumen para no repetir código largo: genera barcos y llena botShips)
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

// ... (Mantén calculateShot igual) ...
function calculateShot() {
    let x, y, key;
    do {
        x = Math.floor(Math.random() * boardSize);
        y = Math.floor(Math.random() * boardSize);
        key = `${x},${y}`;
    } while (shotsFired.has(key));
    shotsFired.add(key);
    return { x, y };
}

// NUEVA Lógica de impacto
function checkHit(x, y) {
    const hitIndex = botShips.findIndex(s => s.x === x && s.y === y);
    if (hitIndex !== -1) {
        botHealth--; // Restamos una vida
        return { result: 'HIT', gameOver: botHealth === 0 };
    }
    return { result: 'MISS', gameOver: false };
}

placeRandomShips(); // Iniciar

parentPort.on('message', (msg) => {
    if (msg.type === 'CHECK_HIT') {
        const { result, gameOver } = checkHit(msg.x, msg.y);
        
        parentPort.postMessage({ 
            type: 'HIT_RESULT', 
            x: msg.x, 
            y: msg.y, 
            result: result,
            gameOver: gameOver // Avisamos si el bot perdió
        });

    } else if (msg.type === 'YOUR_TURN') {
        setTimeout(() => {
            const shot = calculateShot();
            parentPort.postMessage({ type: 'BOT_SHOT', x: shot.x, y: shot.y });
        }, 800);
    }
});