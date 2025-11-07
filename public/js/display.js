// WebSocket connection
let ws;
let players = [];
let gameState = 'WAITING';

// Connect to WebSocket
function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
        console.log('Connected to server');
        ws.send(JSON.stringify({ type: 'joinDisplay' }));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleMessage(data);
    };

    ws.onclose = () => {
        console.log('Disconnected from server');
        setTimeout(connect, 3000); // Reconnect after 3 seconds
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function handleMessage(data) {
    switch (data.type) {
        case 'gameState':
            gameState = data.state;
            players = data.players;
            updatePlayerList();
            showScreen(gameState);
            break;

        case 'playerJoined':
            players.push(data.player);
            updatePlayerList();
            break;

        case 'playerDisconnected':
            const player = players.find(p => p.id === data.playerId);
            if (player) {
                player.connected = false;
                updatePlayerList();
                updateRaceDisplay();
            }
            break;

        case 'startCountdown':
            gameState = 'COUNTDOWN';
            showScreen('COUNTDOWN');
            break;

        case 'countdown':
            document.getElementById('countdown-text').textContent = data.count > 0 ? data.count : 'GO!';
            break;

        case 'raceStart':
            gameState = 'RACING';
            showScreen('RACING');
            initRaceDisplay();
            break;

        case 'positionUpdate':
            const racer = players.find(p => p.id === data.playerId);
            if (racer) {
                racer.position = data.position;
                updateRaceDisplay();
            }
            break;

        case 'batchPositionUpdate':
            // Handle batched position updates from server
            if (data.updates && Array.isArray(data.updates)) {
                data.updates.forEach(update => {
                    const player = players.find(p => p.id === update.playerId);
                    if (player) {
                        player.position = update.position;
                    }
                });
                updateRaceDisplay();
            }
            break;

        case 'playerFinished':
            const finishedPlayer = players.find(p => p.id === data.playerId);
            if (finishedPlayer) {
                finishedPlayer.finished = true;
                finishedPlayer.finishPosition = data.position;
                finishedPlayer.finishTime = data.time;
                console.log(`Player ${finishedPlayer.name} finished - Position: ${data.position}, Time: ${data.time} ms`);
                console.log('All player data:', players.map(p => ({
                    name: p.name,
                    finished: p.finished,
                    finishTime: p.finishTime,
                    finishPosition: p.finishPosition
                })));
                updateRaceDisplay();
            }
            break;

        case 'raceFinished':
            gameState = 'FINISHED';
            console.log('Race finished! Showing results...');
            console.log('Final player data before results:', players.map(p => ({
                name: p.name,
                finished: p.finished,
                finishTime: p.finishTime,
                finishPosition: p.finishPosition
            })));
            showScreen('FINISHED');
            showResults();
            break;

        case 'resetRace':
            gameState = 'WAITING';
            players.forEach(p => {
                p.position = 0;
                delete p.finished;
                delete p.finishTime;
                delete p.finishPosition;
            });
            showScreen('WAITING');
            updatePlayerList();
            break;
    }
}

function showScreen(state) {
    // Hide all content sections
    document.getElementById('waiting-content').classList.add('hidden');
    document.getElementById('race-content').classList.add('hidden');
    document.getElementById('results-content').classList.add('hidden');
    document.getElementById('countdown-overlay').classList.add('hidden');

    if (state === 'WAITING') {
        document.getElementById('waiting-content').classList.remove('hidden');
    } else if (state === 'COUNTDOWN') {
        // Show countdown overlay over current content
        document.getElementById('countdown-overlay').classList.remove('hidden');
    } else if (state === 'RACING') {
        document.getElementById('race-content').classList.remove('hidden');
    } else if (state === 'FINISHED') {
        document.getElementById('results-content').classList.remove('hidden');
    }
}

function updatePlayerList() {
    const playersList = document.getElementById('players');
    const playerListDiv = document.getElementById('player-list');
    playersList.innerHTML = '';

    // Hide player list if no players
    if (players.length === 0) {
        playerListDiv.style.display = 'none';
    } else {
        playerListDiv.style.display = 'block';
        players.forEach(player => {
            const li = document.createElement('li');
            li.textContent = `Player ${player.playerNumber}: ${player.name}`;
            if (!player.connected) {
                li.classList.add('disconnected');
            }
            playersList.appendChild(li);
        });
    }

    // Update join URL and QR code
    const controllerUrl = `${window.location.protocol}//${window.location.host}/controller`;
    const joinUrl = document.getElementById('join-url');
    joinUrl.textContent = controllerUrl;

    // Generate QR code
    const qrImg = document.getElementById('qr-code');
    fetch(`/qr?url=${encodeURIComponent(controllerUrl)}`)
        .then(response => response.json())
        .then(data => {
            qrImg.src = data.qr;
            qrImg.style.display = 'block';
        })
        .catch(error => {
            console.error('Error loading QR code:', error);
        });
}

function initRaceDisplay() {
    const racersDiv = document.getElementById('racers');
    racersDiv.innerHTML = '';

    players.forEach(player => {
        const racerDiv = document.createElement('div');
        racerDiv.className = 'racer';
        racerDiv.id = `racer-${player.id}`;

        const infoDiv = document.createElement('div');
        infoDiv.className = 'racer-info';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'racer-name';
        nameDiv.textContent = `Player ${player.playerNumber}: ${player.name}`;

        const positionDiv = document.createElement('div');
        positionDiv.className = 'racer-position';
        positionDiv.textContent = '-';

        infoDiv.appendChild(nameDiv);
        infoDiv.appendChild(positionDiv);

        const progressDiv = document.createElement('div');
        progressDiv.className = 'racer-progress';

        const progressBar = document.createElement('div');
        progressBar.className = 'racer-progress-bar';
        progressBar.style.width = '0%';

        progressDiv.appendChild(progressBar);
        racerDiv.appendChild(infoDiv);
        racerDiv.appendChild(progressDiv);
        racersDiv.appendChild(racerDiv);
    });
}

function updateRaceDisplay() {
    const finishPosition = 64000;

    // Sort players by position
    const sortedPlayers = [...players].sort((a, b) => b.position - a.position);

    sortedPlayers.forEach((player, index) => {
        const racerDiv = document.getElementById(`racer-${player.id}`);
        if (racerDiv) {
            const progressBar = racerDiv.querySelector('.racer-progress-bar');
            const positionDiv = racerDiv.querySelector('.racer-position');
            const progress = Math.min((player.position / finishPosition) * 100, 100);
            progressBar.style.width = `${progress}%`;

            // Update position/place
            if (player.finished) {
                positionDiv.textContent = player.finishPosition ? `#${player.finishPosition}` : '✓';
            } else {
                positionDiv.textContent = `${index + 1}`;
            }

            if (!player.connected) {
                racerDiv.classList.add('disconnected');
            }

            if (player.finished) {
                racerDiv.classList.add('finished');
            }
        }
    });
}

function showResults() {
    console.log('showResults() called');
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '<h3>Results:</h3>';

    // Get only finished players and sort by finish position
    const finishedPlayers = players.filter(p => p.finished);
    console.log('Finished players:', finishedPlayers.length);

    const sortedPlayers = finishedPlayers.sort((a, b) => {
        return (a.finishPosition || 999) - (b.finishPosition || 999);
    });

    sortedPlayers.forEach((player, index) => {
        console.log(`Result ${index + 1}: ${player.name}, Time: ${player.finishTime}, Position: ${player.finishPosition}`);

        const resultDiv = document.createElement('div');
        resultDiv.className = 'result-item';

        let medal = '';
        if (index === 0) medal = '🥇';
        else if (index === 1) medal = '🥈';
        else if (index === 2) medal = '🥉';
        else medal = `${index + 1}.`;

        const timeDisplay = player.finishTime ? `${player.finishTime} ms` : '-';
        resultDiv.innerHTML = `
            <span class="medal">${medal}</span>
            <span class="result-name">Player ${player.playerNumber}: ${player.name}</span>
            <span class="result-time">${timeDisplay}</span>
        `;
        resultsDiv.appendChild(resultDiv);
    });

    // Show message if no results
    if (sortedPlayers.length === 0) {
        console.log('No finished players found!');
        resultsDiv.innerHTML += '<p>No results available</p>';
    }
}

// Initialize
connect();
