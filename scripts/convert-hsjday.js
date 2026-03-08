/**
 * 从完整历史数据转换数据
 * 直接输出为多个小文件
 *
 * 使用方法: node scripts/convert-hsjday.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SOURCE_DIR = 'C:/Users/Administrator/Downloads/hsjday';
const OUTPUT_DIR = path.join(__dirname, '..', 'data-chunks');

// 读取通达信.day文件
function readDayFile(filepath) {
  const buffer = fs.readFileSync(filepath);
  const records = [];

  for (let i = 0; i < buffer.length; i += 32) {
    if (i + 32 > buffer.length) break;

    try {
      const dateInt = buffer.readInt32LE(i);
      if (dateInt < 19900101 || dateInt > 20301231) continue;

      const dateStr = String(dateInt);
      const year = parseInt(dateStr.substring(0, 4));
      const month = parseInt(dateStr.substring(4, 6));
      const day = parseInt(dateStr.substring(6, 8));

      if (month < 1 || month > 12 || day < 1 || day > 31) continue;

      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const open = buffer.readInt32LE(i + 4) / 100;
      const high = buffer.readInt32LE(i + 8) / 100;
      const low = buffer.readInt32LE(i + 12) / 100;
      const close = buffer.readInt32LE(i + 16) / 100;
      const volume = buffer.readUInt32LE(i + 20);

      if (open <= 0 || high <= 0 || low <= 0 || close <= 0) continue;

      records.push([date, open, high, low, close, volume]);
    } catch (e) {
      continue;
    }
  }

  records.sort((a, b) => new Date(a[0]) - new Date(b[0]));
  return records;
}

// 扫描目录
function scanStockFiles(dir, prefix) {
  const ldayDir = path.join(dir, 'lday');
  if (!fs.existsSync(ldayDir)) return [];

  const files = fs.readdirSync(ldayDir);
  return files
    .filter(f => f.endsWith('.day'))
    .map(f => ({
      code: prefix + f.replace('.day', '').replace(prefix, ''),
      filepath: path.join(ldayDir, f)
    }));
}

// 压缩
function compressChunk(stockData) {
  const jsonStr = JSON.stringify(stockData);
  const compressed = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'));
  return compressed.toString('base64');
}

async function main() {
  // 创建输出目录
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('🔄 从完整历史数据转换...\n');

  console.log('📂 扫描股票文件...');
  const shFiles = scanStockFiles(path.join(SOURCE_DIR, 'sh'), 'sh');
  const szFiles = scanStockFiles(path.join(SOURCE_DIR, 'sz'), 'sz');
  const bjFiles = scanStockFiles(path.join(SOURCE_DIR, 'bj'), 'bj');

  const allFiles = [...shFiles, ...szFiles, ...bjFiles];
  console.log(`   上海: ${shFiles.length}, 深圳: ${szFiles.length}, 北京: ${bjFiles.length}`);
  console.log(`   总计: ${allFiles.length} 个文件\n`);

  // 排序
  allFiles.sort((a, b) => a.code.localeCompare(b.code));

  // 每400只股票一块，这样每个文件约30-40MB
  const CHUNK_SIZE = 200;
  let chunkIndex = 0;
  let converted = 0;
  let skipped = 0;

  console.log('📝 转换并保存数据...\n');

  // 分批处理
  for (let batchStart = 0; batchStart < allFiles.length; batchStart += CHUNK_SIZE) {
    const batchEnd = Math.min(batchStart + CHUNK_SIZE, allFiles.length);
    const batch = allFiles.slice(batchStart, batchEnd);
    const chunkData = {};

    for (const file of batch) {
      try {
        const klines = readDayFile(file.filepath);

        if (klines.length < 100) {
          skipped++;
          continue;
        }

        chunkData[file.code] = {
          c: file.code,
          n: file.code,
          k: klines
        };

        converted++;
      } catch (e) {
        skipped++;
      }
    }

    // 直接保存这个小文件
    const chunk = {
      index: chunkIndex,
      data: compressChunk(chunkData),
      count: Object.keys(chunkData).length
    };

    fs.writeFileSync(
      path.join(OUTPUT_DIR, `chunk_${chunkIndex}.json`),
      JSON.stringify(chunk)
    );

    console.log(`   块 ${chunkIndex + 1}: ${Object.keys(chunkData).length} 只股票, ${(chunk.data.length / 1024 / 1024).toFixed(2)} MB`);

    // 清空
    for (const key in chunkData) { delete chunkData[key]; }
    chunkIndex++;

    if ((batchEnd) % 2000 === 0 || batchEnd === allFiles.length) {
      console.log(`   进度: ${batchEnd}/${allFiles.length}`);
    }
  }

  console.log(`\n✅ 转换完成: ${converted} 只股票, 跳过 ${skipped} 只\n`);

  // 创建索引文件
  const indexData = [];
  for (let i = 0; i < chunkIndex; i++) {
    const chunkFile = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, `chunk_${i}.json`), 'utf8'));
    indexData.push({
      index: i,
      count: chunkFile.count,
      filename: `chunk_${i}.json`
    });
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'index.json'),
    JSON.stringify(indexData)
  );

  console.log('✅ 数据保存完成!');
  console.log(`   输出目录: ${OUTPUT_DIR}`);
}

main().catch(console.error);
