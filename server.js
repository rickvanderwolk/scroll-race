const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'display.html'));
});

app.get('/controller', (req, res) => {
    res.sendFile(path.join(__dirname, 'controller.html'));
});

// QR code endpoint
app.get('/qr', async (req, res) => {
    try {
        const url = req.query.url;
        if (!url) {
            return res.status(400).send('URL parameter required');
        }

        // Generate QR code as data URL
        const qrDataUrl = await QRCode.toDataURL(url, {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            width: 300,
            margin: 2,
            color: {
                dark: '#ffffff',
                light: '#0a0a0a'
            }
        });

        res.json({ qr: qrDataUrl });
    } catch (error) {
        console.error('Error generating QR code:', error);
        res.status(500).send('Error generating QR code');
    }
});

// Game state
let players = [];
let gameState = 'WAITING'; // WAITING, COUNTDOWN, RACING, FINISHED
let leaderId = null;

// Batching for display updates
let pendingDisplayUpdates = [];
const BATCH_INTERVAL = 50; // ms (20 updates per second)

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('New connection established');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(ws, data);
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    ws.on('close', () => {
        const player = players.find(p => p.ws === ws);
        if (player) {
            player.connected = false;
            console.log(`Player ${player.name} disconnected`);
            broadcast({ type: 'playerDisconnected', playerId: player.id });
        }

        // If display disconnects, just log it
        if (ws.isDisplay) {
            console.log('Display disconnected');
        }
    });
});

function handleMessage(ws, data) {
    switch (data.type) {
        case 'joinDisplay':
            ws.isDisplay = true;
            // Send current game state to display - only connected players
            ws.send(JSON.stringify({
                type: 'gameState',
                state: gameState,
                players: players.filter(p => p.connected).map(p => ({
                    id: p.id,
                    name: p.name,
                    playerNumber: p.playerNumber,
                    position: p.position,
                    connected: p.connected,
                    isLeader: p.id === leaderId
                }))
            }));
            break;

        case 'joinPlayer':
            const playerId = Date.now().toString();

            // Get next player number (only count connected players)
            const connectedPlayers = players.filter(p => p.connected);
            const playerNumber = connectedPlayers.length + 1;

            const player = {
                id: playerId,
                name: data.name,
                playerNumber: playerNumber,
                position: 0,
                connected: true,
                ws: ws
            };

            players.push(player);

            // First player is the leader
            if (!leaderId) {
                leaderId = playerId;
            }

            // Send player their ID, number and leader status
            ws.send(JSON.stringify({
                type: 'joined',
                playerId: playerId,
                playerNumber: playerNumber,
                isLeader: playerId === leaderId
            }));

            // Broadcast new player to all
            broadcast({
                type: 'playerJoined',
                player: {
                    id: player.id,
                    name: player.name,
                    playerNumber: player.playerNumber,
                    position: player.position,
                    connected: player.connected,
                    isLeader: player.id === leaderId
                }
            });

            console.log(`Player ${data.name} joined (${playerId})`);
            break;

        case 'startRace':
            const starter = players.find(p => p.ws === ws);
            if (starter && starter.id === leaderId && gameState === 'WAITING') {
                gameState = 'COUNTDOWN';
                broadcast({ type: 'startCountdown' });

                // Start countdown
                let count = 3;
                const countdownInterval = setInterval(() => {
                    broadcast({ type: 'countdown', count: count });
                    count--;

                    if (count < 0) {
                        clearInterval(countdownInterval);
                        gameState = 'RACING';
                        broadcast({ type: 'raceStart' });
                    }
                }, 1000);
            }
            break;

        case 'updatePosition':
            const currentPlayer = players.find(p => p.ws === ws);
            if (currentPlayer && gameState === 'RACING') {
                currentPlayer.position = data.position;

                // Send position update back to the controller (own position only)
                sendToClient(ws, {
                    type: 'positionUpdate',
                    playerId: currentPlayer.id,
                    position: data.position
                });

                // Add to pending updates for display (batched)
                pendingDisplayUpdates.push({
                    playerId: currentPlayer.id,
                    position: data.position
                });

                // Check if player finished (only broadcast if time is provided)
                if (data.position >= 32000 && data.time) {
                    broadcast({
                        type: 'playerFinished',
                        playerId: currentPlayer.id,
                        time: data.time,
                        position: getFinishPosition()
                    });

                    // Check if all connected players finished
                    const connectedPlayers = players.filter(p => p.connected);
                    if (connectedPlayers.length > 0 && connectedPlayers.every(p => p.position >= 32000)) {
                        gameState = 'FINISHED';
                        broadcast({ type: 'raceFinished' });
                    }
                }
            }
            break;

        case 'resetRace':
            // Only leader can reset
            const resetter = players.find(p => p.ws === ws);
            console.log('Reset request from:', resetter ? resetter.name : 'unknown');
            console.log('Is leader?', resetter && resetter.id === leaderId);
            if (resetter && resetter.id === leaderId) {
                console.log('Resetting game...');
                resetGame();
            } else {
                console.log('Reset denied - not leader');
            }
            break;
    }
}

function getFinishPosition() {
    return players.filter(p => p.position >= 32000).length;
}

function resetGame() {
    console.log('resetGame() called');
    gameState = 'WAITING';

    // Remove disconnected players and reset connected players
    players = players.filter(p => p.connected);
    players.forEach(p => {
        p.position = 0;
        delete p.finished;
        delete p.finishTime;
        delete p.finishPosition;
    });

    console.log('Broadcasting resetRace to all clients');
    broadcast({ type: 'resetRace' });
    console.log('Reset complete');
}

function broadcast(data) {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Send to specific client
function sendToClient(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

// Send only to displays
function broadcastToDisplays(data) {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client.isDisplay) {
            client.send(message);
        }
    });
}

// Send only to controllers (players)
function broadcastToControllers(data) {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && !client.isDisplay) {
            client.send(message);
        }
    });
}

// Get local IP address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// Batch display updates at regular intervals
setInterval(() => {
    if (pendingDisplayUpdates.length > 0 && gameState === 'RACING') {
        broadcastToDisplays({
            type: 'batchPositionUpdate',
            updates: pendingDisplayUpdates
        });
        pendingDisplayUpdates = [];
    }
}, BATCH_INTERVAL);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    const localIP = getLocalIP();
    console.log('=================================');
    console.log('Scroll Race Multiplayer Server');
    console.log('=================================');
    console.log(`Display: http://${localIP}:${PORT}`);
    console.log(`Controller: http://${localIP}:${PORT}/controller`);
    console.log('=================================');
});
