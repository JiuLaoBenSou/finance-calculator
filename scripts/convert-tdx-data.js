/**
 * 批量转换通达信数据到项目JSON格式
 */

const fs = require('fs');
const path = require('path');

const SOURCE_DIR = 'C:/Users/Administrator/Downloads/hsjday';
const OUTPUT_DIR = 'F:/vibe coding/project/Financecaculator/data_tdx';

// 读取现有的股票代码列表（获取股票名称）
const existingStocks = JSON.parse(fs.readFileSync(
  'F:/vibe coding/project/Financecaculator/data/stocks.json',
  'utf-8'
));

// 创建代码到名称的映射
const codeToName = {};
existingStocks.forEach(s => {
  codeToName[s.code] = s.name;
});

console.log('Loaded', Object.keys(codeToName).length, 'stock names');

function parseTdxDayFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const records = [];
  const recordSize = 32;
  const count = Math.floor(buffer.length / recordSize);

  for (let i = 0; i < count; i++) {
    const offset = i * recordSize;

    // 日期
    const dateNum = buffer.readUInt32LE(offset);
    const dateStr = String(dateNum).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');

    // 开盘价、最高价、最低价、收盘价（乘以10000）
    const open = buffer.readUInt32LE(offset + 4) / 10000;
    const high = buffer.readUInt32LE(offset + 8) / 10000;
    const low = buffer.readUInt32LE(offset + 12) / 10000;
    const close = buffer.readUInt32LE(offset + 16) / 10000;

    // 成交量
    const volume = buffer.readUInt32LE(offset + 24);

    // 跳过不合理的记录
    if (open <= 0 || high <= 0 || low <= 0 || close <= 0) continue;
    if (volume <= 0) continue;

    records.push({
      date: dateStr,
      open,
      high,
      low,
      close,
      volume
    });
  }

  // 按日期排序（从早到晚）
  records.sort((a, b) => a.date.localeCompare(b.date));

  return records;
}

function processMarket(market) {
  const ldayDir = path.join(SOURCE_DIR, market, 'lday');
  if (!fs.existsSync(ldayDir)) {
    console.log(`Directory not found: ${ldayDir}`);
    return [];
  }

  const files = fs.readdirSync(ldayDir).filter(f => f.endsWith('.day'));
  console.log(`\nProcessing ${market} market: ${files.length} files`);

  const stocks = [];
  let success = 0;
  let skipped = 0;

  for (const file of files) {
    const code = file.replace('.day', '');  // 例如 sh601398
    const filePath = path.join(ldayDir, file);

    try {
      const klines = parseTdxDayFile(filePath);

      if (klines.length < 100) {
        // 跳过数据太少的股票
        skipped++;
        continue;
      }

      // 获取股票名称
      const name = codeToName[code] || code;

      // 保存为项目格式
      const stockData = {
        code,
        name,
        klines
      };

      const outPath = path.join(OUTPUT_DIR, code + '.json');
      fs.writeFileSync(outPath, JSON.stringify(stockData, null, 2));

      stocks.push({ code, name });
      success++;

      if (success % 100 === 0) {
        console.log(`  Progress: ${success}/${files.length}`);
      }
    } catch (e) {
      // 跳过有问题的文件
    }
  }

  console.log(`  Done: ${success} success, ${skipped} skipped`);
  return stocks;
}

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('Starting conversion...');
console.log('Output directory:', OUTPUT_DIR);

// 处理上海和深圳市场
const shStocks = processMarket('sh');
const szStocks = processMarket('sz');

// 合并所有股票列表
const allStocks = [...shStocks, ...szStocks];
allStocks.sort((a, b) => a.code.localeCompare(b.code));

// 保存股票列表
fs.writeFileSync(
  path.join(OUTPUT_DIR, 'stocks.json'),
  JSON.stringify(allStocks, null, 2)
);

console.log('\n=== Summary ===');
console.log('Total stocks:', allStocks.length);

// 测试几个股票
console.log('\nSample stocks:');
allStocks.slice(0, 5).forEach(s => {
  const data = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, s.code + '.json'), 'utf-8'));
  console.log(`  ${s.code} ${s.name}: ${data.klines.length} days (${data.klines[0].date} ~ ${data.klines[data.klines.length-1].date})`);
});
