const socket = io();

// --- ELEMENTOS DEL DOM ---
const playerBoard = document.getElementById('player-board');
const enemyBoard = document.getElementById('enemy-board');
const rotateBtn = document.getElementById('rotate-btn');
const startBtn = document.getElementById('start-game-btn');
const shipsLeftSpan = document.getElementById('ships-left');
const currentSizeSpan = document.getElementById('current-ship-size');
const setupPanel = document.getElementById('setup-panel');

// --- CONFIGURACIÓN DEL JUEGO ---
// Tamaños de barcos a colocar: Uno de 3, dos de 2, tres de 1
const fleetToPlace = [3, 2, 2, 1, 1, 1]; 
let currentShipIndex = 0;
let isHorizontal = true; // false = Vertical
let gamePhase = 'SETUP'; // Estados: 'SETUP', 'PLAYING', 'ENDED'
let myShips = []; // Aquí guardaremos las coordenadas {x, y} de tus barcos

// --- 1. INICIALIZAR TABLEROS ---
function createBoard(boardElement, isEnemy = false) {
    boardElement.innerHTML = ''; // Limpiar
    for (let i = 0; i < 100; i++) {
        const cell = document.createElement('div');
        cell.classList.add('cell');
        
        const x = i % 10; 
        const y = Math.floor(i / 10);
        
        // IDs únicos para encontrar las celdas fácilmente luego
        cell.id = `${isEnemy ? 'enemy' : 'player'}-cell-${x}-${y}`;
        cell.dataset.x = x;
        cell.dataset.y = y;

        // EVENTOS DE CLIC
        if (isEnemy) {
            // Tablero enemigo: Disparar
            cell.addEventListener('click', () => handleAttack(x, y));
        } else {
            // Tablero propio: Colocar barcos
            cell.addEventListener('click', () => handlePlacement(x, y));
            
            // Opcional: Efecto visual al pasar el mouse (Previsualización)
            cell.addEventListener('mouseover', () => previewShip(x, y));
            cell.addEventListener('mouseout', () => clearPreview());
        }

        boardElement.appendChild(cell);
    }
}

// --- 2. LÓGICA DE COLOCACIÓN (SETUP) ---

rotateBtn.addEventListener('click', () => {
    isHorizontal = !isHorizontal;
    rotateBtn.innerText = isHorizontal ? "Rotar Barco (Horizontal)" : "Rotar Barco (Vertical)";
});

function handlePlacement(x, y) {
    if (gamePhase !== 'SETUP') return;
    if (currentShipIndex >= fleetToPlace.length) return;

    const size = fleetToPlace[currentShipIndex];

    if (canPlaceShip(x, y, size, isHorizontal)) {
        placeShip(x, y, size, isHorizontal);
        currentShipIndex++;

        // Actualizar UI del panel
        const remaining = fleetToPlace.length - currentShipIndex;
        shipsLeftSpan.innerText = remaining;

        if (remaining > 0) {
            currentSizeSpan.innerText = fleetToPlace[currentShipIndex];
        } else {
            // Fase de colocación terminada
            currentSizeSpan.innerText = "-";
            startBtn.disabled = false;
            startBtn.style.backgroundColor = "#2ecc71"; // Poner botón verde
            rotateBtn.disabled = true;
            logMessage("Flota lista. Presiona INICIAR JUEGO.");
        }
    } else {
        alert("No puedes colocar el barco ahí (Fuera de límites o colisión).");
    }
}

function canPlaceShip(x, y, size, horizontal) {
    for (let i = 0; i < size; i++) {
        const px = horizontal ? x + i : x;
        const py = horizontal ? y : y + i;

        if (px >= 10 || py >= 10) return false; // Fuera del mapa
        if (myShips.some(s => s.x === px && s.y === py)) return false; // Ya hay un barco
    }
    return true;
}

