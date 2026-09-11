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
//
// Input model
// -----------
// The player's dice can be reordered by pointer or touch (SortableJS) or by
// keyboard (focus a die, then Left/Right to move it, Home/End to send it to
// either end). DOM order is the game order for both, so validation never has to
// know which input was used.
//
// A die is a <li class="die-slot"> holding the game's data-number, wrapping the
// element that IS the die face. For the player that face is a real <button>; for
// the opponent it is an inert <span>. The face carries the artwork and its own
// layout box, and its name is real (visually hidden) text rather than an ARIA
// label, so the control the user touches is the control the browser exposes.
//
// That matters on iOS: VoiceOver builds its swipe order by hit-testing what is
// actually painted at a point on screen. A transparent control layered over a
// parent that owns the artwork, with no content of its own, is exactly the shape
// that gets passed over. Giving the button the artwork and real content removes
// both of those risks. SortableJS still drags the <li>, the container's direct
// child, so pointer and touch behaviour are untouched.
//
// A button is a "basic interaction" control, so NVDA and JAWS do not leave browse
// mode for it, and in browse mode they keep the plain arrow keys for their own
// cursor; iOS VoiceOver has no arrow keys at all. What every one of them does pass
// through is an activation. So a die can also be picked up by activating it and
// placed by activating another, which needs no role="application", no modifier
// chord and no drag-and-drop ARIA. Real pointer input is excluded from that path
// (a genuine click reports detail >= 1), so mouse and touch dragging are untouched.

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

// Opponent identity and per-die sorting delay for each difficulty. Difficulty
// changes speed and nothing else.
const OPPONENTS = {
    easy: { name: 'BLAKE', level: 'EASY', dieDelayMs: 2400, portrait: 'src/assets/images/difficulty_easy.png' },
    medium: { name: 'STAR', level: 'MEDIUM', dieDelayMs: 1450, portrait: 'src/assets/images/difficulty_medium.png' },
    hard: { name: 'LOGAN', level: 'HARD', dieDelayMs: 900, portrait: 'src/assets/images/difficulty_hard.png' },
};

// A flat pause before the opponent's first die, independent of dice count, so
// the ladder is the per-die delay and nothing else. It also covers the dice
// entrance animation.
const OPPONENT_START_DELAY_MS = 1200;

const DEFAULT_DIFFICULTY = 'medium';
const DEFAULT_DICE_COUNT = 9;

const RESULT_MESSAGES = {
    player: 'YOU WIN!',
    opponent: 'OHH TOO SLOW! TRY AGAIN!',
};

const initialContent = document.getElementById('initial-content');
const gameContent = document.getElementById('game-content');
const instructionsTitle = document.getElementById('instructions-title');
const playerHeading = document.getElementById('player-heading');
const playerDice = document.getElementById('dice-container1');
const opponentDice = document.getElementById('dice-container2');
const opponentProgress = document.getElementById('opponent-progress');
const opponentProgressText = document.getElementById('opponent-progress-text');
const matchPortrait = document.getElementById('match-portrait');
const matchName = document.getElementById('match-name');
const matchLevel = document.getElementById('match-level');
const submitFeedback = document.getElementById('submit-feedback');
const gameStatus = document.getElementById('game-status');
const roundResult = document.getElementById('round-result');
const roundResultTitle = document.getElementById('round-result-title');
const roundResultDetail = document.getElementById('round-result-detail');
const startButton = document.getElementById('start-button');
const submitButton = document.getElementById('submit-button');
const instructionsButton = document.getElementById('instructions-button');
const toggleDiceButton = document.getElementById('toggle-dice-button');
const playAgainButton = document.getElementById('play-again-button');
const changeOpponentButton = document.getElementById('change-opponent-button');
const backgroundVideo = document.getElementById('video');

// Live: the player can change the system setting without reloading.
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// Reduced motion should cost the backdrop its movement, not its existence, so
// the video is held on a frame rather than hidden. Hiding it left the intro as
// a flat rectangle of page colour.
//
// This is not the Low Power Mode fallback: nothing here detects or reacts to
// autoplay being refused, which stays Stage 4 work. A rejected play() is
// swallowed so it cannot surface as an unhandled rejection.
function applyMotionPreferenceToBackground() {
    if (!backgroundVideo) return;
    if (prefersReducedMotion.matches) {
        backgroundVideo.pause();
    } else {
        const started = backgroundVideo.play();
        if (started) started.catch(() => {});
    }
}

