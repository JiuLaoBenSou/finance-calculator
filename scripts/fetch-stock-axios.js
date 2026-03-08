/**
 * Stock data update script - using axios
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const DATA_DIR = path.join(__dirname, '..', 'data');

const PROXY = 'http://127.0.0.1:7890';
const API_BASE = 'https://web.ifzq.gtimg.cn';

async function getStockData(code, days = 2500) {
  try {
    const url = `${API_BASE}/appstock/app/fqkline/get?param=${code},day,,,${days},qfq`;
    const response = await axios.get(url, {
      proxy: { host: '127.0.0.1', port: 7890 },
      timeout: 15000
    });
    const data = response.data;

    if (!data.data || !data.data[code]) {
      return { code, name: '', klines: [] };
    }

    const stockData = data.data[code];
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
    console.log('Error for ' + code + ':', e.message);
    return { code, name: '', klines: [] };
  }
}

async function main() {
  console.log('Starting update...');

  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && f !== 'stocks.json');
  const allCodes = files.map(f => f.replace('.json', ''));

  // Only process actual stocks
  const stockCodes = allCodes.filter(c =>
    c.startsWith('sh600') || c.startsWith('sh688') ||
    c.startsWith('sz000') || c.startsWith('sz300')
  );

  console.log('Stock files: ' + stockCodes.length);

  let success = 0;
  const stocksList = [];

  // First test with a few codes
  console.log('Testing first 5:');
  for (const code of stockCodes.slice(0, 5)) {
    const result = await getStockData(code);
    console.log(code + ': ' + result.name + ', klines: ' + result.klines.length);
  }

  const DELAY = 200;

  for (let i = 0; i < stockCodes.length; i++) {
    const code = stockCodes[i];
    const data = await getStockData(code);

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

    if ((i + 1) % 50 === 0) {
      console.log('Progress: ' + (i + 1) + '/' + stockCodes.length + ' (' + success + ' success)');
    }

    await new Promise(r => setTimeout(r, DELAY));
  }

  fs.writeFileSync(path.join(DATA_DIR, 'stocks.json'), JSON.stringify(stocksList, null, 2));
  console.log('Done! Success: ' + success + ', Stock list: ' + stocksList.length);
}

main().catch(console.error);
