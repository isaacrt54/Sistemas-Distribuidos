// Referencias DOM
const playerBoard = document.getElementById('player-board');
const enemyBoard = document.getElementById('enemy-board');
const rotateBtn = document.getElementById('rotate-btn');
const startBtn = document.getElementById('start-game-btn');
const setupPanel = document.getElementById('setup-panel');
const logContainer = document.querySelector('.log-console');
const logList = document.getElementById('game-logs');

// Configuración
const fleetToPlace = [3, 2, 2, 1, 1, 1];
let currentShipIndex = 0;
let isHorizontal = true;
let gamePhase = 'SETUP'; // SETUP, PLAYING, ENDED
let myShips = [];

function createBoard(boardElement, isEnemy = false) {
    boardElement.innerHTML = '';
    for (let i = 0; i < 100; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        const x = i % 10;
        const y = Math.floor(i / 10);
        
        cell.id = `${isEnemy ? 'enemy' : 'player'}-cell-${x}-${y}`;
        
        if (isEnemy) {
            cell.addEventListener('click', () => handleAttack(x, y));
        } else {
            cell.addEventListener('click', () => handlePlacement(x, y));
            cell.addEventListener('mouseover', () => previewShip(x, y));
            cell.addEventListener('mouseout', () => clearPreview());
        }
        boardElement.appendChild(cell);
    }
}

function previewShip(x, y) {
    if (gamePhase !== 'SETUP' || currentShipIndex >= fleetToPlace.length) return;
    const size = fleetToPlace[currentShipIndex];
    for (let i = 0; i < size; i++) {
        const px = isHorizontal ? x + i : x;
        const py = isHorizontal ? y : y + i;
        const cell = document.getElementById(`player-cell-${px}-${py}`);
        if (cell && !cell.classList.contains('my-ship')) {
            cell.style.backgroundColor = '#5dade2';
        }
    }
}

function clearPreview() {
    const cells = document.querySelectorAll('#player-board .cell');
    cells.forEach(cell => {
        if (!cell.classList.contains('my-ship')) {
            cell.style.backgroundColor = '';
        }
    });
}

function logMessage(msg) {
    const item = document.createElement('li');
    item.textContent = `> ${msg}`;
    logList.appendChild(item);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// Colocación de barcos
rotateBtn.addEventListener('click', () => {
    isHorizontal = !isHorizontal;
    rotateBtn.innerText = isHorizontal ? "Rotar (Horizontal)" : "Rotar (Vertical)";
});

function handlePlacement(x, y) {
    if (gamePhase !== 'SETUP') return;
    
    const size = fleetToPlace[currentShipIndex];
    if (canPlaceShip(x, y, size)) {
        placeShip(x, y, size);
        currentShipIndex++;
        
        // Actualizar UI
        document.getElementById('ships-left').innerText = fleetToPlace.length - currentShipIndex;
        
        if (currentShipIndex >= fleetToPlace.length) {
            document.getElementById('current-ship-size').innerText = "-";
            startBtn.disabled = false;
            startBtn.style.backgroundColor = '#2ecc71';
            rotateBtn.disabled = true;
            logMessage("Flota lista. Presiona INICIAR PARTIDA.");
        } else {
            document.getElementById('current-ship-size').innerText = fleetToPlace[currentShipIndex];
        }
    } else {
        alert("Posición inválida");
    }
}

function canPlaceShip(x, y, size) {
    for (let i = 0; i < size; i++) {
        const px = isHorizontal ? x + i : x;
        const py = isHorizontal ? y : y + i;
        if (px >= 10 || py >= 10) return false;
        if (myShips.some(s => s.x === px && s.y === py)) return false;
    }
    return true;
}

function placeShip(x, y, size) {
    for (let i = 0; i < size; i++) {
        const px = isHorizontal ? x + i : x;
        const py = isHorizontal ? y : y + i;
        myShips.push({ x: px, y: py });
        document.getElementById(`player-cell-${px}-${py}`).classList.add('my-ship');
    }
}

// Inicio del juego
startBtn.addEventListener('click', async () => {
    if (gamePhase !== 'SETUP') return;

    try {
        const res = await fetch('/api/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ships: myShips })
        });
        
        if (res.ok) {
            gamePhase = 'PLAYING';
            setupPanel.style.display = 'none';
            logMessage("Sistema iniciado. Coordenadas enviadas al Proceso Principal.");
        }
    } catch (err) {
        console.error(err);
        alert("Error conectando con el servidor");
    }
});

// Turnos
async function handleAttack(x, y) {
    if (gamePhase !== 'PLAYING') return;
    
    const targetCell = document.getElementById(`enemy-cell-${x}-${y}`);
    if (targetCell.classList.contains('hit') || targetCell.classList.contains('miss')) return;

    try {
        // Enviamos disparo y esperamos respuesta del worker
        const res = await fetch('/api/shoot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ x, y })
        });
        const data = await res.json();

        // Pintar mi resultado
        if (data.playerResult === 'HIT') {
            targetCell.classList.add('hit');
            logMessage(`IMPACTO CONFIRMADO en (${x},${y})`);
        } else {
            targetCell.classList.add('miss');
            logMessage(`Tiro fallido en (${x},${y})`);
        }

        // Pintar el disparo del bot (si hubo)
        if (data.botShot) {
            const bx = data.botShot.x;
            const by = data.botShot.y;
            const myCell = document.getElementById(`player-cell-${bx}-${by}`);
            
            if (data.botShot.result === 'HIT') {
                myCell.classList.add('hit');
                logMessage(`¡ALERTA! Daño recibido en sector (${bx},${by})`);
            } else {
                myCell.classList.add('miss');
                logMessage(`Enemigo falló en (${bx},${by})`);
            }
        }

        // Verificar Ganador
        if (data.winner) {
            gamePhase = 'ENDED';
            const message = data.winner === 'PLAYER'
                ? '¡VICTORIA! Has hundido toda la flota enemiga.'
                : 'DERROTA. Tu flota ha sido destruida.';

            const modal = document.createElement('div');
            modal.style.position = 'fixed';
            modal.style.top = '50%';
            modal.style.left = '50%';
            modal.style.transform = 'translate(-50%, -50%)';
            modal.style.background = '#2c3e50';
            modal.style.padding = '40px';
            modal.style.border = '4px solid #f1c40f';
            modal.style.borderRadius = '10px';
            modal.style.color = 'white';
            modal.style.textAlign = 'center';
            modal.style.zIndex = '9999';

            modal.innerHTML = `
                <h2 style="margin-bottom: 20px;">${message}</h2>
                <button onclick="location.reload()" style="padding: 10px 20px; font-size: 18px; cursor: pointer;">
                    Jugar de Nuevo
                </button>
            `;
            document.body.appendChild(modal);
        }

    } catch (err) {
        console.error("Error en la red:", err);
    }
}

// Inicializar
createBoard(playerBoard, false);
createBoard(enemyBoard, true);