if (backgroundVideo) {
    // Pausing before a frame is decoded would leave nothing painted, so wait
    // for one if it has not arrived yet.
    if (backgroundVideo.readyState >= 2) applyMotionPreferenceToBackground();
    backgroundVideo.addEventListener('loadeddata', applyMotionPreferenceToBackground);
    prefersReducedMotion.addEventListener('change', applyMotionPreferenceToBackground);
}

// Every die element the game itself created. SortableJS clones the dragged die
// while a touch drag is in flight, and that clone carries the same class and
// data attributes, so identity is the only reliable way to tell a real playable
// die from a drag helper.
const playableDice = new WeakSet();

// Everything owned by the round currently on screen.
const round = {
    id: 0,                       // bumped on every teardown; invalidates stale callbacks
    status: 'idle',              // 'idle' | 'playing' | 'over'
    diceCount: DEFAULT_DICE_COUNT,
    opponent: DEFAULT_DIFFICULTY, // locked in when the round starts
    correctOrder: [],
    outcome: null,               // 'player' | 'opponent' once the round is decided
    opponentTickAt: 0,           // performance.now() of the opponent's last placement
    grabbedDie: null,            // die picked up via activation, awaiting a place
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
        console.error('SortableJS did not load; the dice can still be reordered with the arrow keys.');
        return null;
    }
    // Sortable detaches and re-inserts the dragged element, which drops focus to
    // <body>. Remember whether the player was on a die so focus can be put back
    // rather than resetting the tab sequence to the top of the document.
    let hadFocus = false;

    return Sortable.create(playerDice, {
        animation: 150,
        // All three are named explicitly, defaults included, because the
        // stylesheet dresses each one: the slot the die will land in, the die
        // the pointer has grabbed, and the clone that follows a finger.
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        touchStartThreshold: 4, // For better touch performance on mobile
        onStart: () => {
            hadFocus = playerDice.contains(document.activeElement);
        },
        onEnd: (event) => {
            // A drag changes the order, so the position in each die's name is stale
            // and any "TRY AGAIN!" from a previous submission no longer applies.
            refreshPlayerDiceLabels();
            clearSubmitFeedback();
            if (hadFocus) {
                const control = dieControl(event.item);
                if (control) control.focus();
            }
            hadFocus = false;
        },
    });
}

function destroySortable() {
    if (round.sortable) {
        round.sortable.destroy();
        round.sortable = null;
    }
}

// --- rendering --------------------------------------------------------------

function createDie(number, id, interactive) {
    const slot = document.createElement('li');
    slot.className = 'die-slot';
    slot.dataset.number = number;
    slot.id = id;

    // The face is the die: it holds the artwork and, when playable, it is the
    // native control the player operates.
    const face = document.createElement(interactive ? 'button' : 'span');
    face.className = 'die';
    // Inline, so the relative path resolves against the document. (A custom
    // property would not: a relative url() inside one is resolved against the
    // stylesheet that consumes it.)
    face.style.backgroundImage = `url('src/assets/images/dice-${number}.png')`;

    // A real text node, not an ARIA label, so the element has content of its own.
    const name = document.createElement('span');
    name.className = 'die-name visually-hidden';
    name.textContent = `Die showing ${number}`;
    face.appendChild(name);

    if (interactive) {
        face.type = 'button';
        // Points at the on-screen hint, so the key bindings are discoverable
        // without sight of it.
        face.setAttribute('aria-describedby', 'dice-hint');
        // A die is either picked up or not, which is exactly what a toggle button
        // expresses, so the announced role matches what activation really does.
        face.setAttribute('aria-pressed', 'false');
    }

    slot.appendChild(face);
    const die = slot;

    // The entrance animation is decoration, so it is simply never started when
    // the player has asked for reduced motion. The class is dropped when the
    // animation itself ends, so the cleanup cannot outlive the die or bleed
    // into a later round.
    if (!prefersReducedMotion.matches) {
        face.classList.add('initial-load');
        face.addEventListener('animationend', () => face.classList.remove('initial-load'), { once: true });
    }
    playableDice.add(die);
    return die;
}

