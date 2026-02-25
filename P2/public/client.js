const socket = io();

const playerBoard = document.getElementById('player-board');
const enemyBoard = document.getElementById('enemy-board');
const rotateBtn = document.getElementById('rotate-btn');
const startBtn = document.getElementById('start-game-btn');
const setupPanel = document.getElementById('setup-panel');
const logContainer = document.querySelector('.log-console');
const logList = document.getElementById('game-logs');
// Indicador de turno visual
const turnDisplay = document.getElementById('turn-display'); 

const fleetToPlace = [3, 2, 2, 1, 1, 1]; 
let currentShipIndex = 0;
let isHorizontal = true;
let gamePhase = 'WAITING'; // Fases: WAITING, SETUP, PLAYING, ENDED
let myShips = []; 
let myPlayerNumber = 0;
let isMyTurn = false;

// Tableros
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

socket.on('player-number', (num) => {
    myPlayerNumber = num;
    logMessage(`Conectado como Jugador ${num}`);
});

socket.on('waiting-opponent', (msg) => {
    logMessage(msg);
    turnDisplay.innerText = "Esperando oponente...";
    turnDisplay.style.color = "#f1c40f";
});

socket.on('start-setup', (msg) => {
    gamePhase = 'SETUP';
    logMessage(msg);
    turnDisplay.innerText = "Fase de Preparación";
    turnDisplay.style.color = "#3498db";
    setupPanel.style.display = 'block';
});

socket.on('server-full', (msg) => {
    alert(msg);
    logMessage("Error: " + msg);
});

// Colocacion de barcos
rotateBtn.addEventListener('click', () => {
    isHorizontal = !isHorizontal;
    rotateBtn.innerText = isHorizontal ? "Rotar (Horizontal)" : "Rotar (Vertical)";
});

function handlePlacement(x, y) {
    if (gamePhase !== 'SETUP') return;
    if (currentShipIndex >= fleetToPlace.length) return;

    const size = fleetToPlace[currentShipIndex];

    if (canPlaceShip(x, y, size, isHorizontal)) {
        placeShip(x, y, size, isHorizontal);
        currentShipIndex++;

        const remaining = fleetToPlace.length - currentShipIndex;
        document.getElementById('ships-left').innerText = remaining;

        if (remaining > 0) {
            document.getElementById('current-ship-size').innerText = fleetToPlace[currentShipIndex];
        } else {
            // Terminamos de colocar
            document.getElementById('current-ship-size').innerText = "-";
            startBtn.disabled = false;
            startBtn.style.backgroundColor = "#2ecc71";
            logMessage("Flota posicionada. Esperando al rival...");
            
            // Enviamos nuestra flota al servidor automáticamente
            socket.emit('ships-ready', myShips);
            startBtn.style.display = 'none'; // Ya no lo necesitamos
        }
    } else {
        alert("Posición inválida o barco superpuesto.");
    }
}

function canPlaceShip(x, y, size, horizontal) {
    for (let i = 0; i < size; i++) {
        const px = horizontal ? x + i : x;
        const py = horizontal ? y : y + i;
        if (px >= 10 || py >= 10) return false;
        if (myShips.some(s => s.x === px && s.y === py)) return false;
    }
    return true;
}

function placeShip(x, y, size, horizontal) {
    for (let i = 0; i < size; i++) {
        const px = horizontal ? x + i : x;
        const py = horizontal ? y : y + i;
        myShips.push({ x: px, y: py });
        document.getElementById(`player-cell-${px}-${py}`).classList.add('my-ship');
    }
}

// Combate
// El servidor avisa que la partida empieza
socket.on('game-start', (data) => {
    gamePhase = 'PLAYING';
    setupPanel.style.display = 'none';
    
    // Verificamos si somos el jugador que empieza
    isMyTurn = data.startingPlayer === myPlayerNumber;
    updateTurnDisplay();
    logMessage(`¡Combate Iniciado!`);
});

// El servidor nos dice que el turno cambio
socket.on('turn-change', (currentTurnNumber) => {
    isMyTurn = currentTurnNumber === myPlayerNumber;
    updateTurnDisplay();
});

function updateTurnDisplay() {
    if (isMyTurn) {
        turnDisplay.innerText = "¡ES TU TURNO! Dispara.";
        turnDisplay.style.color = "#2ecc71";
        enemyBoard.classList.add('my-turn');
    } else {
        turnDisplay.innerText = "Turno del enemigo. Espera...";
        turnDisplay.style.color = "#e74c3c";
        enemyBoard.classList.remove('my-turn');
    }
}

// Yo disparo
function handleAttack(x, y) {
    if (gamePhase !== 'PLAYING') return;
    if (!isMyTurn) {
        logMessage("¡Tranquilo! No es tu turno.");
        return;
    }

    const cell = document.getElementById(`enemy-cell-${x}-${y}`);
    if (cell.classList.contains('hit') || cell.classList.contains('miss')) return;

    // Enviamos la orden al servidor
    socket.emit('shoot', { x, y });
    
    // Bloqueamos disparos temporalmente hasta que el servidor responda o cambie turno
    isMyTurn = false; 
}

// Resultados del turno
// Respuesta a mi disparo
socket.on('shot-result', (data) => {
    const cell = document.getElementById(`enemy-cell-${data.x}-${data.y}`);
    if (data.result === 'HIT') {
        cell.classList.add('hit');
        logMessage(`¡IMPACTO CONFIRMADO en (${data.x}, ${data.y})!`);
    } else {
        cell.classList.add('miss');
        logMessage(`Agua en (${data.x}, ${data.y}).`);
    }
});

// El oponente me disparo
socket.on('receive-shot', (data) => {
    const cell = document.getElementById(`player-cell-${data.x}-${data.y}`);
    if (data.result === 'HIT') {
        cell.classList.add('hit');
        logMessage(`¡ALERTA! Te han dado en (${data.x}, ${data.y})`);
    } else {
        cell.classList.add('miss');
        logMessage(`El enemigo falló en (${data.x}, ${data.y})`);
    }
});

// Fin del juego / Desconexion
socket.on('game-over', (data) => {
    gamePhase = 'ENDED';
    const iWon = data.winner === myPlayerNumber;
    
    if (iWon) {
        turnDisplay.innerText = "¡VICTORIA! Flota enemiga destruida.";
        turnDisplay.style.color = "#f1c40f";
        logMessage("MISIÓN CUMPLIDA.");
    } else {
        turnDisplay.innerText = "DERROTA. Has perdido todos tus barcos.";
        turnDisplay.style.color = "#c0392b";
        logMessage("La flota ha sido hundida.");
    }
});

socket.on('opponent-disconnected', () => {
    if (gamePhase !== 'ENDED') {
        gamePhase = 'ENDED';
        turnDisplay.innerText = "El oponente huyó. ¡GANASTE!";
        turnDisplay.style.color = "#9b59b6";
        logMessage("Victoria por abandono.");
    }
});

function logMessage(msg) {
    const item = document.createElement('li');
    item.textContent = `> ${msg}`;
    logList.appendChild(item);
    if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
}

// Inicializar
createBoard(playerBoard, false);
createBoard(enemyBoard, true);