function placeShip(x, y, size, horizontal) {
    for (let i = 0; i < size; i++) {
        const px = horizontal ? x + i : x;
        const py = horizontal ? y : y + i;
        
        // Guardamos coordenada
        myShips.push({ x: px, y: py });
        
        // Pintamos de verde
        const cell = document.getElementById(`player-cell-${px}-${py}`);
        cell.classList.add('my-ship');
    }
}

// Funciones visuales extra para "Previsualizar" donde va a caer el barco
function previewShip(x, y) {
    if (gamePhase !== 'SETUP' || currentShipIndex >= fleetToPlace.length) return;
    const size = fleetToPlace[currentShipIndex];
    // Pintar temporalmente en gris claro
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
    // Restaurar colores
    const cells = document.querySelectorAll('#player-board .cell');
    cells.forEach(cell => {
        if (!cell.classList.contains('my-ship')) {
            cell.style.backgroundColor = ''; // Quitar estilo inline
        }
    });
}

// --- 3. INICIO DEL JUEGO ---

startBtn.addEventListener('click', () => {
    if (gamePhase !== 'SETUP') return;

    gamePhase = 'PLAYING';
    setupPanel.style.display = 'none'; // Ocultar panel de setup
    
    // ENVIAR BARCOS AL SERVIDOR
    socket.emit('start-game', myShips);
    
    logMessage("¡Juego iniciado! Tu turno de disparar.");
});

// --- 4. LÓGICA DE JUEGO (ATAQUE) ---

function handleAttack(x, y) {
    if (gamePhase !== 'PLAYING') {
        if (gamePhase === 'SETUP') alert("Primero coloca tus barcos e inicia el juego.");
        return;
    }

    const cell = document.getElementById(`enemy-cell-${x}-${y}`);
    // Evitar disparar dos veces al mismo lugar
    if (cell.classList.contains('hit') || cell.classList.contains('miss')) return;

    // Enviar disparo al servidor
    socket.emit('player-shot', { x, y });
}

// --- 5. EVENTOS DE SOCKET (RESPUESTAS DEL SERVIDOR) ---

// A) Resultado de MI disparo (en tablero enemigo)
socket.on('shot-result', (data) => {
    const cell = document.getElementById(`enemy-cell-${data.x}-${data.y}`);
    
    if (data.result === 'HIT') {
        cell.classList.add('hit'); // Rojo (definido en CSS)
        logMessage(`¡IMPACTO! Le diste al enemigo en (${data.x}, ${data.y})`);
    } else {
        cell.classList.add('miss'); // Gris
        logMessage(`Agua en (${data.x}, ${data.y}). Turno del bot.`);
    }
});

// B) El Bot me disparó (en mi tablero)
socket.on('bot-shot', (data) => {
    const cell = document.getElementById(`player-cell-${data.x}-${data.y}`);
    
    if (data.result === 'HIT') {
        // Al añadir la clase .hit, el CSS con !important pondrá la celda ROJA
        cell.classList.add('hit'); 
        logMessage(`¡TE DIERON! El bot acertó en (${data.x}, ${data.y})`);
    } else {
        cell.classList.add('miss');
        logMessage(`El bot falló en (${data.x}, ${data.y})`);
    }
});

// C) Fin del Juego
socket.on('game-over', (data) => {
    gamePhase = 'ENDED';
    const message = data.winner === 'PLAYER' 
        ? '¡VICTORIA! Has hundido toda la flota enemiga.' 
        : 'DERROTA. Tu flota ha sido destruida.';

    // Crear ventana modal simple
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
});

// --- UTILIDADES ---

function logMessage(msg) {
    const list = document.getElementById('game-logs');
    const item = document.createElement('li');
    item.textContent = msg;
    list.appendChild(item);
    
    // Auto-scroll al fondo
    const container = document.querySelector('.log-console');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

// Arrancar tableros vacíos
createBoard(playerBoard, false);
createBoard(enemyBoard, true);