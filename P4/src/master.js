const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '../public')));

let waitingQueue = []; // Clientes esperando
let gameServers = {};  // Diccionario de servidores de juego activos

// Matchmaking: Intentamos emparejar a los clientes en espera con servidores de juego disponibles
function matchmake() {
    // Si hay al menos 2 clientes esperando
    while (waitingQueue.length >= 2) {
        
        // Buscamos un servidor de juego que no esté lleno
        const availableServerId = Object.keys(gameServers).find(id => {
            const gs = gameServers[id];
            return gs.activeRooms < gs.maxRooms;
        });

        // Si todos los servidores están llenos, rompemos el ciclo y esperamos
        if (!availableServerId) {
            console.log(`[MAESTRO] Todos los servidores de juego están llenos. Clientes en espera: ${waitingQueue.length}`);
            break; 
        }

        // Si hay espacio, sacamos a 2 clientes de la cola
        const client1 = waitingQueue.shift();
        const client2 = waitingQueue.shift();
        const serverToUse = gameServers[availableServerId];

        console.log(`[MAESTRO] Emparejando 2 clientes -> Redirigiendo al Servidor en Puerto ${serverToUse.port}`);

        serverToUse.activeRooms++; 

        // Les enviamos a los clientes el puerto al que deben conectarse ahora
        client1.emit('redirect-to-game', { port: serverToUse.port });
        client2.emit('redirect-to-game', { port: serverToUse.port });
    }
}

// Conexiones
io.on('connection', (socket) => {
    
    // Conexiones de los servidores de juego
    socket.on('register-game-server', (data) => {
        gameServers[socket.id] = {
            port: data.port,
            activeRooms: 0,
            maxRooms: data.maxRooms
        };
        console.log(`\n[NODO ACTIVO] Servidor de Juego registrado en puerto ${data.port} (Capacidad: ${data.maxRooms} salas)`);
        
        // Al registrarse un nuevo servidor, intentamos emparejar a los que estaban esperando
        matchmake(); 
    });

    // Sincronización: El servidor de juego nos avisa cuántas salas tiene ocupadas
    socket.on('update-load', (data) => {
        if (gameServers[socket.id]) {
            gameServers[socket.id].activeRooms = data.activeRooms;
            // Si se liberó espacio, intentamos emparejar
            matchmake(); 
        }
    });

    // Conexiones de jugadores
    socket.on('client-join-lobby', () => {
        console.log(`[LOBBY] Nuevo cliente jugador conectado: ${socket.id}`);
        waitingQueue.push(socket);
        socket.emit('waiting-master', 'Conectado al Servidor Maestro. Buscando un Servidor de Juego disponible...');
        matchmake();
    });

    // Desconexiones
    socket.on('disconnect', () => {
        // Verificamos si era un servidor de juego o un cliente
        if (gameServers[socket.id]) {
            console.log(`\n[ALERTA] Servidor de Juego en puerto ${gameServers[socket.id].port} se ha desconectado.`);
            delete gameServers[socket.id];
        } else {
            // Era un cliente que se aburrió de esperar
            waitingQueue = waitingQueue.filter(s => s.id !== socket.id);
        }
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`SERVIDOR MAESTRO (BALANCEADOR DE CARGA)`);
    console.log(`Escuchando en el puerto ${PORT}`);
    console.log(`Esperando a que se conecten los Servidores de Juego...`);
    console.log(`=======================================================\n`);
});