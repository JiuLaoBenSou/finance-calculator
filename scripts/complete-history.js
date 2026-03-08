/**
 * 补全股票历史数据
 * 每次请求800天，多次请求直到没有更早数据
 * 处理所有12个块
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
      // 使用数组格式: [date, open, high, low, close, volume]
      return klines.map(k => [k[0], parseFloat(k[1]), parseFloat(k[2]), parseFloat(k[3]), parseFloat(k[4]), parseFloat(k[5])]);
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

  // 从最早日期往前追溯，每次800天
  const allKlines = existingKlines ? [...existingKlines] : [];
  // 从 earliestDate 往前 800 天开始
  let currentStartDate = '';
  if (earliestDate) {
    const date = new Date(earliestDate);
    date.setDate(date.getDate() - 800);
    currentStartDate = date.toISOString().split('T')[0];
  }
  const DAYS_PER_REQUEST = 800;
  const MAX_RETRIES = 10;

  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    let startDate = currentStartDate;
    if (currentStartDate) {
      const date = new Date(currentStartDate);
      date.setDate(date.getDate() - DAYS_PER_REQUEST);
      startDate = date.toISOString().split('T')[0];
    }

    const klines = await getKline(code, DAYS_PER_REQUEST, startDate);

    if (!klines || klines.length === 0) {
      break;
    }

    const newEarliest = klines[0].date;
    if (newEarliest === currentStartDate || (currentStartDate && new Date(newEarliest) >= new Date(currentStartDate))) {
      break;
    }

    const existingDates = new Set(allKlines.map(k => k.date));
    const uniqueNew = klines.filter(k => !existingDates.has(k.date));

    if (uniqueNew.length === 0) {
      break;
    }

    allKlines.unshift(...uniqueNew);
    currentStartDate = newEarliest;

    if (klines.length < DAYS_PER_REQUEST) {
      break;
    }

    await new Promise(r => setTimeout(r, 50));
  }

  allKlines.sort((a, b) => new Date(a.date) - new Date(b.date));
  return allKlines;
}

// 主函数
async function main() {
  console.log('🚀 开始补全所有股票的历史数据...\n');

  // 1. 加载压缩数据
  console.log('📂 加载压缩数据...');
  const fileContent = fs.readFileSync(COMPRESSED_FILE, 'utf8');
  const chunks = JSON.parse(fileContent);
  console.log(`   共有 ${chunks.length} 个数据块\n`);

  const CONCURRENCY = 10; // 每块并发数
  let totalCompleted = 0;
  let totalFailed = 0;

  // 2. 处理所有块
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    console.log(`\n========== 处理块 ${chunkIndex + 1}/${chunks.length} ==========`);

    const chunkData = decompressChunk(chunks[chunkIndex].data);
    const codes = Object.keys(chunkData);
    console.log(`   该块 ${codes.length} 只股票\n`);

    let completed = 0;
    let failed = 0;

    // 逐个处理
    for (let i = 0; i < codes.length; i += CONCURRENCY) {
      const batch = codes.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (code) => {
          const stock = chunkData[code];
          const existingKlines = stock.k || [];
          const newKlines = await completeStockHistory(code, existingKlines);
          return { code, klines: newKlines };
        })
      );

      for (const { code, klines } of results) {
        if (klines && klines.length > 0) {
          chunkData[code].k = klines;
          completed++;
          totalCompleted++;
        } else {
          failed++;
          totalFailed++;
        }
      }

      if ((i + CONCURRENCY) % 100 === 0 || i + CONCURRENCY >= codes.length) {
        console.log(`   进度: ${Math.min(i + CONCURRENCY, codes.length)}/${codes.length}, 成功: ${completed}, 失败: ${failed}`);
      }
    }

    // 保存该块
    chunks[chunkIndex].data = compressChunk(chunkData);
    fs.writeFileSync(COMPRESSED_FILE, JSON.stringify(chunks));
    console.log(`   ✅ 块 ${chunkIndex + 1} 已保存`);
  }

  console.log('\n========================================');
  console.log('✅ 历史数据补全完成!');
  console.log(`   总成功: ${totalCompleted}`);
  console.log(`   总失败: ${totalFailed}`);
  console.log('========================================\n');
}

main().catch(console.error);
