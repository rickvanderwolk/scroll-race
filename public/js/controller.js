// WebSocket connection
let ws;
let playerId = null;
let isLeader = false;
let position = 0;
let startTime = null;
let gameState = 'JOIN';
let lastUpdateTime = 0;

const finishPosition = 32000;
const UPDATE_RATE = 50; // ms (20 updates per second)
const raceTrackElement = document.getElementById('race-track');
const positionTextElement = document.getElementById('position-text');

// Connect to WebSocket
function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleMessage(data);
    };

    ws.onclose = () => {
        showScreen('join');
        setTimeout(connect, 3000);
    };

    ws.onerror = (error) => {
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
            // FIRST: Scroll to top (while body is still scrollable)
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

            gameState = 'WAITING';
            position = 0;
            startTime = null;

            // Reset race track to minimal height
            const raceTrack = document.getElementById('race-track');
            if (raceTrack) {
                raceTrack.style.height = '0px';
            }

            // Clear finish info
            document.getElementById('finish-time').textContent = '';
            document.getElementById('finish-position').textContent = '';

            showScreen('waiting');

            // Hide reset button
            document.getElementById('leader-reset-controls').classList.add('hidden');

            // Show leader controls again if this player is the leader
            if (isLeader) {
                document.getElementById('leader-controls').classList.remove('hidden');
                document.getElementById('non-leader-message').classList.add('hidden');
            } else {
                document.getElementById('leader-controls').classList.add('hidden');
                document.getElementById('non-leader-message').classList.remove('hidden');
            }
            break;
    }
}

function showScreen(screenName) {
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
    } else if (screenName === 'waiting') {
        const waitingScreen = document.getElementById('waiting-screen');
        waitingScreen.classList.remove('hidden');
    } else if (screenName === 'countdown') {
        document.getElementById('countdown-screen').classList.remove('hidden');
    } else if (screenName === 'race') {
        document.getElementById('race-screen').classList.remove('hidden');
        document.body.classList.add('racing');
        if (positionText) {
            positionText.style.display = 'block';
        }
    } else if (screenName === 'finished') {
        document.getElementById('finished-screen').classList.remove('hidden');
    }
}

function startRace() {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    position = 0;
    startTime = Date.now();

    // Use absolute height instead of percentage (like original used screen.height)
    // Start with 2x screen height to ensure scrollability
    const initialHeight = screen.height * 2;
    raceTrackElement.style.height = initialHeight + 'px';

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
    if (isLeader) {
        ws.send(JSON.stringify({
            type: 'resetRace'
        }));
    }
});

// Scroll handling for race - using onscroll like original for better Android compatibility
window.onscroll = function(ev) {
    if (gameState === 'RACING') {
        // Check if we've scrolled to the bottom
        const innerHeight = window.innerHeight;
        const scrollY = window.scrollY;
        const bodyHeight = document.body.offsetHeight;
        const trackHeight = raceTrackElement.offsetHeight;

        // Calculate how close we are
        const scrollBottom = innerHeight + scrollY;
        const distanceFromBottom = bodyHeight - scrollBottom;

        // Try multiple detection methods
        const method1 = scrollBottom >= bodyHeight;
        const method2 = scrollBottom >= (bodyHeight - 50); // 50px buffer
        const method3 = scrollBottom >= (bodyHeight - 100); // 100px buffer (more aggressive for Android)

        const scrolledToBottom = method1 || method2 || method3;

        if (scrolledToBottom) {
            if (parseInt(position) >= finishPosition) {
                finishRace();
            } else {
                // Always update position immediately for smooth scrolling (like original)
                updatePositionLocal();

                // Update UI (like original)
                positionTextElement.textContent = position;

                // Extend track (like original)
                extendRaceTrack();

                // Throttle server updates to reduce load
                const now = Date.now();
                if (now - lastUpdateTime >= UPDATE_RATE) {
                    sendPositionToServer();
                    lastUpdateTime = now;
                }
            }
        }
    }
};

function extendRaceTrack() {
    const currentHeight = raceTrackElement.offsetHeight;
    const newHeight = currentHeight + screen.height;
    // Use screen.height for better mobile compatibility (like original version)
    raceTrackElement.style.height = newHeight + 'px';
}

function updatePositionLocal() {
    // Update local position immediately (like original version)
    position = parseInt(raceTrackElement.style.height) || 0;
}

function sendPositionToServer() {
    // Send position update to server (throttled)
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
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });

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