// The die face: a <button> for the player, an inert <span> for the opponent.
function dieFace(die) {
    return die.querySelector('.die');
}

// The focusable control inside a playable die, or null for an opponent die.
function dieControl(die) {
    return die.querySelector('button.die');
}

function dieNameNode(die) {
    return die.querySelector('.die-name');
}

function renderDice(container, numbers, interactive) {
    container.innerHTML = '';
    numbers.forEach(number => {
        container.appendChild(createDie(number, `${container.id}-die-${number}`, interactive));
    });
}

// The player's dice in board order, with any SortableJS drag helper excluded.
function playerDiceInOrder() {
    return Array.from(playerDice.children).filter(child => playableDice.has(child));
}

// Names carry the position so a screen-reader user can hear where a die sits and
// confirm that a move landed.
function refreshPlayerDiceLabels() {
    const dice = playerDiceInOrder();
    dice.forEach((die, index) => {
        const name = dieNameNode(die);
        if (name) {
            name.textContent = `Die showing ${die.dataset.number}, position ${index + 1} of ${dice.length}`;
        }
    });
}

// --- feedback ---------------------------------------------------------------

// Replacing the child rather than the text guarantees the live region fires even
// when the same message is shown twice in a row.
function showSubmitFeedback(message) {
    const line = document.createElement('span');
    line.textContent = message;
    submitFeedback.replaceChildren(line);
}

function clearSubmitFeedback() {
    submitFeedback.replaceChildren();
}

// Visible progress only: <progress> is not a live region and the text sits in
// plain markup, so the opponent placing a die never interrupts a screen reader.
// The element's own value is the count, so there is no second tally to keep.
function setOpponentProgress(placed) {
    opponentProgress.value = placed;
    opponentProgressText.textContent = `SORTING ${placed} / ${opponentProgress.max}`;
}

function announce(message) {
    const line = document.createElement('span');
    line.textContent = message;
    gameStatus.replaceChildren(line);
}

// How much the opponent had left to do, derived from where it actually got to:
// the dice it has still to place, less however much of the current interval has
// already gone. No extra timer and no schedule to keep in sync — the count on
// screen is the same number this reads.
//
// If the next placement is already overdue the interval is not running to time
// (a hidden page has its timers throttled, or suspended outright, while
// performance.now() keeps going), so none of the current interval is counted.
// That keeps the margin honest instead of quietly shrinking towards zero.
function raceMargin(outcome) {
    const opponentName = OPPONENTS[round.opponent].name;
    if (outcome === 'opponent') return `${opponentName} finished first.`;

    const dieDelayMs = OPPONENTS[round.opponent].dieDelayMs;
    const diceLeft = opponentProgress.max - opponentProgress.value;
    const sinceLastPlacement = performance.now() - round.opponentTickAt;
    const intervalSoFar = sinceLastPlacement < dieDelayMs ? sinceLastPlacement : 0;
    const secondsToSpare = (diceLeft * dieDelayMs - intervalSoFar) / 1000;

    if (secondsToSpare < 0.1) return `A photo finish against ${opponentName}.`;
    return `You beat ${opponentName} by ${secondsToSpare.toFixed(1)}s.`;
}

function showRoundResult(outcome) {
    roundResultTitle.textContent = RESULT_MESSAGES[outcome];
    roundResultDetail.textContent = raceMargin(outcome);
    gameContent.dataset.outcome = outcome;
    roundResult.hidden = false;
    roundResultTitle.focus();
}

function hideRoundResult() {
    roundResult.hidden = true;
    roundResultTitle.textContent = '';
    roundResultDetail.textContent = '';
    delete gameContent.dataset.outcome;
}

// --- round lifecycle --------------------------------------------------------

// Closes every way the player can still change or submit the board. Unlocking is
// not needed: the next round renders fresh dice and teardownRound re-enables DONE.
function lockBoard() {
    setGrabbedDie(null);
    if (round.sortable) round.sortable.option('disabled', true);
    // Disabling the native buttons takes them out of the tab order and tells
    // assistive technology the dice are no longer operable.
    playerDiceInOrder().forEach(die => {
        const control = dieControl(die);
        if (control) control.disabled = true;
    });
    submitButton.disabled = true;
}

