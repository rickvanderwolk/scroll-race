// WebSocket connection
let ws;
let playerId = null;
let isLeader = false;
let position = 0;
let startTime = null;
let gameState = 'JOIN';
let lastUpdateTime = 0;

const finishPosition = 64000;
const UPDATE_RATE = 50; // ms (20 updates per second)
const raceTrackElement = document.getElementById('race-track');
const positionTextElement = document.getElementById('position-text');

// Connect to WebSocket
function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
        console.log('Connected to server');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleMessage(data);
    };

    ws.onclose = () => {
        console.log('Disconnected from server');
        showScreen('join');
        setTimeout(connect, 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function handleMessage(data) {
    switch (data.type) {
        case 'joined':
            playerId = data.playerId;
            isLeader = data.isLeader;
            gameState = 'WAITING';
            showScreen('waiting');

            const playerName = document.getElementById('player-name').value;
            document.getElementById('player-name-display').textContent = `Player ${data.playerNumber}: ${playerName}`;

            if (isLeader) {
                document.getElementById('leader-controls').classList.remove('hidden');
                document.getElementById('non-leader-message').classList.add('hidden');
            } else {
                document.getElementById('leader-controls').classList.add('hidden');
                document.getElementById('non-leader-message').classList.remove('hidden');
            }
            break;

        case 'startCountdown':
            gameState = 'COUNTDOWN';
            document.getElementById('countdown-text').textContent = '3';
            showScreen('countdown');
            break;

        case 'countdown':
            document.getElementById('countdown-text').textContent = data.count > 0 ? data.count : 'GO!';
            break;

        case 'raceStart':
            gameState = 'RACING';
            showScreen('race');
            startRace();
            break;

        case 'resetRace':
            console.log('Received resetRace from server');

            // FIRST: Scroll to top (while body is still scrollable)
            window.scrollTo(0, 0);
            console.log('Scrolled to top');

            gameState = 'WAITING';
            position = 0;
            startTime = null;

            // Reset race track to normal height
            const raceTrack = document.getElementById('race-track');
            if (raceTrack) {
                raceTrack.style.height = '200%';
                console.log('Race track reset to 200%');
            }

            // Clear finish info
            document.getElementById('finish-time').textContent = '';
            document.getElementById('finish-position').textContent = '';

            console.log('Calling showScreen(waiting)');
            showScreen('waiting');

            // Hide reset button
            document.getElementById('leader-reset-controls').classList.add('hidden');

            // Show leader controls again if this player is the leader
            if (isLeader) {
                document.getElementById('leader-controls').classList.remove('hidden');
                document.getElementById('non-leader-message').classList.add('hidden');
                console.log('Showing leader controls');
            } else {
                document.getElementById('leader-controls').classList.add('hidden');
                document.getElementById('non-leader-message').classList.remove('hidden');
                console.log('Showing non-leader message');
            }
            break;
    }
}

function showScreen(screenName) {
    console.log('showScreen called with:', screenName);
    document.querySelectorAll('.screen').forEach(screen => screen.classList.add('hidden'));

    // Remove racing class from body by default
    document.body.classList.remove('racing');

    // Hide position text when not racing
    const positionText = document.getElementById('position-text');
    if (positionText) {
        positionText.style.display = 'none';
    }

    if (screenName === 'join') {
        document.getElementById('join-screen').classList.remove('hidden');
        console.log('Join screen shown');
    } else if (screenName === 'waiting') {
        const waitingScreen = document.getElementById('waiting-screen');
        waitingScreen.classList.remove('hidden');
        console.log('Waiting screen shown');
        console.log('Waiting screen classes:', waitingScreen.className);
        console.log('Waiting screen display:', window.getComputedStyle(waitingScreen).display);

        const finishedScreen = document.getElementById('finished-screen');
        console.log('Finished screen classes:', finishedScreen.className);
        console.log('Finished screen display:', window.getComputedStyle(finishedScreen).display);
    } else if (screenName === 'countdown') {
        document.getElementById('countdown-screen').classList.remove('hidden');
        console.log('Countdown screen shown');
    } else if (screenName === 'race') {
        document.getElementById('race-screen').classList.remove('hidden');
        document.body.classList.add('racing');
        if (positionText) {
            positionText.style.display = 'block';
        }
        console.log('Race screen shown');
    } else if (screenName === 'finished') {
        document.getElementById('finished-screen').classList.remove('hidden');
        console.log('Finished screen shown');
    }
}

function startRace() {
    window.scrollTo(0, 0);
    position = 0;
    startTime = Date.now();
    raceTrackElement.style.height = '200%';
    positionTextElement.textContent = 'GO!';
}

// Join button
document.getElementById('join-button').addEventListener('click', () => {
    const playerName = document.getElementById('player-name').value.trim();
    if (playerName) {
        ws.send(JSON.stringify({
            type: 'joinPlayer',
            name: playerName
        }));
    }
});

// Enter key to join
document.getElementById('player-name').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('join-button').click();
    }
});

// Start button (for leader)
document.getElementById('start-button').addEventListener('click', () => {
    if (isLeader) {
        ws.send(JSON.stringify({
            type: 'startRace'
        }));
    }
});

// Reset button (for leader)
document.getElementById('reset-button').addEventListener('click', () => {
    console.log('Reset button clicked, isLeader:', isLeader);
    if (isLeader) {
        console.log('Sending resetRace to server');
        ws.send(JSON.stringify({
            type: 'resetRace'
        }));
    }
});

// Scroll handling for race
window.addEventListener('scroll', () => {
    if (gameState === 'RACING') {
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) {
            if (parseInt(position) >= finishPosition) {
                finishRace();
            } else {
                // Throttle position updates to reduce server load
                const now = Date.now();
                if (now - lastUpdateTime >= UPDATE_RATE) {
                    updatePosition();
                    lastUpdateTime = now;
                }
                // Always update UI and extend track (no throttle for better UX)
                positionTextElement.textContent = position;
                extendRaceTrack();
            }
        }
    }
});

function extendRaceTrack() {
    const currentHeight = raceTrackElement.offsetHeight;
    raceTrackElement.style.height = currentHeight + window.innerHeight + 'px';
}

function updatePosition() {
    position = parseInt(raceTrackElement.style.height) || 0;

    // Send position update to server
    ws.send(JSON.stringify({
        type: 'updatePosition',
        position: position
    }));
}

function finishRace() {
    if (gameState === 'RACING') {
        gameState = 'FINISHED';
        const endTime = Date.now();
        const timeElapsed = endTime - startTime;

        // Send finish to server
        ws.send(JSON.stringify({
            type: 'updatePosition',
            position: finishPosition,
            time: timeElapsed
        }));

        // Scroll to top to show finish screen properly
        window.scrollTo(0, 0);

        // Show finish screen
        showScreen('finished');
        document.getElementById('finish-time').textContent = `Time: ${timeElapsed} ms`;

        // Show reset button for leader
        if (isLeader) {
            document.getElementById('leader-reset-controls').classList.remove('hidden');
        }
    }
}

// Initialize connection
connect();

// Focus on name input
document.getElementById('player-name').focus();
