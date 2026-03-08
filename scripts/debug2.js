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

async function getStockData(code, days = 5) {
  const url = API_BASE + '/appstock/app/fqkline/get?param=' + code + ',day,,,' + days + ',qfq';
  const raw = await fetchWithCurl(url);

  try {
    const response = JSON.parse(raw);
    if (response.data && response.data[code]) {
      const stockData = response.data[code];
      const name = stockData.qt && stockData.qt[code] ? stockData.qt[code][1] : '';
      const klines = stockData.qfqday || [];
      return { code, name, klines };
    }
    return { code, name: '', klines: [] };
  } catch (e) {
    return { code, name: '', klines: [] };
  }
}

async function main() {
  // Test with various stock codes
  const codes = ['sh600000', 'sz000001', 'sh000001', 'sz300001', 'sh688001'];
  console.log('Testing codes:', codes);

  for (const code of codes) {
    const result = await getStockData(code, 5);
    console.log('Result for', code, ': name=' + result.name + ', klines=' + result.klines.length);
  }
}

main();
