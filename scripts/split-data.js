/**
 * 将压缩数据拆分成多个小文件
 * 使用字符流处理
 *
 * 使用方法: node scripts/split-data.js
 */

const fs = require('fs');
const path = require('path');

const SOURCE_FILE = path.join(__dirname, '..', 'data-compressed.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'data-chunks');

async function main() {
  console.log('🔄 拆分数据文件...\n');

  // 创建输出目录
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const fileSize = fs.statSync(SOURCE_FILE).size;
  console.log(`   文件大小: ${(fileSize / 1024 / 1024).toFixed(2)} MB\n`);

  // 分块读取文件
  const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
  let fileContent = '';
  let chunks = [];
  let braceCount = 0;
  let currentChunk = '';
  let inArray = false;
  let lastPercent = 0;

  let bytesRead = 0;
  const fd = fs.openSync(SOURCE_FILE, 'r');
  const buffer = Buffer.alloc(CHUNK_SIZE);

  while (bytesRead < fileSize) {
    const read = fs.readSync(fd, buffer, 0, CHUNK_SIZE, bytesRead);
    if (read <= 0) break;

    const chunk = buffer.toString('utf8', 0, read);
    fileContent += chunk;
    bytesRead += read;

    // 处理已读取的内容
    if (inArray) {
      for (const char of chunk) {
        currentChunk += char;
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;

        if (braceCount === 0 && currentChunk.trim()) {
          try {
            const data = JSON.parse(currentChunk.trim());
            chunks.push(data);
            currentChunk = '';
          } catch (e) {
            // 忽略
          }
        }
      }
    }

    // 检查是否开始
    if (!inArray) {
      const idx = fileContent.indexOf('[');
      if (idx >= 0) {
        inArray = true;
        currentChunk = fileContent.substring(idx + 1);
        // 处理开头
        for (const char of currentChunk) {
          if (char === '{') braceCount++;
          if (char === '}') braceCount--;
          if (braceCount === 0 && currentChunk.trim()) {
            try {
              const data = JSON.parse(currentChunk.trim());
              chunks.push(data);
              currentChunk = '';
            } catch (e) {
              // 忽略
            }
          }
        }
      }
    }

    // 清理不再需要的内容
    if (chunks.length > 0 && currentChunk.length > fileSize / 10) {
      const startIdx = fileContent.indexOf('{"index":', Math.max(0, fileContent.length - CHUNK_SIZE));
      if (startIdx > 0) {
        fileContent = fileContent.substring(startIdx);
      }
    }

    const percent = Math.floor((bytesRead / fileSize) * 100);
    if (percent !== lastPercent) {
      process.stdout.write(`   进度: ${percent}% (${chunks.length} 个块)\r`);
      lastPercent = percent;
    }
  }

  fs.closeSync(fd);

  console.log(`\n\n   共解析 ${chunks.length} 个块\n`);

  // 保存索引文件
  const indexData = chunks.map((chunk, i) => ({
    index: i,
    count: chunk.count,
    filename: `chunk_${i}.json`
  }));

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'index.json'),
    JSON.stringify(indexData)
  );
  console.log('   索引文件已保存\n');

  // 保存每个块
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    fs.writeFileSync(
      path.join(OUTPUT_DIR, `chunk_${i}.json`),
      JSON.stringify(chunk)
    );
    console.log(`   保存块 ${i}: ${chunk.count} 只股票, ${(chunk.data.length / 1024 / 1024).toFixed(2)} MB`);
  }

  console.log('\n✅ 拆分完成!');
  console.log(`   输出目录: ${OUTPUT_DIR}`);
}

main().catch(console.error);
