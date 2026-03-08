/**
 * 压缩股票数据文件
 * 使用 gzip 压缩每个股票文件
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(__dirname, '..', 'data-compressed.json');

async function compressFile(filePath) {
  const data = fs.readFileSync(filePath);
  return zlib.gzipSync(data);
}

async function main() {
  const files = fs.readdirSync(DATA_DIR).filter(f =>
    (f.startsWith('sh') || f.startsWith('sz')) && f.endsWith('.json')
  );

  console.log(`Total files: ${files.length}`);

  const compressedData = {};
  let totalOriginalSize = 0;
  let totalCompressedSize = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(DATA_DIR, file);
    const originalData = fs.readFileSync(filePath);
    const compressedDataBuf = zlib.gzipSync(originalData);

    const code = file.replace('.json', '');
    compressedData[code] = compressedDataBuf.toString('base64');

    totalOriginalSize += originalData.length;
    totalCompressedSize += compressedDataBuf.length;

    if ((i + 1) % 1000 === 0) {
      console.log(`Progress: ${i + 1}/${files.length}`);
    }
  }

  console.log(`\nOriginal size: ${(totalOriginalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Compressed size: ${(totalCompressedSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Ratio: ${(totalCompressedSize / totalOriginalSize * 100).toFixed(1)}%`);

  // 保存为 JSON 文件
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(compressedData));
  console.log(`\nSaved to: ${OUTPUT_FILE}`);
  console.log(`File size: ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2)} MB`);
}

main().catch(console.error);
