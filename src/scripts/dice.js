// script.js

/* function quickSort(array) {
    if (array.length <= 1) {
        return array;
    }


const pivot = array.at(-1);
const leftArr = [];
const rightArr = [];

//for (let i = 0; i < array.length - 1; i++) {
  //  if (array[i] < pivot) {
   //     leftArr.push(array[i]); 
  //  }
 //   else {
 //       rightArr.push(array[i]);
 //   }
//}
//return [...quickSort(leftArr), pivot, ...quickSort(rightArr)];

for (const el of array.slice(0, array.length - 1)) {
    el < pivot ? leftArr.push(el) : rightArr.push(el);
}
return [...quickSort(leftArr), pivot, ...quickSort(rightArr)];
}
const arr = [6, 7, 1, 11, 111, 13, 14, 15, 11, 9];
console.log(quickSort(arr));
console.log(arr);
*/ 

// Function to create a die element
function createDie(number) {
    const die = document.createElement('div');
    die.className = 'die';
    die.dataset.number = number;
    die.textContent = number;
    return die;
}

// Generate and display dice
const diceContainer = document.getElementById('dice-container');
const numbers = [1, 5, 9, 3, 7, 2, 8, 6, 4];
numbers.forEach(number => {
    const die = createDie(number);
    diceContainer.appendChild(die);
});

// Quicksort algorithm
const quickSort = (arr) => {
    if (arr.length <= 1) return arr;
    const pivot = arr[Math.floor(arr.length / 2)];
    const leftArr = arr.filter(item => item < pivot);
    const rightArr = arr.filter(item => item > pivot);
    return [...quickSort(leftArr), pivot, ...quickSort(rightArr)];
}

// Event listener for sorting
document.getElementById('sort-button').addEventListener('click', () => {
    const diceElements = Array.from(document.querySelectorAll('.die'));
    const diceNumbers = diceElements.map(die => parseInt(die.dataset.number));
    const sortedNumbers = quickSort(diceNumbers);

    diceContainer.innerHTML = '';
    sortedNumbers.forEach(number => {
        const sortedDie = createDie(number);
        diceContainer.appendChild(sortedDie);
    });
});