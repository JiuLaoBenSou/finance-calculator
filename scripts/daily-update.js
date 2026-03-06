/**
 * 每日数据更新脚本
 * 流程：解压块 → 腾讯API更新 → 东方财富API更新 → 重新压缩 → 保存
 *
 * 使用方法: node scripts/daily-update.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATA_DIR = path.join(__dirname, '..', 'data');
const COMPRESSED_FILE = path.join(__dirname, '..', 'data-compressed.json');
// 代理配置（本地开发使用，GitHub Actions 中为空）
const PROXY = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || '';

// API 配置
const TENCENT_API = 'https://web.ifzq.gtimg.cn';
const EASTMONEY_API = 'https://push2.eastmoney.com';

// 使用 curl 获取数据
function fetchWithCurl(url) {
  return new Promise((resolve, reject) => {
    const proxyFlag = PROXY ? `-x "${PROXY}"` : '';
    const cmd = `curl ${proxyFlag} -s -L "${url}"`;
    require('child_process').exec(cmd, { timeout: 30000 }, (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        resolve(null);
      }
    });
  });
}

// 腾讯API获取单只股票K线
async function getKlineFromTencent(code, days = 100) {
  try {
    const url = `${TENCENT_API}/appstock/app/fqkline/get?param=${code},day,,,${days},qfq`;
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
  } catch (e) {
    return null;
  }
}

// 东方财富API获取单只股票最新K线
async function getKlineFromEastmoney(code, days = 100) {
  try {
    const secid = code.startsWith('sh') ? `1.${code.slice(2)}` : `0.${code.slice(2)}`;
    const url = `${EASTMONEY_API}/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&end=20500101&lmt=${days}`;
    const data = await fetchWithCurl(url);

    if (data?.data?.klines) {
      return data.data.klines.map(k => {
        const arr = k.split(',');
        return {
          date: arr[0],
          open: parseFloat(arr[1]),
          high: parseFloat(arr[2]),
          low: parseFloat(arr[3]),
          close: parseFloat(arr[4]),
          volume: parseFloat(arr[5])
        };
      });
    }
    return null;
  } catch (e) {
    return null;
  }
}

// 获取单只股票最新数据（腾讯+东方财富双源校验）
async function getLatestKlines(code, existingKlines = []) {
  // 腾讯API获取
  const tencentKlines = await getKlineFromTencent(code, 100);
  // 东方财富API获取
  const eastmoneyKlines = await getKlineFromEastmoney(code, 100);

  // 选择更长的时间序列
  let newKlines = tencentKlines?.length >= eastmoneyKlines?.length ? tencentKlines : eastmoneyKlines;

  if (!newKlines || newKlines.length === 0) {
    return existingKlines;
  }

  // 如果已有数据，合并（去重）
  if (existingKlines.length > 0) {
    const existingDates = new Set(existingKlines.map(k => k.date));
    const uniqueNew = newKlines.filter(k => !existingDates.has(k.date));
    // 按日期排序合并
    const combined = [...existingKlines, ...uniqueNew].sort((a, b) =>
      new Date(a.date) - new Date(b.date)
    );
    return combined;
  }

  return newKlines;
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

// 更新单个块的数据
async function updateChunk(chunkData, chunkIndex) {
  const codes = Object.keys(chunkData);
  console.log(`\n📦 块 ${chunkIndex}: ${codes.length} 只股票`);

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    const stock = chunkData[code];

    // 已有K线数据
    const existingKlines = stock.k || [];

    // 获取最新数据
    const newKlines = await getLatestKlines(code, existingKlines);

    if (newKlines.length > existingKlines.length) {
      // 有新数据
      stock.k = newKlines;
      updated++;

      if (updated % 50 === 0) {
        console.log(`  ✓ 已更新 ${updated} 只`);
      }
    } else if (newKlines.length > 0 && newKlines.length === existingKlines.length) {
      // 数据日期相同，无新数据
    } else {
      failed++;
    }

    // 避免请求过快
    if (i % 10 === 0) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log(`  块 ${chunkIndex} 更新完成: ${updated} 只更新, ${failed} 只失败`);
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

  let totalUpdated = 0;
  let totalFailed = 0;

  // 2. 逐块处理
  for (let i = 0; i < chunks.length; i++) {
    console.log(`\n========== 正在处理块 ${i + 1}/${chunks.length} ==========`);

    // 解压
    const chunkData = decompressChunk(chunks[i].data);

    // 更新
    const result = await updateChunk(chunkData, i);
    totalUpdated += result.updated;
    totalFailed += result.failed;

    // 重新压缩
    const newCompressed = compressChunk(chunkData);
    chunks[i].data = newCompressed;
    chunks[i].updatedAt = new Date().toISOString();

    // 保存进度（每处理完一块就保存）
    fs.writeFileSync(COMPRESSED_FILE, JSON.stringify(chunks));
    console.log(`   ✓ 块 ${i + 1} 已保存`);
  }

  console.log('\n========================================');
  console.log('✅ 每日更新完成!');
  console.log(`   总更新: ${totalUpdated} 只`);
  console.log(`   失败: ${totalFailed} 只`);
  console.log(`   文件: ${COMPRESSED_FILE}`);
  console.log('========================================\n');

  // 输出文件大小
  const stats = fs.statSync(COMPRESSED_FILE);
  console.log(`📊 文件大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

main().catch(console.error);
