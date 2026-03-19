// Usamos 'let' porque vamos a reasignar esta variable cuando cambiemos de servidor
let socket = io();

// Elementos del DOM
const playerBoard = document.getElementById('player-board');
const enemyBoard = document.getElementById('enemy-board');
const rotateBtn = document.getElementById('rotate-btn');
const startBtn = document.getElementById('start-game-btn');
const setupPanel = document.getElementById('setup-panel');
const logContainer = document.querySelector('.log-console');
const logList = document.getElementById('game-logs');
const turnDisplay = document.getElementById('turn-display'); 
const playAgainBtn = document.getElementById('play-again-btn');

// Configuración del juego
const fleetToPlace = [3, 2, 2, 1, 1, 1]; 
let currentShipIndex = 0;
let isHorizontal = true;
let gamePhase = 'MATCHMAKING'; 
let myShips = []; 
let myPlayerNumber = 0; 
let isMyTurn = false; 
let lastHoveredCell = null;

function showPlayAgainButton() {
    if (playAgainBtn) playAgainBtn.style.display = 'inline-block';
}

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
            cell.addEventListener('mouseenter', () => handlePlacementPreview(x, y));
            cell.addEventListener('mouseleave', clearPlacementPreview);
        }
        boardElement.appendChild(cell);
    }
}

// Comunicación con el Maestro para encontrar partida
socket.on('waiting-master', (msg) => {
    logMessage(msg);
    if(turnDisplay) {
        turnDisplay.innerText = "Buscando servidor con espacio...";
        turnDisplay.style.color = "#f39c12"; 
    }
});

// El Maestro nos asigna un Servidor de Juego específico para esta partida
socket.on('redirect-to-game', (data) => {
    const gamePort = data.port;
    logMessage(`[SISTEMA] Redirigiendo al Servidor de Juego en puerto ${gamePort}...`);
    
    socket.disconnect();

    // Creamos una nueva conexión al Servidor de Juego asignado
    // Usamos window.location.hostname para que funcione en red local (tu IP) o localhost
    socket = io(`http://${window.location.hostname}:${gamePort}`);

    // Registramos todos los eventos de batalla en este nuevo socket
    setupGameEvents();
});

// Logica del juego
function setupGameEvents() {
    
    socket.on('connect', () => {
        logMessage(`Conexión establecida con el Servidor de Juego.`);
    });

    socket.on('waiting-opponent', (msg) => {
        if(turnDisplay) {
            turnDisplay.innerText = "Esperando al rival en la sala...";
            turnDisplay.style.color = "#f39c12"; 
        }
    });

    socket.on('player-number', (num) => {
        myPlayerNumber = num;
        logMessage(`Eres el Jugador ${num}`);
    });

    socket.on('start-setup', (msg) => {
        gamePhase = 'SETUP';
        logMessage(msg);
        if(turnDisplay) {
            turnDisplay.innerText = "Fase de Preparación";
            turnDisplay.style.color = "#3498db"; 
        }
        if(setupPanel) setupPanel.style.display = 'block'; 
    });

    socket.on('game-start', (data) => {
        gamePhase = 'PLAYING';
        if(setupPanel) setupPanel.style.display = 'none';
        
        isMyTurn = data.startingPlayer === myPlayerNumber;
        updateTurnDisplay();
        logMessage(`¡Guerra declarada! Combate iniciado.`);
    });

    socket.on('turn-change', (currentTurnNumber) => {
        isMyTurn = currentTurnNumber === myPlayerNumber;
        updateTurnDisplay();
    });

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

    socket.on('game-over', (data) => {
        gamePhase = 'ENDED';
        isMyTurn = false;
        enemyBoard.classList.remove('my-turn');
        
        if (turnDisplay) {
            if (data.winner === myPlayerNumber) {
                // ¡AGREGAMOS EL CÓDIGO RMI AQUÍ!
                turnDisplay.innerText = `¡VICTORIA! Código Oficial: ${data.code}`;
                turnDisplay.style.color = "#f1c40f"; 
                logMessage(`El Servidor RMI validó tu victoria: ${data.code}`);
            } else {
                turnDisplay.innerText = "DERROTA TOTAL.";
                turnDisplay.style.color = "#c0392b"; 
                logMessage("Tus barcos han sido hundidos.");
            }
        }
        showPlayAgainButton();
    });

    socket.on('opponent-disconnected', () => {
        if (gamePhase !== 'ENDED') {
            gamePhase = 'ENDED';
            isMyTurn = false;
            enemyBoard.classList.remove('my-turn');
            if(turnDisplay) {
                turnDisplay.innerText = "El oponente huyó. ¡GANASTE!";
                turnDisplay.style.color = "#9b59b6"; 
            }
            logMessage("El servidor cerró la sala por abandono.");
            showPlayAgainButton();
        }
    });

    socket.on('disconnect', () => {
        if (gamePhase === 'ENDED') {
            showPlayAgainButton();
        }
    });
}

