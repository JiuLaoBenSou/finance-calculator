/**
 * 补全股票历史数据
 * 每次请求800天，多次请求直到没有更早数据
 *
 * 使用方法: node scripts/complete-history.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const COMPRESSED_FILE = path.join(__dirname, '..', 'data-compressed.json');
const PROXY = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || '';
const TENCENT_API = 'https://web.ifzq.gtimg.cn';

// 使用 curl 获取数据
function fetchWithCurl(url) {
  return new Promise((resolve) => {
    const proxyFlag = PROXY ? `-x "${PROXY}"` : '';
    const cmd = `curl ${proxyFlag} -s -L --connect-timeout 10 --max-time 15 "${url}"`;
    require('child_process').exec(cmd, { timeout: 20000 }, (error, stdout) => {
      if (error || !stdout) {
        resolve(null);
        return;
      }
      try {
        const data = JSON.parse(stdout);
        resolve(data);
      } catch (e) {
        resolve(null);
      }
    });
  });
}

// 获取单只股票K线（指定起始日期和天数）
async function getKline(code, days = 800, startDate = '') {
  let url;
  if (startDate) {
    url = `${TENCENT_API}/appstock/app/fqkline/get?param=${code},day,${startDate},,${days},qfq`;
  } else {
    url = `${TENCENT_API}/appstock/app/fqkline/get?param=${code},day,,,${days},qfq`;
  }

  const data = await fetchWithCurl(url);

  if (data?.data?.[code]) {
    const stockData = data.data[code];
    const klines = stockData.qfqday || stockData.day || [];
    if (klines.length > 0) {
      return klines.map(k => ({
        date: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5])
      }));
    }
  }
  return null;
}

// 解压单个块
function decompressChunk(compressedData) {
  const buffer = Uint8Array.from(atob(compressedData), c => c.charCodeAt(0));
  const decompressed = zlib.gunzipSync(buffer);
  return JSON.parse(decompressed.toString('utf8'));
}

// 压缩单个块
function compressChunk(stockData) {
  const jsonStr = JSON.stringify(stockData);
  const compressed = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'));
  return compressed.toString('base64');
}

// 补全单只股票的历史数据
async function completeStockHistory(code, existingKlines) {
  // 获取当前最早日期
  let earliestDate = null;
  if (existingKlines && existingKlines.length > 0) {
    earliestDate = existingKlines[0].date;
  }

  console.log(`\n📈 补全 ${code}...`);
  if (earliestDate) {
    console.log(`   当前最早日期: ${earliestDate}, 共 ${existingKlines.length} 天`);
  }

  // 从最早日期往前追溯，每次800天
  const allKlines = existingKlines ? [...existingKlines] : [];
  let currentStartDate = earliestDate || '';
  const DAYS_PER_REQUEST = 800;
  const MAX_RETRIES = 10; // 最多请求10次（约8000天 = 20年）

  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    // 计算请求的起始日期（往前800天）
    let startDate = '';
    if (currentStartDate) {
      const date = new Date(currentStartDate);
      date.setDate(date.getDate() - DAYS_PER_REQUEST);
      startDate = date.toISOString().split('T')[0];
    }

    console.log(`   请求 ${retry + 1}: 从 ${startDate || '最新'} 往前 ${DAYS_PER_REQUEST} 天`);

    const klines = await getKline(code, DAYS_PER_REQUEST, startDate);

    if (!klines || klines.length === 0) {
      console.log(`   没有更多数据，停止`);
      break;
    }

    // 检查是否有新数据
    const newEarliest = klines[0].date;
    if (newEarliest === currentStartDate || (currentStartDate && new Date(newEarliest) >= new Date(currentStartDate))) {
      console.log(`   没有更早数据，停止`);
      break;
    }

    // 合并数据（去重）
    const existingDates = new Set(allKlines.map(k => k.date));
    const uniqueNew = klines.filter(k => !existingDates.has(k.date));

    if (uniqueNew.length === 0) {
      console.log(`   无新数据，停止`);
      break;
    }

    // 添加到最前面
    allKlines.unshift(...uniqueNew);
    console.log(`   新增 ${uniqueNew.length} 天，总计 ${allKlines.length} 天`);

    currentStartDate = newEarliest;

    // 如果获取的数据少于请求的天数，说明已经到头了
    if (klines.length < DAYS_PER_REQUEST) {
      console.log(`   已到最早数据，停止`);
      break;
    }

    // 避免请求过快
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`   完成: 共 ${allKlines.length} 天`);

  // 按日期排序
  allKlines.sort((a, b) => new Date(a.date) - new Date(b.date));

  return allKlines;
}

// 主函数
async function main() {
  console.log('🚀 开始补全股票历史数据...\n');

  // 1. 加载压缩数据
  console.log('📂 加载压缩数据...');
  const fileContent = fs.readFileSync(COMPRESSED_FILE, 'utf8');
  const chunks = JSON.parse(fileContent);
  console.log(`   共有 ${chunks.length} 个数据块\n`);

  // 2. 选择要补全的股票（从第一个块选）
  const testChunk = decompressChunk(chunks[0].data);
  const codes = Object.keys(testChunk);

  console.log(`📋 将补全 ${codes.length} 只股票的历史数据`);
  console.log('⚠️  这可能需要很长时间...\n');

  // 3. 逐个补全（并发5个）
  const CONCURRENCY = 5;
  let completed = 0;
  let failed = 0;

  for (let i = 0; i < codes.length; i += CONCURRENCY) {
    const batch = codes.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (code) => {
        const stock = testChunk[code];
        const existingKlines = stock.k || [];
        const newKlines = await completeStockHistory(code, existingKlines);
        return { code, klines: newKlines };
      })
    );

    for (const { code, klines } of results) {
      if (klines && klines.length > 0) {
        testChunk[code].k = klines;
        completed++;
      } else {
        failed++;
      }
    }

    console.log(`\n📊 进度: ${Math.min(i + CONCURRENCY, codes.length)}/${codes.length}, 成功: ${completed}, 失败: ${failed}`);

    // 每50个保存一次
    if ((i + CONCURRENCY) % 50 === 0) {
      chunks[0].data = compressChunk(testChunk);
      fs.writeFileSync(COMPRESSED_FILE, JSON.stringify(chunks));
      console.log('💾 已保存进度\n');
    }
  }

  // 4. 保存结果
  chunks[0].data = compressChunk(testChunk);
  fs.writeFileSync(COMPRESSED_FILE, JSON.stringify(chunks));

  console.log('\n========================================');
  console.log('✅ 历史数据补全完成!');
  console.log(`   成功: ${completed}`);
  console.log(`   失败: ${failed}`);
  console.log('========================================\n');
}

main().catch(console.error);
