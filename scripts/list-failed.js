/**
 * 列出失败的股票
 */
const zlib = require('zlib');
const fs = require('fs');
const chunks = JSON.parse(fs.readFileSync('data-compressed.json', 'utf8'));

let failed = [];
chunks.forEach((chunk, i) => {
  const data = JSON.parse(zlib.gunzipSync(Buffer.from(chunk.data, 'base64')).toString('utf8'));
  Object.keys(data).forEach(code => {
    const stock = data[code];
    const count = stock.k ? stock.k.length : 0;
    // 数据少于100天的视为失败
    if (count < 100) {
      failed.push({ code, name: stock.n, count });
    }
  });
});

console.log(`\n失败的股票共 ${failed.length} 只:\n`);
failed.forEach(f => {
  console.log(`${f.code}  ${f.name} (${f.count}天)`);
});
