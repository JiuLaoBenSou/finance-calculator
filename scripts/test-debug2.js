const { exec } = require('child_process');
const API_BASE = 'https://web.ifzq.gtimg.cn';

function fetchWithCurl(url) {
  return new Promise((resolve, reject) => {
    const cmd = `curl --noproxy "*" -s -L "${url}"`;
    exec(cmd, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

async function getStockData(code, days = 5) {
  const url = API_BASE + '/appstock/app/fqkline/get?param=' + code + ',day,,,' + days + ',qfq';
  const raw = await fetchWithCurl(url);

  console.log('Got raw for', code, ':', raw.substring(0, 50));

  try {
    const response = JSON.parse(raw);
    console.log('Response keys:', Object.keys(response));
    console.log('response.data:', response.data);

    if (!response.data || !response.data[code]) {
      console.log('No data for', code);
      return { code, name: '', klines: [] };
    }

    const stockData = response.data[code];
    console.log('stockData keys:', Object.keys(stockData));
    console.log('qt:', stockData.qt);

    let name = '';
    if (stockData.qt && stockData.qt[code]) {
      name = stockData.qt[code][1] || '';
    }

    console.log('Name:', name);

    let klines = [];
    if (stockData.qfqday && stockData.qfqday.length > 0) {
      klines = stockData.qfqday;
      console.log('qfqday length:', klines.length);
    }

    return { code, name, klines };
  } catch (e) {
    console.log('Error:', e.message);
    return { code, name: '', klines: [] };
  }
}

async function main() {
  const result = await getStockData('sh600000');
  console.log('Final result:', result);
}

main();
