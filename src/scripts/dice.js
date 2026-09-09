// Sort Showdown — game logic.
//
// Lifecycle model
// ---------------
// A "round" is one dealt set of dice plus every piece of async work that belongs
// to it: the entrance animation, the timeout that starts the opponent, the
// interval that sorts the opponent's dice, and the SortableJS instance attached
// to the player's dice.
//
// Everything a round owns lives on the `round` object below, so there is exactly
// one place to start a round (`startRound`) and exactly one place to cancel it
// (`teardownRound`). Every round also carries an id; async callbacks capture that
// id and refuse to run if the round has since been replaced. Cancelling the
// timers is what actually stops the work — the id check is a second line of
// defence so a callback that escapes cancellation can never touch a newer round.

// Original quicksort algorithm
const quickSort = (arr) => {
    if (arr.length <= 1) return arr;
    const pivot = arr[Math.floor(arr.length / 2)];
    const leftArr = arr.filter(item => item < pivot);
    const rightArr = arr.filter(item => item > pivot);
    return [...quickSort(leftArr), pivot, ...quickSort(rightArr)];
};

// The dice values dealt in each mode. The 6-dice mode deliberately skips 4.
const DICE_SETS = {
    9: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    6: [1, 2, 3, 5, 6, 7],
};

// Opponent name and per-die sorting delay for each difficulty.
const OPPONENTS = {
    easy: { name: 'BLAKE', dieDelayMs: 1500 },
    medium: { name: 'STAR', dieDelayMs: 800 },
    hard: { name: 'LOGAN', dieDelayMs: 400 },
};

const DEFAULT_DIFFICULTY = 'medium';
const DEFAULT_DICE_COUNT = 9;

const initialContent = document.getElementById('initial-content');
const gameContent = document.getElementById('game-content');
const playerDice = document.getElementById('dice-container1');
const opponentDice = document.getElementById('dice-container2');
const opponentHeading = document.getElementById('computer-sorting-text');
const startButton = document.getElementById('start-button');
const submitButton = document.getElementById('submit-button');
const instructionsButton = document.getElementById('instructions-button');
const toggleDiceButton = document.getElementById('toggle-dice-button');

// Chosen on the instructions screen and kept across rounds, so it is deliberately
// not part of the per-round state below.
let selectedDifficulty = DEFAULT_DIFFICULTY;

// Everything owned by the round currently on screen.
const round = {
    id: 0,                       // bumped on every teardown; invalidates stale callbacks
    status: 'idle',              // 'idle' | 'playing' | 'over'
    diceCount: DEFAULT_DICE_COUNT,
    opponent: DEFAULT_DIFFICULTY, // locked in when the round starts
    correctOrder: [],
    outcome: null,               // 'player' | 'opponent' once the round is decided
    sortable: null,
    timeoutIds: new Set(),
    intervalId: null,
};

// --- async work owned by the round ------------------------------------------

function scheduleRoundTimeout(callback, delayMs) {
    const roundId = round.id;
    const timeoutId = setTimeout(() => {
        round.timeoutIds.delete(timeoutId);
        if (round.id !== roundId) return;
        callback();
    }, delayMs);
    round.timeoutIds.add(timeoutId);
}

function startRoundInterval(callback, delayMs) {
    const roundId = round.id;
    round.intervalId = setInterval(() => {
        if (round.id !== roundId) return;
        callback();
    }, delayMs);
}

function stopRoundTimers() {
    round.timeoutIds.forEach(clearTimeout);
    round.timeoutIds.clear();
    if (round.intervalId !== null) {
        clearInterval(round.intervalId);
        round.intervalId = null;
    }
}

// --- SortableJS instance owned by the round ---------------------------------

function createSortable() {
    if (typeof Sortable === 'undefined') {
        console.error('SortableJS did not load; the dice cannot be dragged.');
        return null;
    }
    return Sortable.create(playerDice, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        touchStartThreshold: 4, // For better touch performance on mobile
    });
}

function destroySortable() {
    if (round.sortable) {
        round.sortable.destroy();
        round.sortable = null;
    }
}

// --- rendering --------------------------------------------------------------

