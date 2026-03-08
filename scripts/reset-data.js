/**
 * 重置数据：从备份恢复并重新压缩
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BACKUP_DIR = 'C:/Users/Administrator/Desktop/stock-data-backup/data';
const OUTPUT_FILE = path.join(__dirname, '..', 'data-compressed.json');

async function main() {
  console.log('🔄 从备份恢复数据...\n');

  if (!fs.existsSync(BACKUP_DIR)) {
    console.log('错误: 备份目录不存在');
    return;
  }

  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json'));
  console.log(`   找到 ${files.length} 个股票文件\n`);

  const CHUNK_SIZE = 1000;
  const chunks = [];

  for (let i = 0; i < Math.ceil(files.length / CHUNK_SIZE); i++) {
    const chunkFiles = files.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const chunkData = {};

    console.log(`   处理块 ${i + 1}: ${chunkFiles.length} 个文件`);

    for (const file of chunkFiles) {
      const code = file.replace('.json', '');
      try {
        const data = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, file), 'utf8'));

        chunkData[code] = {
          c: code,
          n: data.name || code,
          k: data.klines ? data.klines.map(k => [k.date, k.open, k.high, k.low, k.close, k.volume]) : []
        };
      } catch (e) {
        // 跳过错误文件
      }
    }

    const jsonStr = JSON.stringify(chunkData);
    const compressed = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'));

    chunks.push({
      index: i,
      data: compressed.toString('base64'),
      count: Object.keys(chunkData).length
    });

    console.log(`   块 ${i + 1} 压缩完成: ${(compressed.length / 1024 / 1024).toFixed(2)} MB`);
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(chunks));

  const stats = fs.statSync(OUTPUT_FILE);
  console.log(`\n✅ 数据重置完成!`);
  console.log(`   文件: ${OUTPUT_FILE}`);
  console.log(`   大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

main().catch(console.error);
