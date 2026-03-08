/**
 * 自动更新股票数据
 * 使用腾讯财经API获取最新行情
 * 建议每天收盘后运行（16:00后）
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const DATA_DIR = 'F:/vibe coding/project/Financecaculator/data';
const PROXY = 'http://127.0.0.1:7890';
const API_BASE = 'https://web.ifzq.gtimg.cn';

function fetchStockData(code) {
  return new Promise((resolve) => {
    // 获取最近100天的数据
    const url = API_BASE + '/appstock/app/fqkline/get?param=' + code + ',day,,,100,qfq';
    const cmd = `curl --noproxy "*" -x "${PROXY}" -s -L "${url}"`;

    exec(cmd, { timeout: 30000 }, (error, stdout) => {
      try {
        const response = JSON.parse(stdout);
        if (!response.data || !response.data[code]) {
          resolve(null);
          return;
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
        }

        // 按日期排序（从早到晚）
        klines.sort((a, b) => a.date.localeCompare(b.date));

        resolve({ code, name, klines });
      } catch (e) {
        resolve(null);
      }
    });
  });
}

async function main() {
  console.log('=== 股票数据自动更新 ===');
  console.log('时间:', new Date().toLocaleString());

  // 读取现有的stocks.json
  const stocks = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'stocks.json'), 'utf-8'));
  console.log('股票总数:', stocks.length);

  let success = 0;
  let failed = 0;
  const CONCURRENCY = 5;

  // 批量更新
  for (let i = 0; i < stocks.length; i += CONCURRENCY) {
    const batch = stocks.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(s => fetchStockData(s.code)));

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const code = batch[j].code;

      if (result && result.klines && result.klines.length > 0) {
        // 读取现有数据
        const filePath = path.join(DATA_DIR, code + '.json');
        try {
          const existingData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

          // 合并数据：保留原有数据，只添加新的
          const existingDates = new Set(existingData.klines.map(k => k.date));
          const newKlines = result.klines.filter(k => !existingDates.has(k.date));

          if (newKlines.length > 0) {
            // 添加新数据
            existingData.klines = [...existingData.klines, ...newKlines];
            existingData.klines.sort((a, b) => a.date.localeCompare(b.date));

            // 更新名称（如果有）
            if (result.name && !result.name.startsWith('sh') && !result.name.startsWith('sz')) {
              existingData.name = result.name;
            }

            fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2));
            success++;
          } else {
            // 数据已是最新
            success++;
          }
        } catch (e) {
          // 文件不存在或解析错误，写入新数据
          fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
          success++;
        }
      } else {
        failed++;
      }
    }

    if ((i + CONCURRENCY) % 100 === 0 || i + CONCURRENCY >= stocks.length) {
      console.log(`进度: ${Math.min(i + CONCURRENCY, stocks.length)}/${stocks.length} (成功: ${success}, 失败: ${failed})`);
    }

    // 避免请求过快
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n=== 更新完成 ===');
  console.log('成功:', success);
  console.log('失败:', failed);
}

main().catch(console.error);
