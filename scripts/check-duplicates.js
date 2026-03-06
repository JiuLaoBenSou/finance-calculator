/**
 * 检查并移除重复的股票数据
 * 保留名称相同的多只股票中代码较短的哪一个
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const COMPRESSED_FILE = path.join(__dirname, '..', 'data-compressed.json');

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

async function main() {
  console.log('🔍 检查重复股票数据...\n');

  // 加载压缩数据
  const fileContent = fs.readFileSync(COMPRESSED_FILE, 'utf8');
  const chunks = JSON.parse(fileContent);

  const allStocks = {};
  const duplicates = [];

  // 遍历所有块，找出所有股票
  for (let i = 0; i < chunks.length; i++) {
    console.log(`   检查块 ${i + 1}/${chunks.length}...`);
    const chunkData = decompressChunk(chunks[i].data);

    for (const code of Object.keys(chunkData)) {
      const stock = chunkData[code];
      const name = stock.n || '';

      if (!name) continue;

      // 按名称分组
      if (!allStocks[name]) {
        allStocks[name] = [];
      }
      allStocks[name].push({ code, chunkIndex: i, stock });
    }
  }

  console.log(`\n📊 共 ${Object.keys(allStocks).length} 个不同的股票名称`);

  // 找出重复的
  for (const name of Object.keys(allStocks)) {
    const stocks = allStocks[name];
    if (stocks.length > 1) {
      console.log(`\n🔴 重复: ${name}`);
      stocks.forEach(s => console.log(`   - ${s.code} (块 ${s.chunkIndex + 1})`));

      // 保留代码较短的（比如 sh601398 而不是 sh601398_compact）
      stocks.sort((a, b) => a.code.length - b.code.length);
      const keep = stocks[0];
      const remove = stocks.slice(1);

      duplicates.push({ name, keep, remove });
    }
  }

  console.log(`\n\n📋 共发现 ${duplicates.length} 组重复数据`);

  if (duplicates.length === 0) {
    console.log('✅ 没有重复数据');
    return;
  }

  // 询问是否删除
  console.log('\n是否删除重复数据？(输入 yes 确认)');
  const answer = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  answer.question('', (response) => {
    answer.close();

    if (response.toLowerCase() !== 'yes') {
      console.log('❌ 已取消');
      return;
    }

    // 删除重复数据
    for (const { name, remove } of duplicates) {
      for (const r of remove) {
        console.log(`   删除: ${r.code}`);

        // 从对应块中删除
        const chunkData = decompressChunk(chunks[r.chunkIndex].data);
        delete chunkData[r.code];
        chunks[r.chunkIndex].data = compressChunk(chunkData);
      }
    }

    // 保存
    fs.writeFileSync(COMPRESSED_FILE, JSON.stringify(chunks));

    console.log(`\n✅ 已删除 ${duplicates.reduce((sum, d) => sum + d.remove.length, 0)} 个重复数据`);
  });
}

main().catch(console.error);
