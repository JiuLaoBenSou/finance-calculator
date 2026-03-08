/**
 * 数据更新脚本 - 完整版
 * 获取A股所有股票的历史数据
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const DATA_DIR = path.join(__dirname, '..', 'data');
const API_BASE = 'https://web.ifzq.gtimg.cn';
const PROXY = 'http://127.0.0.1:7890';

// 生成所有可能的股票代码
function generateAllStockCodes() {
  const stocks = [];

  // 指数
  const indexes = [
    { code: 'sh000001', name: '上证指数' },
    { code: 'sz399001', name: '深证成指' },
    { code: 'sh000300', name: '沪深300' },
    { code: 'sh000016', name: '上证50' },
    { code: 'sz399006', name: '创业板指' },
    { code: 'sh000688', name: '科创50' },
    { code: 'sh000905', name: '中证500' },
    { code: 'sh000852', name: '中证1000' },
  ];

  // 上海主板: sh600000-sh601999, sh603000-sh603999
  for (let i = 600000; i <= 601999; i++) {
    const code = `sh${i}`;
    stocks.push({ code, name: `股票${i}` });
  }
  for (let i = 603000; i <= 603999; i++) {
    const code = `sh${i}`;
    stocks.push({ code, name: `股票${i}` });
  }

  // 深圳主板: sz000001-sz003999
  for (let i = 1; i <= 3999; i++) {
    const code = `sz${String(i).padStart(6, '0')}`;
    stocks.push({ code, name: `股票${String(i).padStart(6, '0')}` });
  }

  // 创业板: sz300001-sz300999
  for (let i = 300001; i <= 300999; i++) {
    const code = `sz${i}`;
    stocks.push({ code, name: `股票${i}` });
  }

  // 科创板: sh688001-sh688999
  for (let i = 688001; i <= 688999; i++) {
    const code = `sh${i}`;
    stocks.push({ code, name: `股票${i}` });
  }

  return [...indexes, ...stocks];
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 使用curl获取数据
function fetchWithCurl(url) {
  return new Promise((resolve, reject) => {
    const cmd = `curl -x "${PROXY}" -s --max-time 10 "${url}"`;
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

// 获取单只股票K线数据
async function getStockKline(code, days = 2500) {
  try {
    const url = `${API_BASE}/appstock/app/fqkline/get?param=${code},day,,,${days},qfq`;
    const data = await fetchWithCurl(url);

    if (data.data && data.data[code]) {
      const stockData = data.data[code];
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

        return { klines, quote };
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

// 保存股票数据到文件
function saveStockData(code, name, data) {
  const filePath = path.join(DATA_DIR, `${code}.json`);
  const fileData = {
    code,
    name,
    updatedAt: new Date().toISOString(),
    ...data
  };
  fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2), 'utf8');
}

// 检查股票是否已存在
function stockExists(code) {
  const filePath = path.join(DATA_DIR, `${code}.json`);
  return fs.existsSync(filePath);
}

async function main() {
  console.log('🚀 开始更新A股所有股票数据...\n');

  ensureDir(DATA_DIR);

  // 生成所有股票代码
  const allStocks = generateAllStockCodes();
  console.log(`📊 共 ${allStocks.length} 只股票待检测\n`);

  // 统计
  let success = 0;
  let failed = 0;
  let skipped = 0;
  let checked = 0;

  // 获取已存在的股票
  const existingFiles = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && f !== 'stocks.json');
  const existingCodes = new Set(existingFiles.map(f => f.replace('.json', '')));
  console.log(`📁 已存在 ${existingCodes.size} 只股票数据\n`);

  // 遍历所有股票
  for (let i = 0; i < allStocks.length; i++) {
    const stock = allStocks[i];
    checked++;

    // 跳过已存在的
    if (existingCodes.has(stock.code)) {
      skipped++;
      if (i % 1000 === 0) {
        console.log(`  进度: ${i}/${allStocks.length} (成功: ${success}, 跳过: ${skipped})`);
      }
      continue;
    }

    if (i % 200 === 0) {
      console.log(`  进度: ${i}/${allStocks.length} (成功: ${success}, 失败: ${failed}, 跳过: ${skipped})`);
    }

    const data = await getStockKline(stock.code, 2500);

    if (data && data.klines && data.klines.length > 0) {
      saveStockData(stock.code, stock.name, data);
      success++;
      if (success % 50 === 0) {
        console.log(`  ✓ 已获取 ${success} 只股票数据`);
      }
    } else {
      failed++;
    }

    // 避免请求过快
    if (i % 5 === 0) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  console.log(`\n✅ 数据更新完成!`);
  console.log(`   成功: ${success} 只`);
  console.log(`   失败: ${failed} 只`);
  console.log(`   跳过: ${skipped} 只`);
  console.log(`\n📁 数据保存在: ${DATA_DIR}`);

  // 更新股票列表
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && f !== 'stocks.json');
  const stocks = files.map(f => {
    const code = f.replace('.json', '');
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    return { code, name: data.name };
  });
  const stockListFile = path.join(DATA_DIR, 'stocks.json');
  fs.writeFileSync(stockListFile, JSON.stringify(stocks, null, 2), 'utf8');
  console.log(`   股票列表已更新: ${stocks.length} 只`);
}

main().catch(console.error);
