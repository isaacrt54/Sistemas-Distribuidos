// --- CONFIGURACIÓN Y ESTADO DEL CLIENTE REST ---
const MASTER_URL = `http://${window.location.hostname}:3000`;
let GAME_URL = ''; // Se llenará cuando el Maestro nos asigne puerto

let myPlayerId = null;
let myPlayerNumber = null;
let myRoomId = null;
let gamePhase = 'MATCHMAKING'; 
let isMyTurn = false;

// Controladores de intervalos (Polling)
let lobbyPollInterval = null;
let gamePollInterval = null;

// Elementos del DOM (Iguales que siempre)
const playerBoard = document.getElementById('player-board');
const enemyBoard = document.getElementById('enemy-board');
const rotateBtn = document.getElementById('rotate-btn');
const startBtn = document.getElementById('start-game-btn');
const setupPanel = document.getElementById('setup-panel');
const logContainer = document.querySelector('.log-console');
const logList = document.getElementById('game-logs');
const turnDisplay = document.getElementById('turn-display'); 
const playAgainBtn = document.getElementById('play-again-btn');

const fleetToPlace = [3, 2, 2, 1, 1, 1]; 
let currentShipIndex = 0;
let isHorizontal = true;
let myShips = []; 

// --- 1. INICIALIZACIÓN Y ENTRADA AL LOBBY ---

async function joinLobby() {
    try {
        logMessage("Conectando al Servidor Maestro (API REST)...");
        if(turnDisplay) {
            turnDisplay.innerText = "Entrando a la sala de espera...";
            turnDisplay.style.color = "#f39c12"; 
        }

        // Petición POST inicial para registrarnos
        const response = await fetch(`${MASTER_URL}/api/lobby/join`, { method: 'POST' });
        const data = await response.json();
        
        myPlayerId = data.playerId;
        logMessage(`Registrado con ID: ${myPlayerId.split('-')[0]}...`);
        
        // Iniciamos el Polling para preguntar por nuestra partida
        lobbyPollInterval = setInterval(pollMasterStatus, 1000); // Pregunta cada 1 segundo

    } catch (error) {
        logMessage("Error crítico: No se pudo conectar al Maestro.");
    }
}

// --- 2. POLLING DEL LOBBY (El cliente pregunta su estado) ---

async function pollMasterStatus() {
    try {
        const response = await fetch(`${MASTER_URL}/api/lobby/status/${myPlayerId}`);
        const data = await response.json();

        if (data.status === 'matched') {
            // ¡Nos encontraron partida!
            clearInterval(lobbyPollInterval); // Dejamos de preguntar al Maestro
            
            myRoomId = data.roomId;
            myPlayerNumber = data.playerNumber;
            GAME_URL = `http://${window.location.hostname}:${data.port}`;
            
            logMessage(`¡Partida encontrada! Redirigiendo al puerto ${data.port}.`);
            logMessage(`Eres el Jugador ${myPlayerNumber}.`);
            
            // Pasamos a la fase de preparación
            startSetupPhase();
        } else {
            if(turnDisplay) turnDisplay.innerText = "Buscando oponente (Haciendo Polling)...";
        }
    } catch (error) {
        console.error("Fallo al hacer polling al Maestro", error);
    }
}

// --- 3. FASE DE PREPARACIÓN ---

function startSetupPhase() {
    gamePhase = 'SETUP';
    if(turnDisplay) {
        turnDisplay.innerText = "Fase de Preparación";
        turnDisplay.style.color = "#3498db"; 
    }
    if(setupPanel) setupPanel.style.display = 'block'; 
}

