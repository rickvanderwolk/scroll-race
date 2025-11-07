const textElement = document.getElementById('text');
const raceTrackElement = document.getElementById('race-track');
const startButtonElement = document.getElementById('start-button');

const MODE_WAIT_FOR_START = 0;
const MODE_COUNTDOWN = 1;
const MODE_RACING = 2;
const MODE_FINISHED = 3;

let currentMode = null;
let position = 0;
const finishPosition = 100000;

let startTime = null;
let timeElapsed = null;

setMode(MODE_WAIT_FOR_START);

function setMode (mode) {
    currentMode = mode;
    if (currentMode === MODE_WAIT_FOR_START) {
        setText('SCROLL RACE');
        showStartButton();
    } else if (currentMode === MODE_COUNTDOWN) {
        hideStartButton();
        startTimer(3, function () {
            setMode(MODE_RACING);
        })
    } else if (currentMode === MODE_RACING) {
        window.scrollTo(0, 0);
        setText('GO!');
        startTime = new Date();
    } else if (currentMode === MODE_FINISHED) {
        let endTime = new Date();
        var timeDiff = endTime - startTime; //in ms
        var seconds = Math.round(timeDiff);
        timeElapsed = seconds;
        setText('FINISHED<br>' + timeElapsed + '<br>MS');
    }
}

function startTimer(seconds, callback) {
    setText(seconds);
    setTimeout(function () {
        seconds--;
        setText(seconds);
        if (seconds === 0) {
            callback();
        } else {
            startTimer(seconds, callback);
        }
    }, 1000);
}

function showStartButton () {
    startButtonElement.style.display = 'block';
}

function hideStartButton () {
    startButtonElement.style.display = 'none';
}

startButtonElement.addEventListener('click', function () {
    setMode(MODE_COUNTDOWN);
});

window.onscroll = function(ev) {
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) {
        if (currentMode === MODE_RACING) {
            if (parseInt(position) > finishPosition) {
                setMode(MODE_FINISHED);
            } else {
                updatePosition();
                setText(position);
                extendRaceTrack();
            }
        }
    }
};

function extendRaceTrack () {
    raceTrackElement.style.height = raceTrackElement.offsetHeight + screen.height + 'px';
}

function updatePosition () {
    position = raceTrackElement.style.height;
}

function setText (text) {
    textElement.innerHTML = text;
}
