/**
 * 快速股票数据更新脚本
 * 使用并行请求加速获取
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PROXY = 'http://127.0.0.1:7890';
const API_BASE = 'https://web.ifzq.gtimg.cn';

// 使用curl获取数据
function fetchWithCurl(url) {
  return new Promise((resolve, reject) => {
    const cmd = `curl -x "${PROXY}" -s -L "${url}"`;
    exec(cmd, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(e);
      }
    });
  });
}

// 获取股票数据
async function getStockData(code, days = 2500) {
  try {
    const url = `${API_BASE}/appstock/app/fqkline/get?param=${code},day,,,${days},qfq`;
    const response = await fetchWithCurl(url);

    if (response.data && response.data[code]) {
      const stockData = response.data[code];

      // 获取股票名称
      let name = '';
      if (stockData.qt && stockData.qt[code]) {
        name = stockData.qt[code][1] || '';
      }

      // 获取K线数据
      let klines = [];
      if (stockData.qfqday && stockData.qfqday.length > 0) {
        klines = stockData.qfqday.map(k => ({
          date: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5])
        }));
      } else if (stockData.day && stockData.day.length > 0) {
        klines = stockData.day.map(k => ({
          date: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5])
        }));
      }

      if (klines.length > 0) {
        const latest = klines[klines.length - 1];
        const quote = {
          date: latest.date,
          open: latest.open,
          high: latest.high,
          low: latest.low,
          close: latest.close,
          volume: latest.volume
        };

        return { code, name, klines, quote };
      }
    }
    return { code, name: '', klines: [], quote: {} };
  } catch (error) {
    return { code, name: '', klines: [], quote: {} };
  }
}

// 并行处理函数
async function processBatch(codes, concurrency = 20) {
  const results = [];
  for (let i = 0; i < codes.length; i += concurrency) {
    const batch = codes.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(code => getStockData(code)));
    results.push(...batchResults);
    console.log(`  进度: ${Math.min(i + concurrency, codes.length)}/${codes.length}`);
  }
  return results;
}

// 保存股票数据
function saveStockData(data) {
  if (!data || !data.code) return;

  const filePath = path.join(DATA_DIR, `${data.code}.json`);
  const fileData = {
    code: data.code,
    name: data.name || '',
    updatedAt: new Date().toISOString(),
    klines: data.klines || [],
    quote: data.quote || {}
  };

  fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2), 'utf8');
}

// 主函数
async function main() {
  console.log('='.repeat(50));
  console.log('快速更新股票数据 (并行模式)...');
  console.log('='.repeat(50));

  // 读取现有数据获取有效的股票代码
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && f !== 'stocks.json');
  const existingCodes = files.map(f => f.replace('.json', ''));
  console.log(`\n现有 ${existingCodes.length} 个数据文件`);

  // 测试API
  console.log('\n测试API...');
  const testResult = await getStockData('sh600000', 5);
  console.log(`测试成功! 股票: ${testResult.name}, 最新日期: ${testResult.klines[testResult.klines.length-1]?.date}`);

  // 并行获取所有数据
  console.log('\n开始获取数据 (并发20)...');
  const allData = await processBatch(existingCodes, 20);

  // 保存所有数据
  console.log('\n保存数据...');
  let success = 0;
  const stocksList = [];

  for (const data of allData) {
    if (data.klines && data.klines.length > 0) {
      saveStockData(data);
      success++;
      if (data.name) {
        stocksList.push({ code: data.code, name: data.name });
      }
    }
  }

  console.log(`\n完成! 成功更新 ${success} 只股票`);

  // 保存股票列表
  const stockListFile = path.join(DATA_DIR, 'stocks.json');
  fs.writeFileSync(stockListFile, JSON.stringify(stocksList, null, 2), 'utf8');
  console.log(`已保存 ${stocksList.length} 只股票到 stocks.json`);

  // 显示前15只
  console.log('\n前15只股票:');
  stocksList.slice(0, 15).forEach(s => console.log(`  ${s.code}: ${s.name}`));
}

main().catch(console.error);
