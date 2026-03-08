/**
 * 高效批量获取股票数据（并行处理）
 * 支持环境变量 PROXY 和 GITHUB_ACTIONS
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const DATA_DIR = path.join(__dirname, '..', 'data');
const API_BASE = 'https://web.ifzq.gtimg.cn';
const PROXY = process.env.PROXY || 'http://127.0.0.1:7890';
const CONCURRENCY = process.env.GITHUB_ACTIONS ? 20 : 10; // GitHub Actions 可以用更高并发

function fetchStock(code) {
  return new Promise((resolve) => {
    let cmd;
    if (PROXY && PROXY.length > 0) {
      cmd = `curl --noproxy "*" -x "${PROXY}" -s -L "${API_BASE}/appstock/app/fqkline/get?param=${code},day,,,800,qfq"`;
    } else {
      // 无代理模式（GitHub Actions）
      cmd = `curl -s -L "${API_BASE}/appstock/app/fqkline/get?param=${code},day,,,800,qfq"`;
    }

    exec(cmd, { timeout: 15000 }, (error, stdout) => {
      try {
        const response = JSON.parse(stdout);
        if (response.data && response.data[code]) {
          const stockData = response.data[code];
          const name = stockData.qt && stockData.qt[code] ? stockData.qt[code][1] : '';
          const klines = stockData.qfqday ? stockData.qfqday.map(k => ({
            date: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]),
            low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5])
          })) : [];
          resolve({ code, name, klines, success: true });
        } else {
          resolve({ code, success: false });
        }
      } catch (e) {
        resolve({ code, success: false });
      }
    });
  });
}

async function main() {
  // 生成股票代码列表
  const codes = [];

  // 上海主板 600000-603999
  for (let i = 600000; i <= 603999; i++) codes.push('sh' + i);
  // 科创板 688000-688999
  for (let i = 688000; i <= 688999; i++) codes.push('sh' + i);
  // 深圳主板 000000-000999
  for (let i = 0; i <= 999; i++) codes.push('sz' + String(i).padStart(6, '0'));
  // 中小板 002000-002999
  for (let i = 2000; i <= 2999; i++) codes.push('sz' + String(i).padStart(6, '0'));
  // 创业板 300000-300999
  for (let i = 300000; i <= 300999; i++) codes.push('sz' + String(i).padStart(6, '0'));

  console.log(`Total codes: ${codes.length}`);

  const stocks = [];
  let success = 0;
  let fail = 0;
  let processed = 0;

  // 并行处理
  for (let i = 0; i < codes.length; i += CONCURRENCY) {
    const batch = codes.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(c => fetchStock(c)));

    for (const result of results) {
      processed++;
      if (result.success && result.name) {
        const filePath = path.join(DATA_DIR, result.code + '.json');
        fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
        stocks.push({ code: result.code, name: result.name });
        success++;

        if (success <= 5) {
          console.log(`  ${result.code}: ${result.name} (${result.klines.length} days)`);
        }
      } else {
        fail++;
      }
    }

    console.log(`Progress: ${processed}/${codes.length} (${success} ok, ${fail} failed)`);
  }

  console.log(`\nDone! Success: ${success}, Failed: ${fail}`);

  // 保存股票列表
  stocks.sort((a, b) => a.code.localeCompare(b.code));
  fs.writeFileSync(path.join(DATA_DIR, 'stocks.json'), JSON.stringify(stocks, null, 2));
  console.log(`Saved stocks.json with ${stocks.length} stocks`);
}

main().catch(console.error);