// The single cancellation path: no timer, Sortable instance or die from the
// outgoing round survives this call.
function teardownRound() {
    round.id += 1;
    round.status = 'idle';
    round.outcome = null;
    round.opponentTickAt = 0;
    // The dice themselves are about to be discarded, so drop the reference rather
    // than reaching back into them.
    round.grabbedDie = null;
    stopRoundTimers();
    destroySortable();
    playerDice.innerHTML = '';
    opponentDice.innerHTML = '';
    hideRoundResult();
    clearSubmitFeedback();
    submitButton.disabled = false;
}

// The single start path: replaces whatever round was running.
function startRound(diceCount) {
    teardownRound();

    round.status = 'playing';
    round.diceCount = diceCount;
    round.opponent = selectedDifficulty();

    const opponent = OPPONENTS[round.opponent];
    const numbers = DICE_SETS[diceCount];
    round.correctOrder = quickSort([...numbers]);
    const shuffledNumbers = shuffle([...numbers]);

    renderDice(playerDice, shuffledNumbers, true);
    renderDice(opponentDice, shuffledNumbers, false);
    refreshPlayerDiceLabels();
    round.sortable = createSortable();

    matchPortrait.src = opponent.portrait;
    matchName.textContent = opponent.name;
    matchLevel.textContent = opponent.level;

    opponentProgress.max = diceCount;
    opponentProgress.value = 0;
    opponentProgressText.textContent = 'GET READY';

    // The visible label names the mode the button switches to; the accessible
    // name says so outright, so nobody has to guess which one it means.
    const otherCount = diceCount === 9 ? 6 : 9;
    toggleDiceButton.textContent = `${otherCount} DICE`;
    toggleDiceButton.setAttribute('aria-label', `Switch to ${otherCount} dice`);

    announce(`New round. ${diceCount} dice against ${opponent.name}.`);

    // Stand in for a placement at the moment the first one is due, so the margin
    // reads correctly during the opening pause too.
    round.opponentTickAt = performance.now() + OPPONENT_START_DELAY_MS;
    scheduleRoundTimeout(startOpponentSort, OPPONENT_START_DELAY_MS);
}

function finishRound(outcome) {
    // Stop the opponent first, so nothing keeps moving behind the result.
    stopRoundTimers();
    round.status = 'over';
    round.outcome = outcome;
    // However the round ended, the opponent's tally is now final rather than
    // still "sorting".
    opponentProgressText.textContent = `SORTED ${opponentProgress.value} / ${opponentProgress.max}`;
    lockBoard();
    clearSubmitFeedback();
    showRoundResult(outcome);
}

// Moves the opponent's dice into sorted order, one die per tick. The round ends
// on the tick that places the last die, so the board is never visibly finished
// for an interval before the result appears.
function startOpponentSort() {
    const sortedNumbers = round.correctOrder;
    let index = 0;

    setOpponentProgress(0);

    const dieDelayMs = OPPONENTS[round.opponent].dieDelayMs;

    startRoundInterval(() => {
        const die = opponentDice.querySelector(`.die-slot[data-number='${sortedNumbers[index]}']`);
        if (die) opponentDice.appendChild(die);
        index += 1;
        setOpponentProgress(index);
        round.opponentTickAt = performance.now();

        if (index >= sortedNumbers.length) finishRound('opponent');
    }, dieDelayMs);
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
    const playerOrder = playerDiceInOrder().map(die => parseInt(die.dataset.number, 10));
    return playerOrder.join(',') === round.correctOrder.join(',');
}

function submitPlayerOrder() {
    if (round.status !== 'playing') return;

    if (!isPlayerOrderCorrect()) {
        showSubmitFeedback('TRY AGAIN!');
        return;
    }
    finishRound('player');
}

// Keyboard reordering. Focus follows the die so a run of arrow presses keeps
// moving the same one.
function movePlayerDie(die, targetIndex) {
    const dice = playerDiceInOrder();
    const from = dice.indexOf(die);
    if (from === -1) return;

    const to = Math.max(0, Math.min(dice.length - 1, targetIndex));
    if (to === from) return;

    if (to > from) dice[to].after(die);
    else dice[to].before(die);

    refreshPlayerDiceLabels();
    clearSubmitFeedback();
    // Refocusing announces the die's updated name, which already states the new
    // position, so nothing is written to the status region here.
    const control = dieControl(die);
    if (control) control.focus();
}

