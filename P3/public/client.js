// Conectamos al servidor de Sockets
const socket = io();

// Elementos del DOM
const playerBoard = document.getElementById('player-board');
const enemyBoard = document.getElementById('enemy-board');
const rotateBtn = document.getElementById('rotate-btn');
const startBtn = document.getElementById('start-game-btn');
const setupPanel = document.getElementById('setup-panel');
const logContainer = document.querySelector('.log-console');
const logList = document.getElementById('game-logs');
const turnDisplay = document.getElementById('turn-display'); 

// Configuracion del juego
const fleetToPlace = [3, 2, 2, 1, 1, 1]; 
let currentShipIndex = 0;
let isHorizontal = true;
let gamePhase = 'MATCHMAKING'; // MATCHMAKING, SETUP, PLAYING, ENDED
let myShips = []; 
let myPlayerNumber = 0; 
let isMyTurn = false; 

// Inicializar tableros
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
        }

        boardElement.appendChild(cell);
    }
}

// Matchmaking
// El servidor nos pone en la cola de espera
socket.on('waiting-opponent', (msg) => {
    gamePhase = 'MATCHMAKING';
    logMessage(msg);
    if(turnDisplay) {
        turnDisplay.innerText = "Buscando partida (En Cola)...";
        turnDisplay.style.color = "#f39c12"; // Naranja
    }
});

// El servidor nos sacó de la cola y nos metió a una Sala (Room)
socket.on('player-number', (num) => {
    myPlayerNumber = num;
    logMessage(`Asignado a una sala. Eres el Jugador ${num}`);
});

// Ambos jugadores están en la sala, se pasa a la fase de preparación
socket.on('start-setup', (msg) => {
    gamePhase = 'SETUP';
    logMessage(msg);
    if(turnDisplay) {
        turnDisplay.innerText = "Fase de Preparación";
        turnDisplay.style.color = "#3498db"; // Azul
    }
    if(setupPanel) setupPanel.style.display = 'block'; 
});

// Si intentamos entrar y el servidor rechaza (por seguridad o error)
socket.on('server-full', (msg) => {
    alert(msg);
    logMessage("Sistema: " + msg);
});

// Fase de colocación
if(rotateBtn) {
    rotateBtn.addEventListener('click', () => {
        isHorizontal = !isHorizontal;
        rotateBtn.innerText = isHorizontal ? "Rotar (Horizontal)" : "Rotar (Vertical)";
    });
}

function handlePlacement(x, y) {
    if (gamePhase !== 'SETUP') return;
    if (currentShipIndex >= fleetToPlace.length) return;

    const size = fleetToPlace[currentShipIndex];

    if (canPlaceShip(x, y, size, isHorizontal)) {
        placeShip(x, y, size, isHorizontal);
        currentShipIndex++;

        const remaining = fleetToPlace.length - currentShipIndex;
        if(document.getElementById('ships-left')) {
            document.getElementById('ships-left').innerText = remaining;
        }

        if (remaining > 0) {
            if(document.getElementById('current-ship-size')) {
                document.getElementById('current-ship-size').innerText = fleetToPlace[currentShipIndex];
            }
        } else {
            // Terminamos de colocar
            if(document.getElementById('current-ship-size')) {
                document.getElementById('current-ship-size').innerText = "-";
            }
            if(startBtn) {
                startBtn.disabled = false;
                startBtn.style.backgroundColor = "#2ecc71";
                startBtn.style.display = 'none'; // Lo ocultamos porque enviamos automático
            }
            logMessage("Flota posicionada. Esperando a que el rival termine...");
            
            // Avisamos al servidor que estamos listos en nuestra sala
            socket.emit('ships-ready', myShips);
            if(turnDisplay) {
                turnDisplay.innerText = "Esperando al oponente...";
                turnDisplay.style.color = "#f1c40f"; // Amarillo
            }
        }
    } else {
        alert("Posición inválida o colisión con otro barco.");
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
        const cell = document.getElementById(`player-cell-${px}-${py}`);
        if(cell) cell.classList.add('my-ship');
    }
}

// Fase de combate
socket.on('game-start', (data) => {
    gamePhase = 'PLAYING';
    if(setupPanel) setupPanel.style.display = 'none';
    
    isMyTurn = data.startingPlayer === myPlayerNumber;
    updateTurnDisplay();
    logMessage(`¡Guerra declarada! El servidor ha iniciado la partida.`);
});

socket.on('turn-change', (currentTurnNumber) => {
    isMyTurn = currentTurnNumber === myPlayerNumber;
    updateTurnDisplay();
});

function updateTurnDisplay() {
    if (!turnDisplay) return;
    if (isMyTurn) {
        turnDisplay.innerText = "¡ES TU TURNO! Dispara.";
        turnDisplay.style.color = "#2ecc71"; // Verde
        enemyBoard.classList.add('my-turn'); 
    } else {
        turnDisplay.innerText = "Turno del enemigo. Espera...";
        turnDisplay.style.color = "#e74c3c"; // Rojo
        enemyBoard.classList.remove('my-turn');
    }
}

function handleAttack(x, y) {
    if (gamePhase !== 'PLAYING') return;
    
    if (!isMyTurn) {
        logMessage("Aviso: Bloqueo activo. No es tu turno.");
        return;
    }

    const cell = document.getElementById(`enemy-cell-${x}-${y}`);
    if (cell.classList.contains('hit') || cell.classList.contains('miss')) return;

    // Enviamos el disparo al servidor
    socket.emit('shoot', { x, y });
    
    // Inmediatamente bloqueamos más clics para evitar spam y condiciones de carrera
    // El servidor también tiene un Mutex por si el cliente es alterado
    isMyTurn = false; 
    if (turnDisplay) turnDisplay.innerText = "Procesando...";
}

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

// El oponente me disparó
socket.on('receive-shot', (data) => {
    const cell = document.getElementById(`player-cell-${data.x}-${data.y}`);
    if (data.result === 'HIT') {
        cell.classList.add('hit'); 
        logMessage(`¡ALERTA! Casco dañado en (${data.x}, ${data.y})`);
    } else {
        cell.classList.add('miss');
        logMessage(`El enemigo falló en (${data.x}, ${data.y})`);
    }
});

// Fin del juego y desconexiones
socket.on('game-over', (data) => {
    gamePhase = 'ENDED';
    
    if (turnDisplay) {
        if (data.winner === myPlayerNumber) {
            turnDisplay.innerText = "¡VICTORIA ROYALE!";
            turnDisplay.style.color = "#f1c40f"; 
            logMessage("La flota enemiga ha sido completamente destruida.");
        } else {
            turnDisplay.innerText = "DERROTA TOTAL.";
            turnDisplay.style.color = "#c0392b"; 
            logMessage("Tus barcos han sido hundidos.");
        }
    }
});

socket.on('opponent-disconnected', () => {
    if (gamePhase !== 'ENDED') {
        gamePhase = 'ENDED';
        if(turnDisplay) {
            turnDisplay.innerText = "El oponente se desconectó. ¡GANASTE!";
            turnDisplay.style.color = "#9b59b6"; // Morado
        }
        logMessage("El servidor cerró la sala por abandono.");
    }
});

function logMessage(msg) {
    if (!logList) return;
    const item = document.createElement('li');
    item.textContent = `> ${msg}`;
    logList.appendChild(item);
    if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
}

// Inicializamos creando la cuadrícula HTML
createBoard(playerBoard, false);
createBoard(enemyBoard, true);