// Funciones de manejo de UI y lógica de juego
if(rotateBtn) {
    rotateBtn.addEventListener('click', () => {
        isHorizontal = !isHorizontal;
        rotateBtn.innerText = isHorizontal ? "Rotar (Horizontal)" : "Rotar (Vertical)";
        if (lastHoveredCell && gamePhase === 'SETUP') {
            handlePlacementPreview(lastHoveredCell.x, lastHoveredCell.y);
        }
    });
}

function handlePlacementPreview(x, y) {
    clearPlacementPreview();
    if (gamePhase !== 'SETUP') return;
    if (currentShipIndex >= fleetToPlace.length) return;

    lastHoveredCell = { x, y };
    const size = fleetToPlace[currentShipIndex];
    const canPlace = canPlaceShip(x, y, size, isHorizontal);

    for (let i = 0; i < size; i++) {
        const px = isHorizontal ? x + i : x;
        const py = isHorizontal ? y : y + i;
        if (px >= 10 || py >= 10) continue;
        const cell = document.getElementById(`player-cell-${px}-${py}`);
        if (!cell) continue;
        cell.classList.add(canPlace ? 'preview-valid' : 'preview-invalid');
    }
}

function clearPlacementPreview() {
    const previewCells = playerBoard.querySelectorAll('.preview-valid, .preview-invalid');
    previewCells.forEach((cell) => cell.classList.remove('preview-valid', 'preview-invalid'));
}

function handlePlacement(x, y) {
    if (gamePhase !== 'SETUP') return;
    if (currentShipIndex >= fleetToPlace.length) return;

    const size = fleetToPlace[currentShipIndex];

    if (canPlaceShip(x, y, size, isHorizontal)) {
        placeShip(x, y, size, isHorizontal);
        clearPlacementPreview();
        currentShipIndex++;

        const remaining = fleetToPlace.length - currentShipIndex;
        if(document.getElementById('ships-left')) document.getElementById('ships-left').innerText = remaining;

        if (remaining > 0) {
            if(document.getElementById('current-ship-size')) document.getElementById('current-ship-size').innerText = fleetToPlace[currentShipIndex];
        } else {
            if(document.getElementById('current-ship-size')) document.getElementById('current-ship-size').innerText = "-";
            if(startBtn) {
                startBtn.disabled = false;
                startBtn.style.backgroundColor = "#2ecc71";
                startBtn.style.display = 'none'; 
            }
            logMessage("Flota lista.");
            
            socket.emit('ships-ready', myShips);
            if(turnDisplay) {
                turnDisplay.innerText = "Esperando al oponente...";
                turnDisplay.style.color = "#f1c40f"; 
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

function updateTurnDisplay() {
    if (!turnDisplay) return;
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

function handleAttack(x, y) {
    if (gamePhase !== 'PLAYING') return;
    if (!isMyTurn) {
        logMessage("Aviso: Bloqueo activo. No es tu turno.");
        return;
    }
    const cell = document.getElementById(`enemy-cell-${x}-${y}`);
    if (cell.classList.contains('hit') || cell.classList.contains('miss')) return;

    socket.emit('shoot', { x, y });
    
    isMyTurn = false; 
    if (turnDisplay) turnDisplay.innerText = "Procesando...";
}

if (playAgainBtn) {
    playAgainBtn.addEventListener('click', () => {
        window.location.reload();
    });
}

function logMessage(msg) {
    if (!logList) return;
    const item = document.createElement('li');
    item.textContent = `> ${msg}`;
    logList.appendChild(item);
    if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
}

// Inicializar
createBoard(playerBoard, false);
createBoard(enemyBoard, true);

// Cuando cargue la página, el cliente se conecta al Maestro y espera instrucciones para unirse a una partida
socket.emit('client-join-lobby');