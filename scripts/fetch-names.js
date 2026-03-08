/**
 * 获取股票名称 - 使用东方财富API
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// 加载现有的 stocks.json
const stocks = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'stocks.json'), 'utf8'));

// 找出缺失名称的股票
const missing = stocks.filter(s => !s.name || s.name === s.code || s.name.length < 3);
console.log(`需要获取名称的股票数: ${missing.length}`);

// 使用东方财富 API 获取股票名称
function fetchStockName(code) {
  return new Promise((resolve) => {
    const secid = code.startsWith('sh') ? `1.${code.slice(2)}` : `0.${code.slice(2)}`;
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f57`;

    const cmd = `curl --noproxy "*" -s -L "${url}"`;

    const { exec } = require('child_process');
    exec(cmd, { timeout: 8000 }, (error, stdout) => {
      try {
        const data = JSON.parse(stdout);
        if (data.data && data.data.f57) {
          resolve({ code, name: data.data.f57 });
        } else {
          resolve({ code, name: '' });
        }
      } catch (e) {
        resolve({ code, name: '' });
      }
    });
  });
}

async function main() {
  const results = [];
  const concurrency = 20; // 高并发

  for (let i = 0; i < missing.length; i += concurrency) {
    const batch = missing.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(s => fetchStockName(s.code)));
    results.push(...batchResults);

    if ((i + concurrency) % 500 === 0 || i + concurrency >= missing.length) {
      console.log(`进度: ${Math.min(i + concurrency, missing.length)}/${missing.length}`);
    }
  }

  // 更新 stocks.json
  const nameMap = {};
  results.forEach(r => {
    if (r.name) nameMap[r.code] = r.name;
  });

  const updated = stocks.map(s => {
    if ((!s.name || s.name === s.code) && nameMap[s.code]) {
      return { ...s, name: nameMap[s.code] };
    }
    return s;
  });

  // 保存
  fs.writeFileSync(path.join(DATA_DIR, 'stocks.json'), JSON.stringify(updated, null, 2));
  console.log(`已更新 stocks.json`);

  // 统计
  const stillMissing = updated.filter(s => !s.name || s.name === s.code);
  console.log(`仍缺失名称: ${stillMissing.length}`);
}

main().catch(console.error);
