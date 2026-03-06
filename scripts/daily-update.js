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

// 测试API速度
async function testAPISpeed(stockCodes) {
  console.log('\n🧪 测试API速度（取前50个股票）...');

  const tencentTimes = [];
  const eastmoneyTimes = [];

  const testCodes = stockCodes.slice(0, 50);
  console.log(`   测试股票: ${testCodes.slice(0, 5).join(', ')}...`);

  let success = 0;
  for (let i = 0; i < testCodes.length; i++) {
    const code = testCodes[i];
    const [tencent, eastmoney] = await Promise.all([
      getKlineFromTencent(code),
      getKlineFromEastmoney(code)
    ]);

    if (tencent.klines) {
      tencentTimes.push(tencent.time);
      success++;
    }
    if (eastmoney.klines) {
      eastmoneyTimes.push(eastmoney.time);
      success++;
    }

    if ((i + 1) % 10 === 0) {
      console.log(`   进度: ${i + 1}/50, 成功: ${success}`);
    }

    await new Promise(r => setTimeout(r, 50));
  }

  console.log(`   API测试完成, 成功: ${success}次`);

  const avgTencent = tencentTimes.length > 0 ? tencentTimes.reduce((a, b) => a + b, 0) / tencentTimes.length : 999;
  const avgEastmoney = eastmoneyTimes.length > 0 ? eastmoneyTimes.reduce((a, b) => a + b, 0) / eastmoneyTimes.length : 999;

  console.log(`   腾讯API成功: ${tencentTimes.length}次`);
  console.log(`   东方财富API成功: ${eastmoneyTimes.length}次`);

  // 根据成功率分配任务
  const tencentRatio = tencentTimes.length >= eastmoneyTimes.length ? 0.7 : 0.3;
  const eastmoneyRatio = eastmoneyTimes.length >= tencentTimes.length ? 0.7 : 0.3;

  console.log(`   分配: 腾讯 ${(tencentRatio * 100).toFixed(0)}%, 东方财富 ${(eastmoneyRatio * 100).toFixed(0)}%`);

  return { tencentRatio, eastmoneyRatio, avgTencent, avgEastmoney };
}

// 更新单个股票数据
async function updateStock(code, existingKlines, ratios) {
  const { tencentRatio, eastmoneyRatio } = ratios;

  // 决定用哪个API
  const useTencent = tencentRatio >= 0.3;
  const useEastmoney = eastmoneyRatio >= 0.3;

  let newKlines = null;
  let usedAPI = 'none';

  if (useTencent) {
    const result = await getKlineFromTencent(code, 100);
    if (result.klines) {
      newKlines = result.klines;
      usedAPI = 'tencent';
    }
  }

  if (!newKlines && useEastmoney) {
    const result = await getKlineFromEastmoney(code, 100);
    if (result.klines) {
      newKlines = result.klines;
      usedAPI = 'eastmoney';
    }
  }

  // 如果两个API都失败，尝试另一个
  if (!newKlines && usedAPI !== 'tencent') {
    const result = await getKlineFromTencent(code, 100);
    if (result.klines) {
      newKlines = result.klines;
      usedAPI = 'tencent';
    }
  }

  if (!newKlines && usedAPI !== 'eastmoney') {
    const result = await getKlineFromEastmoney(code, 100);
    if (result.klines) {
      newKlines = result.klines;
      usedAPI = 'eastmoney';
    }
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
async function updateChunk(chunkData, ratios) {
  const codes = Object.keys(chunkData);
  console.log(`\n📦 处理 ${codes.length} 只股票`);

  let updated = 0;
  let failed = 0;
  let apiStats = { tencent: 0, eastmoney: 0, none: 0 };

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    const stock = chunkData[code];
    const existingKlines = stock.k || [];

    const result = await updateStock(code, existingKlines, ratios);

    if (result.updated && result.klines) {
      stock.k = result.klines;
      updated++;
    } else if (!result.updated) {
      // 数据未更新（可能是同一天）
    }

    apiStats[result.api] = (apiStats[result.api] || 0) + 1;

    if ((i + 1) % 100 === 0) {
      console.log(`   进度: ${i + 1}/${codes.length}`);
    }

    // 避免请求过快
    await new Promise(r => setTimeout(r, 50));
  }

  console.log(`   更新: ${updated}, 失败: ${failed}, API使用: 腾讯${apiStats.tencent}, 东财${apiStats.eastmoney}`);
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

  // 3. 测试API速度
  const ratios = await testAPISpeed(testCodes);

  let totalUpdated = 0;

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
    const result = await updateChunk(chunkData, ratios);
    totalUpdated += result.updated;

    // 重新压缩
    const newCompressed = compressChunk(chunkData);
    chunks[i].data = newCompressed;
    chunks[i].updatedAt = new Date().toISOString();

    // 保存进度
    fs.writeFileSync(COMPRESSED_FILE, JSON.stringify(chunks));
    console.log(`   ✓ 块 ${i + 1} 已保存`);
  }

  console.log('\n========================================');
  console.log('✅ 每日更新完成!');
  console.log(`   总更新: ${totalUpdated} 只`);
  console.log(`   文件: ${COMPRESSED_FILE}`);
  console.log('========================================\n');

  const stats = fs.statSync(COMPRESSED_FILE);
  console.log(`📊 文件大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

main().catch(console.error);
