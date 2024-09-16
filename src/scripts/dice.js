// Original quicksort algorithm
const quickSort = (arr) => {
    if (arr.length <= 1) return arr;
    const pivot = arr[Math.floor(arr.length / 2)];
    const leftArr = arr.filter(item => item < pivot);
    const rightArr = arr.filter(item => item > pivot);
    return [...quickSort(leftArr), pivot, ...quickSort(rightArr)];
};

// Function to create a die element
function createDie(number, id) {
    const die = document.createElement('div');
    die.className = 'die initial-load';
    die.dataset.number = number;
    die.style.backgroundImage = `url('src/assets/images/dice-${number}.png')`;
    die.id = id;
    die.setAttribute('aria-label', `Dice showing ${number}`);
    return die;
}

// Generate and display dice for a given container
function generateDice(containerId, numbers) {
    const diceContainer = document.getElementById(containerId);
    diceContainer.innerHTML = ''; // Clear any existing dice
    numbers.forEach(number => {
        const die = createDie(number, `${containerId}-die-${number}`);
        diceContainer.appendChild(die);
    });

    // Remove initial load class after animation
    setTimeout(() => {
        const diceElements = diceContainer.querySelectorAll('.die');
        diceElements.forEach(die => die.classList.remove('initial-load'));
    }, 1000);

    // Make the dice container sortable if it's the user's container
    if (containerId === 'dice-container1') {
        Sortable.create(diceContainer, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            touchStartThreshold: 4,
        });
    }
}

// Simulate drag-and-drop animation for the computer with different speeds
let currentInterval;

function simulateDragAndDrop(containerId, numbers, speed) {
    const diceContainer = document.getElementById(containerId);
    const sortedNumbers = quickSort([...numbers]);

    const speedMap = {
        easy: 1500,
        medium: 800,
        hard: 400
    };

    let index = 0;
    currentInterval = setInterval(() => {
        if (index >= sortedNumbers.length) {
            clearInterval(currentInterval);
            computerFinishedSorting = true;

            // Show the "Ohh Too Slow!" message if the user hasn't submitted yet and the game isn't over
            if (!userSubmitted && !gameOver) {
                alert("Ohh Too Slow! Try Again");
                gameOver = true; // Mark the game as over
            }
            return;
        }

        const number = sortedNumbers[index];
        const die = document.querySelector(`#${containerId} .die[data-number='${number}']`);

        // Move die to the new position
        diceContainer.appendChild(die);

        index++;
    }, speedMap[speed]); // Adjust the timing based on difficulty level
}

// Check if the dice are sorted correctly
function checkSorted(containerId, correctOrder) {
    const diceElements = Array.from(document.querySelectorAll(`#${containerId} .die`));
    const userOrder = diceElements.map(die => parseInt(die.dataset.number));
    return JSON.stringify(userOrder) === JSON.stringify(correctOrder);
}

// Generate random order of numbers
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Store the selected difficulty and name map
let selectedSpeed = 'medium'; // Default speed
const nameMap = {
    easy: 'BLAKE',
    medium: 'STAR',
    hard: 'LOGAN'
};

let computerFinishedSorting = false;
let userSubmitted = false;
let gameOver = false;
let currentNumbers = []; // To keep track of current numbers based on dice count

// Function to initialize the game with specified dice count
function initializeGame(diceCount) {
    // Reset flags
    computerFinishedSorting = false;
    userSubmitted = false;
    gameOver = false;

    currentNumbers = diceCount === 9 ? [1, 5, 9, 3, 7, 2, 8, 6, 4] : [1, 5, 3, 7, 2, 6];
    const shuffledNumbers = shuffle([...currentNumbers]); // Create a shuffled copy of the numbers

    generateDice('dice-container1', shuffledNumbers); // Initialize unsorted dice for the user
    generateDice('dice-container2', shuffledNumbers); // Initialize unsorted dice for the computer

    // Make the dice container sortable if it's the user's container
    if (containerId === 'dice-container1') {
        Sortable.create(diceContainer, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            touchStartThreshold: 4,
        });
    }
    
    // Set the computer sorting text based on the selected difficulty
    document.getElementById('computer-sorting-text').textContent = `${nameMap[selectedSpeed]} SORTING...`;

    // Simulate drag-and-drop sorting for the computer with selected speed
    setTimeout(() => {
        simulateDragAndDrop('dice-container2', shuffledNumbers, selectedSpeed);
    }, shuffledNumbers.length * 100 + 500); // Adjust timing to match the end of the animation
}

// Function to start the game
function startGame() {
    clearPreviousGame(); //Reset game 
    document.getElementById('initial-content').style.display = 'none';
    document.getElementById('game-content').style.display = 'flex';

    initializeGame(9); // Start with 9 dice by default
}

// Switch from game content to initial content
function showInstructions() {
    clearPreviousGame(); //Reset game
    document.getElementById('initial-content').style.display = 'flex';
    document.getElementById('game-content').style.display = 'none';
}

//Function to Clear Previous Game
function clearPreviousGame() {
    gameOver = true;
    computerFinishedSorting = true;
    userSubmitted = false;
    clearInterval(currentInterval);
}

// Add event listener to the start button
document.getElementById('start-button').addEventListener('click', startGame);

// Add event listener to the instructions button
document.getElementById('instructions-button').addEventListener('click', showInstructions);

// Add event listener to the difficulty buttons
document.querySelectorAll('.difficulty-button').forEach(button => {
    button.addEventListener('click', () => {
        selectedSpeed = button.dataset.speed;
        document.querySelectorAll('.difficulty-button').forEach(btn => btn.classList.remove('selected'));
        button.classList.add('selected');
    });
});

// Add event listener for the submit button (attach only once)
document.getElementById('submit-button').addEventListener('click', () => {
    if (gameOver) return; // Prevent further actions if the game is over

    userSubmitted = true; // Mark that the user has submitted
    if (checkSorted('dice-container1', quickSort([...currentNumbers]))) {
        if (!computerFinishedSorting) {
            alert('You win!');
            gameOver = true; // Mark the game as over
        } else {
            alert('Ohh Too Slow! Try Again');
        }
    } else {
        alert('Try again!');
        userSubmitted = false; // Reset to allow "Ohh Too Slow!" to trigger later
    }
});

// Add event listener for the toggle dice version button
document.getElementById('toggle-dice-button').addEventListener('click', function () {
    clearPreviousGame();
    const isNineDiceVersion = this.textContent.includes('9');
    this.textContent = isNineDiceVersion ? '6 Dice Version' : '9 Dice Version';
    initializeGame(isNineDiceVersion ? 9 : 6);

    
});
