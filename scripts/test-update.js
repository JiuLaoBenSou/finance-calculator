/**
 * 测试数据更新
 */
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const DATA_DIR = 'F:/vibe coding/project/Financecaculator/data';
const PROXY = 'http://127.0.0.1:7890';
const API_BASE = 'https://web.ifzq.gtimg.cn';

function fetchStockData(code) {
  return new Promise((resolve) => {
    const url = API_BASE + '/appstock/app/fqkline/get?param=' + code + ',day,,,100,qfq';
    const cmd = `curl --noproxy "*" -x "${PROXY}" -s -L "${url}"`;

    exec(cmd, { timeout: 30000 }, (error, stdout) => {
      try {
        const response = JSON.parse(stdout);
        if (response.data && response.data[code]) {
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
          }

          klines.sort((a, b) => a.date.localeCompare(b.date));
          resolve({ code, name, klines });
        } else {
          resolve(null);
        }
      } catch (e) {
        resolve(null);
      }
    });
  });
}

async function test() {
  console.log('=== 测试数据更新流程 ===\n');

  // 测试实际股票代码
  const testCodes = ['sh601398', 'sh600000', 'sz000001', 'sh601939', 'sz300001'];
  console.log('测试', testCodes.length, '只股票...\n');

  let success = 0;
  let failed = 0;

  for (const code of testCodes) {
    const result = await fetchStockData(code);
    if (result && result.klines && result.klines.length > 0) {
      console.log(`  ${code}: ${result.klines.length}天数据, 最新:${result.klines[result.klines.length-1].date}`);
      success++;
    } else {
      console.log(`  ${code}: 失败`);
      failed++;
    }
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n成功: ${success}, 失败: ${failed}`);

  // 测试数据合并
  console.log('\n=== 测试数据合并 ===\n');
  const existingData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'sh601398.json'), 'utf-8'));
  console.log('现有数据: ' + existingData.klines.length + '天');
  console.log('日期范围: ' + existingData.klines[0].date + ' ~ ' + existingData.klines[existingData.klines.length-1].date);

  const newData = await fetchStockData('sh601398');
  if (newData) {
    const existingDates = new Set(existingData.klines.map(k => k.date));
    const newKlines = newData.klines.filter(k => !existingDates.has(k.date));
    console.log('需更新: ' + newKlines.length + '天');
    if (newKlines.length > 0) {
      console.log('新增日期: ' + newKlines[0].date);
    }
  }
}

test();
