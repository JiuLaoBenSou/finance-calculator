/**
 * 修复数据格式：将对象格式转为数组格式
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const COMPRESSED_FILE = path.join(__dirname, '..', 'data-compressed.json');

function decompressChunk(compressedData) {
  const buffer = Uint8Array.from(atob(compressedData), c => c.charCodeAt(0));
  const decompressed = zlib.gunzipSync(buffer);
  return JSON.parse(decompressed.toString('utf8'));
}

function compressChunk(stockData) {
  const jsonStr = JSON.stringify(stockData);
  const compressed = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'));
  return compressed.toString('base64');
}

async function main() {
  console.log('🔧 修复数据格式...\n');

  const fileContent = fs.readFileSync(COMPRESSED_FILE, 'utf8');
  const chunks = JSON.parse(fileContent);

  let fixed = 0;
  let totalStocks = 0;

  for (let i = 0; i < chunks.length; i++) {
    console.log(`   处理块 ${i + 1}/${chunks.length}...`);
    const chunkData = decompressChunk(chunks[i].data);

    for (const code of Object.keys(chunkData)) {
      const stock = chunkData[code];
      if (!stock.k) continue;

      totalStocks++;

      // 检查是否是对象格式
      if (stock.k.length > 0 && typeof stock.k[0] === 'object' && stock.k[0] !== null && !Array.isArray(stock.k[0])) {
        // 转换为数组格式
        stock.k = stock.k.map(k => [k.date, k.open, k.high, k.low, k.close, k.volume]);
        fixed++;
      }
    }

    chunks[i].data = compressChunk(chunkData);
  }

  fs.writeFileSync(COMPRESSED_FILE, JSON.stringify(chunks));

  console.log(`\n✅ 修复完成!`);
  console.log(`   总股票: ${totalStocks}`);
  console.log(`   修复格式: ${fixed}`);
}

main().catch(console.error);
