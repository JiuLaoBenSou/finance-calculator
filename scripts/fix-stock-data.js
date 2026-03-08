/**
 * 修复股票数据：获取正确名称（使用最大可用天数）
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const DATA_DIR = path.join(__dirname, '..', 'data');
const API_BASE = 'https://web.ifzq.gtimg.cn';
const PROXY = 'http://127.0.0.1:7890';

function fetchWithCurl(url) {
  return new Promise((resolve, reject) => {
    const cmd = `curl --noproxy "*" -x "${PROXY}" -s -L "${url}"`;
    exec(cmd, { timeout: 20000 }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

async function getStockNameAndData(code, days = 800) {
  const url = API_BASE + '/appstock/app/fqkline/get?param=' + code + ',day,,,' + days + ',qfq';

  try {
    const raw = await fetchWithCurl(url);
    const response = JSON.parse(raw);

    if (!response.data || !response.data[code]) {
      return null;
    }

    const stockData = response.data[code];
    let name = '';

    // 获取股票名称
    if (stockData.qt && stockData.qt[code]) {
      name = stockData.qt[code][1] || '';
    }

    // 获取K线数据
    let klines = [];
    if (stockData.qfqday && stockData.qfqday.length > 0) {
      klines = stockData.qfqday.map(k => ({
        date: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]),
        low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5])
      }));
    }

    return { code, name, klines };
  } catch (e) {
    return null;
  }
}

// 主要的沪深股票代码列表
const mainCodes = [];

// 上海主板
for (let i = 600000; i <= 603999; i++) {
  mainCodes.push('sh' + i);
}
// 科创板
for (let i = 688000; i <= 688999; i++) {
  mainCodes.push('sh' + i);
}
// 深圳主板
for (let i = 0; i <= 999; i++) {
  mainCodes.push('sz' + String(i).padStart(6, '0'));
}
// 深圳中小板
for (let i = 2000; i <= 2999; i++) {
  mainCodes.push('sz' + String(i).padStart(6, '0'));
}
// 创业板
for (let i = 300000; i <= 300999; i++) {
  mainCodes.push('sz' + String(i).padStart(6, '0'));
}

console.log('Total codes to fetch:', mainCodes.length);

async function main() {
  const stocks = [];
  const DELAY = 150;
  let success = 0;
  let fail = 0;

  for (let i = 0; i < mainCodes.length; i++) {
    const code = mainCodes[i];
    if (i % 50 === 0) {
      console.log(`Progress: ${i + 1}/${mainCodes.length} (${success} success, ${fail} failed)`);
    }

    const data = await getStockNameAndData(code);

    if (data && data.name && data.klines && data.klines.length > 0) {
      // 保存到文件
      const filePath = path.join(DATA_DIR, code + '.json');
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

      stocks.push({ code: data.code, name: data.name });
      success++;
    } else {
      fail++;
    }

    // 避免请求过快
    if (i % 10 === 9) {
      await new Promise(r => setTimeout(r, DELAY));
    }
  }

  console.log(`\nDone! Success: ${success}, Failed: ${fail}`);

  // 保存股票列表
  stocks.sort((a, b) => a.code.localeCompare(b.code));
  fs.writeFileSync(path.join(DATA_DIR, 'stocks.json'), JSON.stringify(stocks, null, 2));
  console.log(`Saved stocks.json with ${stocks.length} stocks`);
}

main().catch(console.error);
