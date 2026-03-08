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

    if (!response.data || !response.data[code]) {
      console.log(code + ': no response.data');
      return { code, name: '', klines: [] };
    }

    const stockData = response.data[code];
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
      console.log(code + ': qfqday ' + klines.length);
    } else if (stockData.day && stockData.day.length > 0) {
      klines = stockData.day.map(k => ({
        date: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]),
        low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5])
      }));
      console.log(code + ': day ' + klines.length);
    } else {
      console.log(code + ': no klines');
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
    console.log(code + ': error - ' + e.message);
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

  console.log('Total stocks: ' + stockCodes.length);

  // Test first 10
  console.log('Testing first 10:');
  for (const code of stockCodes.slice(0, 10)) {
    const result = await getStockData(code);
    console.log('Result for ' + code + ': name=' + result.name + ', klines=' + result.klines.length);
  }
}

main();
