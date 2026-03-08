const fs = require('fs');
const zlib = require('zlib');

const chunks = JSON.parse(fs.readFileSync('data-compressed.json', 'utf8'));
const decompressed = zlib.gunzipSync(Buffer.from(chunks[1].data, 'base64')).toString('utf8');
const stocks = JSON.parse(decompressed);
console.log('sh600000 klines[0]:', JSON.stringify(stocks.sh600000.k[0]));
