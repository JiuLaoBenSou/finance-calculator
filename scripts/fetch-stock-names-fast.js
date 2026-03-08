/**
 * 快速获取股票中文名称
 * 使用更高并发
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { exec } = require('child_process');

const CHUNKS_DIR = path.join(__dirname, '..', 'data-chunks');
const OUTPUT_FILE = path.join(CHUNKS_DIR, 'stocks.json');

// curl获取数据
function fetchWithCurl(url) {
  return new Promise((resolve, reject) => {
    const cmd = `curl -x "http://127.0.0.1:7890" -s -L --connect-timeout 5 --max-time 10 "${url}"`;
    exec(cmd, { timeout: 15000 }, (error, stdout) => {
      if (error || !stdout) {
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

// 从chunk文件读取所有股票代码
function getAllStockCodes() {
  const indexPath = path.join(CHUNKS_DIR, 'index.json');
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

  const codes = [];
  for (let i = 0; i < index.length; i++) {
    const chunkPath = path.join(CHUNKS_DIR, index[i].filename);
    const chunkContent = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));
    const binary = Buffer.from(chunkContent.data, 'base64');
    const decompressed = zlib.gunzipSync(binary);
    const stockData = JSON.parse(decompressed.toString('utf8'));

    for (const code of Object.keys(stockData)) {
      codes.push(code);
    }
  }
  return [...new Set(codes)];
}

// 批量获取股票名称 - 使用更高并发
async function fetchStockNames(codes) {
  const nameMap = {};
  const CONCURRENCY = 30; // 每次并发30个

  console.log(`总共 ${codes.length} 只股票，使用并发${CONCURRENCY}...\n`);

  // 分批处理
  for (let i = 0; i < codes.length; i += CONCURRENCY) {
    const batch = codes.slice(i, i + CONCURRENCY);
    const progress = Math.min(i + CONCURRENCY, codes.length);

    if (i % 300 === 0) {
      console.log(`进度: ${progress}/${codes.length} (${((progress/codes.length)*100).toFixed(1)}%)`);
    }

    try {
      // 并发请求
      const promises = batch.map(async (code) => {
        const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},day,,,1,qfq`;
        const data = await fetchWithCurl(url);

        if (data && data.data && data.data[code] && data.data[code].qt && data.data[code].qt[code]) {
          return { code, name: data.data[code].qt[code][1] };
        }
        return { code, name: null };
      });

      const results = await Promise.all(promises);
      results.forEach(r => {
        if (r.name) {
          nameMap[r.code] = r.name;
        }
      });
    } catch (e) {
      // 忽略错误继续
    }

    // 每1000个暂停一下
    if (i > 0 && i % 1000 === 0) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n成功获取 ${Object.keys(nameMap).length} 只股票名称`);
  return nameMap;
}

// 主函数
async function main() {
  console.log('从腾讯API获取股票名称...\n');

  // 1. 获取所有股票代码
  console.log('读取股票代码列表...');
  const codes = getAllStockCodes();
  console.log(`共 ${codes.length} 只股票\n`);

  // 2. 获取股票名称
  const nameMap = await fetchStockNames(codes);

  // 3. 读取现有stocks.json并更新名称
  console.log('\n更新股票列表文件...');
  const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));

  const updated = existing.map(s => ({
    code: s.code,
    name: nameMap[s.code] || s.name || s.code
  }));

  // 按代码排序
  updated.sort((a, b) => a.code.localeCompare(b.code));

  // 保存
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(updated));

  // 统计
  const hasNameCount = updated.filter(s => s.name !== s.code).length;
  console.log(`\n完成！`);
  console.log(`总股票数: ${updated.length}`);
  console.log(`有中文名称: ${hasNameCount}`);
  console.log(`文件大小: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(2)} KB`);
}

main().catch(console.error);
