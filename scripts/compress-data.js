/**
 * 压缩股票数据文件 - 分块处理
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(__dirname, '..', 'data-compressed.json');

// 缩短键名
function minifyStockData(data) {
  return {
    c: data.code,
    n: data.name,
    k: data.klines ? data.klines.map(k => [k.date, k.open, k.high, k.low, k.close, k.volume]) : []
  };
}

async function main() {
  const files = fs.readdirSync(DATA_DIR).filter(f =>
    (f.startsWith('sh') || f.startsWith('sz')) && f.endsWith('.json')
  );

  console.log(`Total files: ${files.length}`);

  let totalOriginalSize = 0;
  let totalCompressedSize = 0;
  const chunks = [];
  const chunkSize = 1000; // 每1000个文件一个块
  let chunkData = {};
  let chunkIndex = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(DATA_DIR, file);
    const originalData = fs.readFileSync(filePath, 'utf8');
    totalOriginalSize += originalData.length;

    // 解析并精简
    const data = JSON.parse(originalData);
    const minified = minifyStockData(data);

    const code = file.replace('.json', '');
    chunkData[code] = minified;

    // 达到 chunkSize 或者最后一个文件时保存
    if (Object.keys(chunkData).length >= chunkSize || i === files.length - 1) {
      const jsonStr = JSON.stringify(chunkData);
      const compressed = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'));

      chunks.push({
        index: chunkIndex,
        data: compressed.toString('base64'),
        count: Object.keys(chunkData).length
      });

      totalCompressedSize += compressed.length;
      console.log(`Chunk ${chunkIndex}: ${Object.keys(chunkData).length} files, compressed: ${(compressed.length / 1024 / 1024).toFixed(2)} MB`);

      chunkData = {};
      chunkIndex++;
    }
  }

  // 保存
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(chunks));

  console.log(`\nOriginal size: ${(totalOriginalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Compressed size: ${(totalCompressedSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Reduction: ${(totalCompressedSize / totalOriginalSize * 100).toFixed(1)}%`);
  console.log(`\nSaved to: ${OUTPUT_FILE}`);
  console.log(`Chunks: ${chunks.length}`);
}

main().catch(console.error);
