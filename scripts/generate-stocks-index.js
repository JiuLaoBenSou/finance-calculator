/**
 * 生成股票列表索引文件
 * 只包含股票代码和名称，不包含K线数据
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CHUNKS_DIR = path.join(__dirname, '..', 'data-chunks');
const OUTPUT_FILE = path.join(CHUNKS_DIR, 'stocks.json');

async function main() {
  console.log('生成股票列表索引文件...\n');

  const indexPath = path.join(CHUNKS_DIR, 'index.json');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

  const allStocks = [];
  const stockSet = new Set(); // 去重

  for (let i = 0; i < index.length; i++) {
    const chunk = index[i];
    console.log(`处理 chunk ${i}: ${chunk.filename}...`);

    const chunkPath = path.join(CHUNKS_DIR, chunk.filename);
    const chunkContent = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));

    // 解压数据
    const binary = Buffer.from(chunkContent.data, 'base64');
    const decompressed = zlib.gunzipSync(binary);
    const stockData = JSON.parse(decompressed.toString('utf8'));

    // 提取股票代码和名称
    for (const [code, stock] of Object.entries(stockData)) {
      if (!stockSet.has(code)) {
        stockSet.add(code);
        allStocks.push({
          code: code,
          name: stock.n || stock.c || code
        });
      }
    }
  }

  // 按代码排序
  allStocks.sort((a, b) => a.code.localeCompare(b.code));

  // 保存
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allStocks));

  console.log(`\n完成！共 ${allStocks.length} 只股票`);
  console.log(`保存到: ${OUTPUT_FILE}`);
  console.log(`文件大小: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(2)} KB`);
}

main().catch(console.error);