// Al dar clic en Iniciar Partida (Enviar Barcos)
async function sendShipsToGameServer() {
    try {
        if(turnDisplay) {
            turnDisplay.innerText = "Sincronizando flota...";
            turnDisplay.style.color = "#f1c40f"; 
        }

        // POST a la API del Servidor de Juego
        await fetch(`${GAME_URL}/api/game/${myRoomId}/setup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerNumber: myPlayerNumber, ships: myShips })
        });

        logMessage("Flota enviada. Esperando a que el rival termine...");
        
        // Iniciamos el Polling del Juego
        gamePollInterval = setInterval(pollGameState, 1000);

    } catch (error) {
        logMessage("Error enviando la flota al servidor de juego.");
    }
}

// --- 4. POLLING DEL JUEGO (El motor principal en REST) ---

async function pollGameState() {
    if (gamePhase === 'ENDED') return;

    try {
        const response = await fetch(`${GAME_URL}/api/game/${myRoomId}/state/${myPlayerNumber}`);
        const state = await response.json();

        // Verificamos en qué fase estamos
        if (state.phase === 'PLAYING') {
            if (gamePhase !== 'PLAYING') {
                gamePhase = 'PLAYING';
                if(setupPanel) setupPanel.style.display = 'none';
                logMessage("¡Guerra declarada! El juego ha comenzado.");
            }

            // Verificamos turnos
            isMyTurn = (state.turn === myPlayerNumber);
            updateTurnDisplay();

            // Procesar el último disparo (Si nos dispararon a nosotros)
            if (state.lastShot && state.lastShot.shooter !== myPlayerNumber) {
                processEnemyShot(state.lastShot);
            }

        } else if (state.phase === 'ENDED') {
            handleGameOver(state.winner, state.disconnectReason);
        }

    } catch (error) {
        console.error("Fallo al consultar el estado del juego", error);
    }
}

function processEnemyShot(shotInfo) {
    const cell = document.getElementById(`player-cell-${shotInfo.x}-${shotInfo.y}`);
    if (!cell) return;
    
    // Solo procesamos si no lo hemos marcado antes (para no repetir logs infinitos)
    if (!cell.classList.contains('hit') && !cell.classList.contains('miss')) {
        if (shotInfo.result === 'HIT') {
            cell.classList.add('hit');
            logMessage(`¡ALERTA! Te han impactado en (${shotInfo.x}, ${shotInfo.y})`);
        } else {
            cell.classList.add('miss');
            logMessage(`El enemigo falló en (${shotInfo.x}, ${shotInfo.y})`);
        }
    }
}

// --- 5. DISPARAR (Petición REST Síncrona) ---

async function handleAttack(x, y) {
    if (gamePhase !== 'PLAYING' || !isMyTurn) return;

    const cell = document.getElementById(`enemy-cell-${x}-${y}`);
    if (cell.classList.contains('hit') || cell.classList.contains('miss')) return;

    // Bloqueo visual inmediato
    isMyTurn = false;
    if (turnDisplay) turnDisplay.innerText = "Procesando...";

    try {
        const response = await fetch(`${GAME_URL}/api/game/${myRoomId}/shoot`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerNumber: myPlayerNumber, x, y })
        });
        
        const data = await response.json();

        if (data.error) {
            logMessage(`Aviso: ${data.error}`);
            return;
        }

        // Aplicamos el resultado en nuestro radar
        if (data.result === 'HIT') {
            cell.classList.add('hit');
            logMessage(`¡IMPACTO CONFIRMADO en (${data.x}, ${data.y})!`);
        } else {
            cell.classList.add('miss');
            logMessage(`Agua en (${data.x}, ${data.y}).`);
        }

        // Si el servidor nos dice que ganamos con este tiro
        if (data.isWinner) {
            handleGameOver(myPlayerNumber);
        }

    } catch (error) {
        logMessage("Error de red al disparar.");
    }
}

// --- 6. FIN DEL JUEGO Y UTILIDADES ---

function handleGameOver(winnerNumber, disconnectReason = null) {
    gamePhase = 'ENDED';
    isMyTurn = false;
    clearInterval(gamePollInterval); // Apagamos el Polling 
    enemyBoard.classList.remove('my-turn');

    if (turnDisplay) {
        if (winnerNumber === myPlayerNumber) {
            if (disconnectReason === "abandono") {
                turnDisplay.innerText = "El oponente huyó. ¡GANASTE!";
                turnDisplay.style.color = "#9b59b6"; // Morado para abandono
                logMessage("El servidor cerró la sala por abandono (Timeout).");
            } else {
                turnDisplay.innerText = "¡VICTORIA ROYALE!";
                turnDisplay.style.color = "#f1c40f"; 
            }
        } else {
            turnDisplay.innerText = "DERROTA TOTAL.";
            turnDisplay.style.color = "#c0392b"; 
        }
    }
    if (playAgainBtn) playAgainBtn.style.display = 'inline-block';
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

if (playAgainBtn) {
    playAgainBtn.addEventListener('click', () => { window.location.reload(); });
}

function logMessage(msg) {
    if (!logList) return;
    const item = document.createElement('li');
    item.textContent = `> ${msg}`;
    logList.appendChild(item);
    if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;
}

// --- LÓGICA DE COLOCACIÓN DE BARCOS (IGUAL QUE ANTES) ---
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

function handlePlacement(x, y) {
    if (gamePhase !== 'SETUP' || currentShipIndex >= fleetToPlace.length) return;

    const size = fleetToPlace[currentShipIndex];
    if (canPlaceShip(x, y, size, isHorizontal)) {
        placeShip(x, y, size, isHorizontal);
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
            sendShipsToGameServer(); // <<-- AQUÍ LLAMAMOS A LA API REST
        }
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

if(rotateBtn) {
    rotateBtn.addEventListener('click', () => {
        isHorizontal = !isHorizontal;
        rotateBtn.innerText = isHorizontal ? "Rotar (Horizontal)" : "Rotar (Vertical)";
    });
}

// INICIAMOS EL JUEGO AL CARGAR LA PÁGINA
createBoard(playerBoard, false);
createBoard(enemyBoard, true);
joinLobby();