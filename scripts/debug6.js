const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PROXY = 'http://127.0.0.1:7890';
const API_BASE = 'https://web.ifzq.gtimg.cn';

function fetchWithCurl(url) {
  return new Promise((resolve, reject) => {
    const cmd = 'curl -x "' + PROXY + '" -s -L "' + url + '"';
    exec(cmd, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

async function getStockData(code, days = 2500) {
  const url = API_BASE + '/appstock/app/fqkline/get?param=' + code + ',day,,,' + days + ',qfq';
  const raw = await fetchWithCurl(url);

  try {
    const response = JSON.parse(raw);
    console.log('Code: ' + code + ', response keys: ' + Object.keys(response));

    if (!response.data) {
      console.log('  No data');
      return { code, name: '', klines: [] };
    }
    console.log('  data keys: ' + Object.keys(response.data));

    if (!response.data[code]) {
      console.log('  No ' + code + ' in data');
      return { code, name: '', klines: [] };
    }

    const stockData = response.data[code];
    console.log('  Got stock data');

    let name = '';
    if (stockData.qt && stockData.qt[code]) {
      name = stockData.qt[code][1] || '';
    }

    let klines = [];
    if (stockData.qfqday && stockData.qfqday.length > 0) {
      klines = stockData.qfqday.map(k => ({
        date: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]),
        low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5])
      }));
    }

    if (klines.length > 0) {
      const latest = klines[klines.length - 1];
      return {
        code, name, klines,
        quote: { date: latest.date, open: latest.open, high: latest.high, low: latest.low, close: latest.close, volume: latest.volume }
      };
    }

    return { code, name, klines: [] };
  } catch (e) {
    console.log('Error: ' + e.message);
    return { code, name: '', klines: [] };
  }
}

async function main() {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && f !== 'stocks.json');
  const allCodes = files.map(f => f.replace('.json', ''));

  const stockCodes = allCodes.filter(c =>
    c.startsWith('sh600') || c.startsWith('sh688') ||
    c.startsWith('sz000') || c.startsWith('sz300')
  );

  console.log('Testing first 3:');
  for (const code of stockCodes.slice(0, 3)) {
    const result = await getStockData(code);
    console.log('Result: ' + code + ' = ' + result.name + ', ' + result.klines.length);
  }
}

main();
