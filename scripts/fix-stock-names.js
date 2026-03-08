/**
 * 通过腾讯财经API批量获取股票名称
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PROXY = 'http://127.0.0.1:7890';
const DATA_DIR = 'F:/vibe coding/project/Financecaculator/data';

// 读取现有的stocks.json
const stocks = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'stocks.json'), 'utf-8'));

// 找出需要修复的股票
const badStocks = stocks.filter(s => s.name.startsWith('sh') || s.name.startsWith('sz'));
console.log(`Need to fix ${badStocks.length} stock names`);

// 使用腾讯财经API获取股票名称
function fetchStockName(code) {
  return new Promise((resolve) => {
    // 腾讯财经API
    const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},day,,,1,qfq`;
    const cmd = `curl --noproxy "*" -x "${PROXY}" -s -L "${url}"`;

    exec(cmd, { timeout: 10000 }, (error, stdout) => {
      try {
        const response = JSON.parse(stdout);
        if (response.data && response.data[code]) {
          const stockData = response.data[code];
          const name = stockData.qt && stockData.qt[code] ? stockData.qt[code][1] : '';
          resolve({ code, name, success: !!name });
        } else {
          resolve({ code, name: '', success: false });
        }
      } catch (e) {
        resolve({ code, name: '', success: false });
      }
    });
  });
}

async function main() {
  const CONCURRENCY = 15;
  let fixed = 0;
  let failed = 0;

  // 批量处理
  for (let i = 0; i < badStocks.length; i += CONCURRENCY) {
    const batch = badStocks.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(s => fetchStockName(s.code)));

    for (const result of results) {
      if (result.success && result.name) {
        // 更新内存中的股票数据
        const stock = stocks.find(s => s.code === result.code);
        if (stock) {
          stock.name = result.name;
          fixed++;
        }
      } else {
        failed++;
      }
    }

    if ((i + CONCURRENCY) % 100 === 0 || i + CONCURRENCY >= badStocks.length) {
      console.log(`Progress: ${i + CONCURRENCY}/${badStocks.length} (fixed: ${fixed}, failed: ${failed})`);
    }

    // 避免请求过快
    await new Promise(r => setTimeout(r, 200));
  }

  // 保存更新后的stocks.json
  fs.writeFileSync(
    path.join(DATA_DIR, 'stocks.json'),
    JSON.stringify(stocks, null, 2)
  );

  console.log(`\nDone! Fixed: ${fixed}, Failed: ${failed}`);

  // 检查剩余坏名字
  const remaining = stocks.filter(s => s.name.startsWith('sh') || s.name.startsWith('sz'));
  console.log(`Remaining bad names: ${remaining.length}`);
}

main().catch(console.error);
