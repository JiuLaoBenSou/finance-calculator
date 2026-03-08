/**
 * Stock data update script - only stocks, skip indices
 */

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
    } else if (stockData.day && stockData.day.length > 0) {
      klines = stockData.day.map(k => ({
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
    return { code, name: '', klines: [] };
  }
}

async function main() {
  console.log('Starting update...');

  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && f !== 'stocks.json');
  const allCodes = files.map(f => f.replace('.json', ''));

  // Only process actual stocks, skip indices
  const stockCodes = allCodes.filter(c =>
    c.startsWith('sh600') || c.startsWith('sh688') ||
    c.startsWith('sz000') || c.startsWith('sz300')
  );

  console.log('Total files: ' + allCodes.length);
  console.log('Stock files: ' + stockCodes.length);

  let success = 0;
  const stocksList = [];
  const CONCURRENCY = 30;

  for (let i = 0; i < stockCodes.length; i += CONCURRENCY) {
    const batch = stockCodes.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(c => getStockData(c)));

    for (const data of results) {
      if (data.klines && data.klines.length > 0) {
        const filePath = path.join(DATA_DIR, data.code + '.json');
        fs.writeFileSync(filePath, JSON.stringify({
          code: data.code,
          name: data.name || '',
          updatedAt: new Date().toISOString(),
          klines: data.klines,
          quote: data.quote || {}
        }, null, 2));
        success++;
        if (data.name) stocksList.push({ code: data.code, name: data.name });
      }
    }

    console.log('Progress: ' + Math.min(i + CONCURRENCY, stockCodes.length) + '/' + stockCodes.length + ' (' + success + ' success)');
  }

  // Save stock list
  fs.writeFileSync(path.join(DATA_DIR, 'stocks.json'), JSON.stringify(stocksList, null, 2));
  console.log('Done! Success: ' + success + ', Stock list: ' + stocksList.length);
}

main().catch(console.error);
