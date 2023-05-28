const express = require('express');
const fs = require('fs');
const app = express();

// Load the facts from the JSON file
const facts = JSON.parse(fs.readFileSync('facts.json'));

// API endpoint
app.get('/api/facts', (req, res) => {
  const { quant, tag } = req.query;

  // Filter facts based on the specified tag(s)
  let filteredFacts = facts;
  if (tag) {
    const tags = tag.split(',');
    filteredFacts = filteredFacts.filter(fact => {
      return tags.every(tag => fact.tags.includes(tag));
    });
  }

  // Return quant number of random facts
  if (quant) {
    const numFacts = parseInt(quant);
    const randomFacts = getRandomElements(filteredFacts, numFacts);
    res.json(randomFacts);
  } else {
    res.json(filteredFacts);
  }
});

// Function to get random elements from an array using Fisher-Yates shuffle
function getRandomElements(array, numElements) {
  const shuffled = array.slice();
  let currentIndex = shuffled.length;
  let temporaryValue, randomIndex;

  while (0 !== currentIndex) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    temporaryValue = shuffled[currentIndex];
    shuffled[currentIndex] = shuffled[randomIndex];
    shuffled[randomIndex] = temporaryValue;
  }

  return shuffled.slice(0, numElements);
}

// Start the server
app.listen(3000, () => {
  console.log('API server is running on port 3000');
});
