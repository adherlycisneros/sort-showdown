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
    die.style.backgroundImage = `url('assets/images/dice-${number}.png')`;
    die.id = id;
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
        });
    }
}

// Simulate drag-and-drop animation for the computer with different speeds
function simulateDragAndDrop(containerId, numbers, speed) {
    const diceContainer = document.getElementById(containerId);
    const sortedNumbers = quickSort([...numbers]);
    
    const speedMap = {
        easy: 1000,
        medium: 500,
        hard: 250
    };

    let index = 0;
    const interval = setInterval(() => {
        if (index >= sortedNumbers.length) {
            clearInterval(interval);
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

// Store the selected difficulty
let selectedSpeed = 'medium'; // Default speed

// Function to start the game
function startGame() {
    document.getElementById('initial-content').style.display = 'none';
    document.getElementById('game-content').style.display = 'block';

    // Initialize dice for user
    const numbers = [1, 5, 9, 3, 7, 2, 8, 6, 4];
    const shuffledNumbers = shuffle([...numbers]); // Create a shuffled copy of the numbers
    generateDice('dice-container1', shuffledNumbers); // Initialize unsorted dice for the user
    generateDice('dice-container2', shuffledNumbers); // Initialize unsorted dice for the computer

    // Simulate drag-and-drop sorting for the computer with selected speed
    setTimeout(() => {
        simulateDragAndDrop('dice-container2', shuffledNumbers, selectedSpeed);
    }, shuffledNumbers.length * 100 + 500); // Adjust timing to match the end of the animation

    // Add event listener for the submit button
    document.getElementById('submit-button').addEventListener('click', () => {
        if (checkSorted('dice-container1', quickSort([...numbers]))) {
            alert('You sorted the dice correctly!');
        } else {
            alert('Try again!');
        }
    });

    // Update toggle button text and event listener
    const toggleButton = document.getElementById('toggle-dice-button');
    toggleButton.textContent = '6 Dice Version';
    toggleButton.onclick = () => {
        const isNineDiceVersion = toggleButton.textContent === '9 Dice Version';
        toggleButton.textContent = isNineDiceVersion ? '6 Dice Version' : '9 Dice Version';
        loadGameContent(isNineDiceVersion ? '9' : '6');
    };
}

// Switch from game content to initial content
function showInstructions() {
    document.getElementById('initial-content').style.display = 'block';
    document.getElementById('game-content').style.display = 'none';
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

// Animate the initial loading of the dice
function animateLoading(containerId) {
    const diceContainer = document.getElementById(containerId);
    const diceElements = Array.from(diceContainer.children);
    diceElements.forEach((die, index) => {
        die.style.opacity = 0;
        die.style.transform = 'translateY(-200px) rotate(0deg) scale(0.5)';
        setTimeout(() => {
            die.style.transition = 'transform 0.5s, opacity 0.5s';
            die.style.transform = 'translateY(0) rotate(360deg) scale(1)';
            die.style.opacity = 1;
        }, index * 100);
    });
}

// Load game content with specified number of dice
function loadGameContent(diceCount) {
    document.getElementById('initial-content').style.display = 'none';
    document.getElementById('game-content').style.display = 'block';

    const numbers = diceCount === '9' ? [1, 5, 9, 3, 7, 2, 8, 6, 4] : [1, 5, 3, 7, 2, 6];
    const shuffledNumbers = shuffle([...numbers]); // Create a shuffled copy of the numbers

    generateDice('dice-container1', shuffledNumbers); // Initialize unsorted dice for the user
    generateDice('dice-container2', shuffledNumbers); // Initialize unsorted dice for the computer
    animateLoading('dice-container1');
    animateLoading('dice-container2');

    // Simulate drag-and-drop sorting for the computer with selected speed
    setTimeout(() => {
        simulateDragAndDrop('dice-container2', shuffledNumbers, selectedSpeed);
    }, shuffledNumbers.length * 100 + 500); // Adjust timing to match the end of the animation

    // Add event listener for the submit button
    document.getElementById('submit-button').addEventListener('click', () => {
        if (checkSorted('dice-container1', quickSort([...numbers]))) {
            alert('You sorted the dice correctly!');
        } else {
            alert('Try again!');
        }
    });
}
