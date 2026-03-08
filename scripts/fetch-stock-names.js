/**
 * 股票列表和名称更新脚本
 * 从腾讯财经API获取所有A股数据
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
    exec(cmd, { timeout: 30000 }, (error, stdout, stderr) => {
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

// 获取股票数据（包含名称和K线）
async function getStockData(code, days = 2500) {
  try {
    const url = `${API_BASE}/appstock/app/fqkline/get?param=${code},day,,,${days},qfq`;
    const response = await fetchWithCurl(url);

    if (response.data && response.data[code]) {
      const stockData = response.data[code];

      // 获取股票名称 - 从qt字段
      let name = '';
      if (stockData.qt && stockData.qt[code]) {
        // qt[code][1] 是股票名称
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

        return { name, klines, quote };
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

// 生成所有A股股票代码
function generateAllStockCodes() {
  const codes = [];

  // 上海主板 600000-603999
  for (let i = 600000; i <= 603999; i++) {
    codes.push(`sh${i}`);
  }

  // 深圳主板 000001-001999
  for (let i = 0; i <= 1999; i++) {
    codes.push(`sz${i.toString().padStart(6, '0')}`);
  }

  // 创业板 300001-300999
  for (let i = 300001; i <= 300999; i++) {
    codes.push(`sz${i}`);
  }

  // 科创板 688000-688999
  for (let i = 688000; i <= 688999; i++) {
    codes.push(`sh${i}`);
  }

  return codes;
}

// 批量保存数据
function saveStockData(code, data) {
  const filePath = path.join(DATA_DIR, `${code}.json`);

  const fileData = {
    code,
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
  console.log('开始更新股票数据...');
  console.log('='.repeat(50));

  // 1. 生成所有股票代码
  const allCodes = generateAllStockCodes();
  console.log(`\n生成了 ${allCodes.length} 个股票代码`);

  // 2. 读取现有数据获取有效的股票代码
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && f !== 'stocks.json');
  const existingCodes = files.map(f => f.replace('.json', ''));
  console.log(`现有 ${existingCodes.length} 个数据文件`);

  // 3. 测试API获取数据
  console.log('\n测试API获取数据...');
  const testResult = await getStockData('sh600000', 5);
  if (testResult) {
    console.log(`测试成功! 股票名称: ${testResult.name}`);
    console.log(`K线数量: ${testResult.klines.length}`);
    console.log(`最新日期: ${testResult.klines[testResult.klines.length - 1].date}`);
  } else {
    console.log('API测试失败!');
    return;
  }

  // 4. 逐个获取股票数据
  console.log('\n开始获取所有股票数据 (这需要一些时间)...');

  let success = 0;
  let failed = 0;
  const stocksList = [];

  // 限制每批请求之间的时间，避免被限流
  const DELAY_BETWEEN_REQUESTS = 200; // ms

  for (let i = 0; i < existingCodes.length; i++) {
    const code = existingCodes[i];

    if (i % 50 === 0) {
      console.log(`  进度: ${i}/${existingCodes.length} (${((i/existingCodes.length)*100).toFixed(1)}%)`);
    }

    // 获取数据
    const data = await getStockData(code, 2500);

    if (data && data.klines && data.klines.length > 0) {
      // 保存到文件
      saveStockData(code, data);

      // 添加到列表
      if (data.name) {
        stocksList.push({ code, name: data.name });
        success++;
      } else {
        failed++;
      }
    } else {
      failed++;
    }

    // 避免请求过快
    if (i % 5 === 0) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS));
    }
  }

  console.log(`\n数据更新完成!`);
  console.log(`  成功: ${success} 只`);
  console.log(`  失败: ${failed} 只`);

  // 5. 保存股票列表
  console.log('\n保存股票列表...');
  const stockListFile = path.join(DATA_DIR, 'stocks.json');
  fs.writeFileSync(stockListFile, JSON.stringify(stocksList, null, 2), 'utf8');
  console.log(`已保存 ${stocksList.length} 只股票到 stocks.json`);

  // 显示前10只股票
  console.log('\n前10只股票:');
  stocksList.slice(0, 10).forEach(s => console.log(`  ${s.code}: ${s.name}`));
}

main().catch(console.error);
