/**
 * 通达信 .day 数据文件解析器 (修正版)
 * 将二进制 .day 文件转换为 JSON 格式
 */

const fs = require('fs');
const path = require('path');

const STOCKS_DIR = path.join(__dirname, '..', 'stocks');
const DATA_DIR = path.join(__dirname, '..', 'data');

// 确保目录存在
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 解析通达信 .day 文件 (40字节/记录)
function parseDayFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const records = [];
  const recordSize = 40;

  for (let i = 0; i < buffer.length; i += recordSize) {
    if (i + recordSize > buffer.length) break;

    // 读取日期 (4字节整数)
    const date = buffer.readUInt32LE(i);

    // 过滤无效日期
    if (date < 19900101 || date > 20300101) continue;

    // 提取年月日
    const year = Math.floor(date / 10000);
    const month = Math.floor((date % 10000) / 100);
    const day = date % 100;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // 读取价格数据 (4字节整数，除以1000)
    const open = buffer.readUInt32LE(i + 4) / 1000;
    const high = buffer.readUInt32LE(i + 8) / 1000;
    const low = buffer.readUInt32LE(i + 12) / 1000;
    const close = buffer.readUInt32LE(i + 16) / 1000;
    const volume = buffer.readUInt32LE(i + 20);
    const amount = buffer.readUInt32LE(i + 24);

    // 过滤无效价格
    if (open <= 0 || close <= 0 || high < low) continue;

    records.push({
      date: dateStr,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: volume
    });
  }

  return records.reverse(); // 最早的日期在前
}

// 股票代码映射
function getStockName(code) {
  const names = {
    'sh000001': '上证指数',
    'sh000002': '上证B股',
    'sh000010': '上证180',
    'sh000016': '上证50',
    'sh000300': '沪深300',
    'sh000688': '科创50',
    'sh000852': '中证1000',
    'sh000905': '中证500',
    'sz399001': '深证成指',
    'sz399006': '创业板指',
    'sz399300': '深证300',
  };
  return names[code] || `股票${code}`;
}

async function main() {
  console.log('🚀 开始解析通达信A股数据...\n');

  ensureDir(DATA_DIR);

  // 获取所有 .day 文件
  const shDir = path.join(STOCKS_DIR, 'sh', 'lday');
  const szDir = path.join(STOCKS_DIR, 'sz', 'lday');

  const shFiles = fs.readdirSync(shDir).filter(f => f.endsWith('.day'));
  const szFiles = fs.readdirSync(szDir).filter(f => f.endsWith('.day'));

  console.log(`📊 上海: ${shFiles.length} 只`);
  console.log(`📊 深圳: ${szFiles.length} 只\n`);

  let totalSuccess = 0;
  let totalRecords = 0;

  // 解析上海股票
  console.log('📈 解析上海股票...');
  for (let i = 0; i < shFiles.length; i++) {
    const file = shFiles[i];
    const code = file.replace('.day', '');

    try {
      const klines = parseDayFile(path.join(shDir, file));

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

        const name = getStockName(code);
        const data = { klines, quote };

        // 保存到文件
        const filePath = path.join(DATA_DIR, `${code}.json`);
        fs.writeFileSync(filePath, JSON.stringify({
          code,
          name,
          updatedAt: new Date().toISOString(),
          ...data
        }, null, 2), 'utf8');

        totalSuccess++;
        totalRecords += klines.length;
        if (totalSuccess % 500 === 0) {
          console.log(`  进度: ${totalSuccess}/${shFiles.length + szFiles.length}`);
        }
      }
    } catch (e) {
      // 跳过失败的
    }
  }

  console.log(`  上海完成: ${totalSuccess} 只\n`);

  // 解析深圳股票
  console.log('📈 解析深圳股票...');
  let szSuccess = 0;
  for (let i = 0; i < szFiles.length; i++) {
    const file = szFiles[i];
    const code = file.replace('.day', '');

    try {
      const klines = parseDayFile(path.join(szDir, file));

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

        const name = getStockName(code);
        const data = { klines, quote };

        // 保存到文件
        const filePath = path.join(DATA_DIR, `${code}.json`);
        fs.writeFileSync(filePath, JSON.stringify({
          code,
          name,
          updatedAt: new Date().toISOString(),
          ...data
        }, null, 2), 'utf8');

        szSuccess++;
        totalRecords += klines.length;
        if (szSuccess % 500 === 0) {
          console.log(`  进度: ${totalSuccess + szSuccess}/${shFiles.length + szFiles.length}`);
        }
      }
    } catch (e) {
      // 跳过失败的
    }
  }

  totalSuccess += szSuccess;

  console.log(`\n✅ 数据解析完成!`);
  console.log(`   成功: ${totalSuccess} 只`);
  console.log(`   总记录: ${totalRecords} 条`);
  console.log(`\n📁 数据保存在: ${DATA_DIR}`);

  // 生成股票列表
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && f !== 'stocks.json');
  const stocks = files.map(f => {
    const code = f.replace('.json', '');
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    return { code, name: data.name };
  });
  const stockListFile = path.join(DATA_DIR, 'stocks.json');
  fs.writeFileSync(stockListFile, JSON.stringify(stocks, null, 2), 'utf8');
  console.log(`   股票列表已更新: ${stocks.length} 只`);

  // 显示数据范围
  if (stocks.length > 0) {
    const sample = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${stocks[0].code}.json`), 'utf8'));
    console.log(`\n📅 数据范围: ${sample.klines[0].date} 至 ${sample.klines[sample.klines.length - 1].date}`);
  }
}

main().catch(console.error);
