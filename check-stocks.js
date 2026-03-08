const fs = require('fs');
const stocks = JSON.parse(fs.readFileSync('stocks.json', 'utf8'));
console.log('Total:', stocks.length);
const missing = stocks.filter(x => !x.name || x.name === x.code);
console.log('Missing:', missing.length);
console.log('First 5:', JSON.stringify(stocks.slice(0, 5)));
