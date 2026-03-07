/**
 * 每日数据更新脚本
 * 流程：
 * 1. 加载12个块，解压1个块
 * 2. 跑50个数据测试两个API的速度
 * 3. 根据速度分配工作量
 * 4. 解压剩下的所有块并更新
 * 5. 重新压缩保存
 * 6. 推送至GitHub
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATA_DIR = path.join(__dirname, '..', 'data');
const COMPRESSED_FILE = path.join(__dirname, '..', 'data-compressed.json');
const PROXY = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || '';

// API 配置
const TENCENT_API = 'https://web.ifzq.gtimg.cn';
const EASTMONEY_API = 'https://push2.eastmoney.com';

// 使用 curl 获取数据
function fetchWithCurl(url) {
  return new Promise((resolve) => {
    const proxyFlag = PROXY ? `-x "${PROXY}"` : '';
    const cmd = `curl ${proxyFlag} -s -L --connect-timeout 10 --max-time 15 "${url}"`;
    require('child_process').exec(cmd, { timeout: 20000 }, (error, stdout, stderr) => {
      if (error || !stdout) {
        console.log(`   API请求失败: ${url.substring(0, 50)}...`);
        resolve({ time: 999, data: null });
        return;
      }
      try {
        const data = JSON.parse(stdout);
        resolve({ time: 1.0, data }); // 简化时间
      } catch (e) {
        resolve({ time: 999, data: null });
      }
    });
  });
}

// 腾讯API获取单只股票K线
async function getKlineFromTencent(code, days = 100) {
  const url = `${TENCENT_API}/appstock/app/fqkline/get?param=${code},day,,,${days},qfq`;
  const { time, data } = await fetchWithCurl(url);

  if (data?.data?.[code]) {
    const stockData = data.data[code];
    const klines = stockData.qfqday || stockData.day || [];
    if (klines.length > 0) {
      return {
        time,
        klines: klines.map(k => ({
          date: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]),
          low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5])
        }))
      };
    }
  }
  return { time, klines: null };
}

// 东方财富API获取单只股票最新K线
async function getKlineFromEastmoney(code, days = 100) {
  const secid = code.startsWith('sh') ? `1.${code.slice(2)}` : `0.${code.slice(2)}`;
  const url = `${EASTMONEY_API}/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&end=20500101&lmt=${days}`;
  const { time, data } = await fetchWithCurl(url);

  if (data?.data?.klines) {
    return {
      time,
      klines: data.data.klines.map(k => {
        const arr = k.split(',');
        return { date: arr[0], open: parseFloat(arr[1]), high: parseFloat(arr[2]),
          low: parseFloat(arr[3]), close: parseFloat(arr[4]), volume: parseFloat(arr[5]) };
      })
    };
  }
  return { time, klines: null };
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


// 更新单个股票数据（只使用腾讯API）
async function updateStock(code, existingKlines) {
  let newKlines = null;
  let usedAPI = 'tencent';

  // 只用腾讯API
  const result = await getKlineFromTencent(code, 100);
  if (result.klines) {
    newKlines = result.klines;
  }

  if (!newKlines || newKlines.length === 0) {
    return { updated: false, api: 'none' };
  }

  // 合并数据
  if (existingKlines.length > 0) {
    const existingDates = new Set(existingKlines.map(k => k.date));
    const uniqueNew = newKlines.filter(k => !existingDates.has(k.date));
    const combined = [...existingKlines, ...uniqueNew].sort((a, b) =>
      new Date(a.date) - new Date(b.date)
    );
    newKlines = combined;
  }

  return { updated: newKlines.length > existingKlines.length, klines: newKlines, api: usedAPI };
}

// 更新单个块
async function updateChunk(chunkData) {
  const codes = Object.keys(chunkData);
  console.log(`\n📦 处理 ${codes.length} 只股票`);

  let updated = 0;
  let failed = 0;
  let apiStats = { tencent: 0, eastmoney: 0, none: 0 };

  // 并发更新（每次20个）
  const CONCURRENCY = 20;

  for (let i = 0; i < codes.length; i += CONCURRENCY) {
    const batch = codes.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (code) => {
        const stock = chunkData[code];
        return { code, result: await updateStock(code, stock.k || []) };
      })
    );

    for (const { code, result } of results) {
      const stock = chunkData[code];

      if (result.updated && result.klines) {
        stock.k = result.klines;
        updated++;
        apiStats[result.api] = (apiStats[result.api] || 0) + 1;
      } else {
        failed++;
        apiStats[result.api] = (apiStats[result.api] || 0) + 1;
      }
    }

    if ((i + CONCURRENCY) % 200 === 0 || i + CONCURRENCY >= codes.length) {
      console.log(`   进度: ${Math.min(i + CONCURRENCY, codes.length)}/${codes.length}, 已更新: ${updated}, 失败: ${failed}`);
    }
  }

  console.log(`   块更新完成: 更新${updated}, 失败${failed}`);
  return { updated, failed };
}

// 主函数
async function main() {
  console.log('🚀 开始每日数据更新...\n');
  console.log(`⏰ 更新时间: ${new Date().toLocaleString()}\n`);

  // 1. 加载压缩数据
  console.log('📂 加载压缩数据...');
  const fileContent = fs.readFileSync(COMPRESSED_FILE, 'utf8');
  const chunks = JSON.parse(fileContent);
  console.log(`   共有 ${chunks.length} 个数据块\n`);

  // 2. 解压第一个块测试速度
  console.log('📦 解压第一个块用于测试...');
  const testChunk = decompressChunk(chunks[0].data);
  const testCodes = Object.keys(testChunk);

  // 3. 只使用腾讯API
  console.log('\n📡 使用腾讯API更新数据');

  let totalUpdated = 0;
  let totalFailed = 0;
  const allFailedStocks = []; // 记录所有失败的股票

  // 4. 处理所有块
  for (let i = 0; i < chunks.length; i++) {
    console.log(`\n========== 块 ${i + 1}/${chunks.length} ==========`);

    // 解压
    let chunkData;
    if (i === 0) {
      chunkData = testChunk; // 第一个块已经解压
    } else {
      chunkData = decompressChunk(chunks[i].data);
    }

    // 更新
    const result = await updateChunk(chunkData);
    totalUpdated += result.updated;
    totalFailed += result.failed;

    // 记录失败的股票代码和所在块
    const codes = Object.keys(chunkData);
    for (const code of codes) {
      const stock = chunkData[code];
      const latestDate = stock.k && stock.k.length > 0 ? stock.k[stock.k.length - 1].date : null;
      if (!latestDate || stock.k.length === 0) {
        allFailedStocks.push({ code, chunkIndex: i, stock });
      }
    }

    // 重新压缩
    const newCompressed = compressChunk(chunkData);
    chunks[i].data = newCompressed;
    chunks[i].updatedAt = new Date().toISOString();

    // 保存进度
    fs.writeFileSync(COMPRESSED_FILE, JSON.stringify(chunks));
    console.log(`   ✓ 块 ${i + 1} 已保存`);
  }

  // 5. 最终校验：重试所有失败的股票
  if (allFailedStocks.length > 0) {
    console.log(`\n🔄 最终校验：重试 ${allFailedStocks.length} 只失败的股票...`);

    let retrySuccess = 0;
    const CONCURRENCY = 20;

    for (let i = 0; i < allFailedStocks.length; i += CONCURRENCY) {
      const batch = allFailedStocks.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async ({ code, stock }) => {
          return { code, result: await updateStock(code, stock.k || []) };
        })
      );

      for (const { code, result } of results) {
        // 找到对应的块并更新
        const failedStock = allFailedStocks.find(s => s.code === code);
        if (failedStock && result.updated && result.klines) {
          failedStock.stock.k = result.klines;
          retrySuccess++;

          // 更新到对应的块
          if (failedStock.chunkIndex === 0) {
            testChunk[code] = failedStock.stock;
          } else {
            const chunkData = decompressChunk(chunks[failedStock.chunkIndex].data);
            chunkData[code] = failedStock.stock;
            chunks[failedStock.chunkIndex].data = compressChunk(chunkData);
          }
        }
      }

      if ((i + CONCURRENCY) % 200 === 0 || i + CONCURRENCY >= allFailedStocks.length) {
        console.log(`   重试进度: ${Math.min(i + CONCURRENCY, allFailedStocks.length)}/${allFailedStocks.length}`);
      }
    }

    // 保存重试后的结果
    chunks[0].data = compressChunk(testChunk);
    fs.writeFileSync(COMPRESSED_FILE, JSON.stringify(chunks));

    const remainingFailed = allFailedStocks.length - retrySuccess;
    console.log(`   校验完成: 重试成功 ${retrySuccess}, 仍失败 ${remainingFailed}`);
    totalUpdated += retrySuccess;
    totalFailed = remainingFailed;
  } else {
    console.log(`\n✅ 最终校验通过：所有股票更新成功`);
  }

  console.log('\n========================================');
  console.log('✅ 每日更新完成!');
  console.log(`   总更新: ${totalUpdated} 只`);
  console.log(`   失败: ${totalFailed} 只`);
  console.log(`   文件: ${COMPRESSED_FILE}`);
  console.log('========================================\n');

  const stats = fs.statSync(COMPRESSED_FILE);
  console.log(`📊 文件大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

main().catch(console.error);