function setGrabbedDie(die) {
    const previous = round.grabbedDie;
    if (previous) {
        const face = dieFace(previous);
        if (face) {
            face.classList.remove('is-grabbed');
            face.setAttribute('aria-pressed', 'false');
        }
    }

    round.grabbedDie = die || null;

    if (die) {
        const face = dieFace(die);
        if (face) {
            face.classList.add('is-grabbed');
            face.setAttribute('aria-pressed', 'true');
        }
    }
}

// Activating a die picks it up; activating another places it there. Placing moves
// focus to the die that travelled, whose name states its new position, so nothing
// extra is announced for the move itself.
function activateDie(die) {
    const grabbed = round.grabbedDie;

    if (!grabbed) {
        setGrabbedDie(die);
        announce(`Picked up die showing ${die.dataset.number}. Activate another die to place it there, or press Escape to cancel.`);
        return;
    }

    if (grabbed === die) {
        setGrabbedDie(null);
        announce(`Put down die showing ${die.dataset.number}.`);
        return;
    }

    const target = playerDiceInOrder().indexOf(die);
    setGrabbedDie(null);
    movePlayerDie(grabbed, target);
}

function handleDiceActivate(event) {
    if (round.status !== 'playing') return;
    // A real mouse or touch click reports detail >= 1; keyboard and assistive
    // technology activations report 0. Only the latter reach this path, so
    // dragging keeps working exactly as before.
    if (event.detail !== 0) return;

    const die = event.target.closest('.die-slot');
    if (!die || !playableDice.has(die)) return;

    event.preventDefault();
    activateDie(die);
}

function handleDiceKeydown(event) {
    if (round.status !== 'playing') return;

    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    const die = event.target.closest('.die-slot');
    if (!die || !playableDice.has(die)) return;

    if (event.key === 'Escape') {
        if (round.grabbedDie) {
            const cancelled = round.grabbedDie;
            setGrabbedDie(null);
            announce(`Cancelled. Die showing ${cancelled.dataset.number} stays where it was.`);
        }
        return;
    }

    const dice = playerDiceInOrder();
    const index = dice.indexOf(die);
    let target;

    switch (event.key) {
        case 'ArrowLeft': target = index - 1; break;
        case 'ArrowRight': target = index + 1; break;
        case 'Home': target = 0; break;
        case 'End': target = dice.length - 1; break;
        default: return;
    }

    event.preventDefault();
    movePlayerDie(die, target);
}

// --- screens ----------------------------------------------------------------

function selectedDifficulty() {
    const checked = document.querySelector('input[name="opponent"]:checked');
    return checked ? checked.value : DEFAULT_DIFFICULTY;
}

function checkedOpponentInput() {
    return document.querySelector('input[name="opponent"]:checked')
        || document.querySelector('input[name="opponent"]');
}

function startGame() {
    initialContent.hidden = true;
    gameContent.hidden = false;
    startRound(DEFAULT_DICE_COUNT);
    playerHeading.focus();
}

// `focusTarget` is where the player should land: the page heading when they
// asked to read the instructions, the opponent they picked when they asked to
// change it.
function showInstructions(focusTarget) {
    teardownRound();
    gameContent.hidden = true;
    initialContent.hidden = false;
    (focusTarget || instructionsTitle).focus();
}

// --- wiring -----------------------------------------------------------------

startButton.addEventListener('click', startGame);
submitButton.addEventListener('click', submitPlayerOrder);
playerDice.addEventListener('keydown', handleDiceKeydown);
playerDice.addEventListener('click', handleDiceActivate);

instructionsButton.addEventListener('click', () => showInstructions(instructionsTitle));
changeOpponentButton.addEventListener('click', () => showInstructions(checkedOpponentInput()));

playAgainButton.addEventListener('click', () => {
    // Same opponent, same dice count — just a fresh deal.
    startRound(round.diceCount);
    playerHeading.focus();
});

toggleDiceButton.addEventListener('click', () => {
    startRound(round.diceCount === 9 ? 6 : 9);
});