function createDie(number, id) {
    const die = document.createElement('div');
    die.className = 'die initial-load';
    die.dataset.number = number;
    die.style.backgroundImage = `url('src/assets/images/dice-${number}.png')`;
    die.id = id;
    die.setAttribute('aria-label', `Dice showing ${number}`);
    // Drop the entrance-animation class when the animation itself ends, so the
    // cleanup cannot outlive the die or bleed into a later round.
    die.addEventListener('animationend', () => die.classList.remove('initial-load'), { once: true });
    return die;
}

function renderDice(container, numbers) {
    container.innerHTML = '';
    numbers.forEach(number => {
        container.appendChild(createDie(number, `${container.id}-die-${number}`));
    });
}

// --- round lifecycle --------------------------------------------------------

// The single cancellation path: no timer, Sortable instance or die from the
// outgoing round survives this call.
function teardownRound() {
    round.id += 1;
    round.status = 'idle';
    round.outcome = null;
    stopRoundTimers();
    destroySortable();
    playerDice.innerHTML = '';
    opponentDice.innerHTML = '';
}

// The single start path: replaces whatever round was running.
function startRound(diceCount) {
    teardownRound();

    round.status = 'playing';
    round.diceCount = diceCount;
    round.opponent = selectedDifficulty;

    const numbers = DICE_SETS[diceCount];
    round.correctOrder = quickSort([...numbers]);
    const shuffledNumbers = shuffle([...numbers]);

    renderDice(playerDice, shuffledNumbers);
    renderDice(opponentDice, shuffledNumbers);
    round.sortable = createSortable();

    opponentHeading.textContent = `${OPPONENTS[round.opponent].name} SORTING...`;
    toggleDiceButton.textContent = `${diceCount === 9 ? 6 : 9} DICE VERSION`;

    // Let the dice finish dropping in before the opponent starts sorting.
    scheduleRoundTimeout(startOpponentSort, shuffledNumbers.length * 100 + 500);
}

function finishRound(outcome) {
    // Stop the opponent before the blocking alert, so no further dice move while
    // the result is on screen.
    stopRoundTimers();
    round.status = 'over';
    round.outcome = outcome;
    alert(outcome === 'player' ? 'You win!' : 'Ohh Too Slow! Try Again');
}

// Moves the opponent's dice into sorted order, one die per tick.
function startOpponentSort() {
    const sortedNumbers = round.correctOrder;
    let index = 0;

    startRoundInterval(() => {
        if (index >= sortedNumbers.length) {
            finishRound('opponent');
            return;
        }
        const die = opponentDice.querySelector(`.die[data-number='${sortedNumbers[index]}']`);
        if (die) opponentDice.appendChild(die);
        index += 1;
    }, OPPONENTS[round.opponent].dieDelayMs);
}

// --- player actions ---------------------------------------------------------

// Generate random order of numbers
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function isPlayerOrderCorrect() {
    const playerOrder = Array.from(playerDice.querySelectorAll('.die'))
        .map(die => parseInt(die.dataset.number, 10));
    return playerOrder.join(',') === round.correctOrder.join(',');
}

function submitPlayerOrder() {
    if (round.status !== 'playing') return;

    if (!isPlayerOrderCorrect()) {
        alert('Try again!');
        return;
    }
    finishRound('player');
}

// --- screens ----------------------------------------------------------------

function startGame() {
    initialContent.style.display = 'none';
    gameContent.style.display = 'flex';
    startRound(DEFAULT_DICE_COUNT);
}

function showInstructions() {
    teardownRound();
    initialContent.style.display = 'flex';
    gameContent.style.display = 'none';
}

function updateDifficultySelection() {
    document.querySelectorAll('.difficulty-button').forEach(button => {
        button.classList.toggle('selected', button.dataset.speed === selectedDifficulty);
    });
}

// --- wiring -----------------------------------------------------------------

startButton.addEventListener('click', startGame);
instructionsButton.addEventListener('click', showInstructions);
submitButton.addEventListener('click', submitPlayerOrder);

toggleDiceButton.addEventListener('click', () => {
    startRound(round.diceCount === 9 ? 6 : 9);
});

document.querySelectorAll('.difficulty-button').forEach(button => {
    button.addEventListener('click', () => {
        selectedDifficulty = button.dataset.speed;
        updateDifficultySelection();
    });
});

// Show the default opponent as selected so the UI matches the game state.
updateDifficultySelection();
