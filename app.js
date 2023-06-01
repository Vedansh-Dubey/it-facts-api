const express = require('express');
const fs = require('fs');
const app = express();

// Add the required Firebase SDKs
const admin = require('firebase-admin');
const serviceAccount = require('./it-facts-firebase-adminsdk-sdoed-1fce83251a.json'); // Replace with the path to your service account key JSON file
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://it-facts-default-rtdb.asia-southeast1.firebasedatabase.app'
});

// Load the facts from the JSON file
const facts = JSON.parse(fs.readFileSync('facts.json'));

// Middleware for input validation
function validateInput(req, res, next) {
  const { quant, tag } = req.query;

  // Check if quant parameter is provided and valid
  if (!quant || !/^\d+$/.test(quant)) {
    return res.status(400).json({ error: 'The "quant" parameter must be a positive integer.' });
  }

  // Check if tag parameter is provided and valid
  if (tag && !/^[a-zA-Z0-9,-]+$/.test(tag)) {
    return res.status(400).json({ error: 'Invalid characters in the "tag" parameter.' });
  }

  next();
}

// Middleware for rate limiting
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: 'Rate limit exceeded. Please try again later.' }
});
app.use(limiter);

// API endpoint
app.get('/api/facts', authenticateAPIKey, verifyQuota, validateInput, (req, res) => {
  const { quant, tag } = req.query;

  try {
    // Parse quant parameter
    const numFacts = parseInt(quant);

    // Filter facts based on the specified tag(s)
    let filteredFacts = facts;

    if (tag) {
      const tags = tag.split(',');

      // Check if the given tag is present in the facts data
      const isValidTag = tags.every(tag => {
        return facts.some(fact => fact.tags.includes(tag));
      });

      if (!isValidTag) {
        throw new Error('Invalid tag provided.');
      }

      filteredFacts = filteredFacts.filter(fact => {
        return tags.every(tag => fact.tags.includes(tag));
      });
    }

    // Return quant number of random facts
    const randomFacts = getRandomElements(filteredFacts, numFacts);
    res.json(randomFacts);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Middleware to authenticate the API key and verify quota from the database
function authenticateAPIKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  // Get the user ID based on the API key from the Firebase Realtime Database
  const userRef = admin.database().ref('Users');
  userRef.once('value', snapshot => {
    const users = snapshot.val();
    const userId = Object.keys(users).find(key => users[key].APIKeys[apiKey]);

    if (userId) {
      req.userId = userId;

      // Increment the usage field of the matched API key
      const apiKeyRef = userRef.child(`${userId}/APIKeys/${apiKey}/usage`);
      apiKeyRef.transaction(usage => (usage || 0) + 1);

      req.userRef = userRef.child(userId);
      next();
    } else {
      res.status(401).json({ error: 'Invalid API key' });
    }
  });
}

// Middleware to verify the quota
function verifyQuota(req, res, next) {
  const userRef = req.userRef;

  const userQuotaRef = userRef.child('fixedQuota');
  const usedQuotaRef = userRef.child('usedQuota');

  Promise.all([userQuotaRef.once('value'), usedQuotaRef.once('value')])
    .then(([quotaSnapshot, usedQuotaSnapshot]) => {
      const quota = quotaSnapshot.val() || 0;
      const usedQuota = usedQuotaSnapshot.val() || 0;

      if (usedQuota < quota) {
        // Increment the usedQuota for the corresponding user
        usedQuotaRef.transaction(usedQuota => (usedQuota || 0) + 1);

        next();
      } else {
        res.status(403).json({ error: 'Quota exceeded' });
      }
    })
    .catch(error => {
      res.status(500).json({ error: 'Failed to verify quota' });
    });
}

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
