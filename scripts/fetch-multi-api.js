/**
 * 智能自适应双API获取股票数据
 * 根据各API速度动态调整工作量
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PROXY = process.env.PROXY || 'http://127.0.0.1:7890';
const CONCURRENCY = process.env.GITHUB_ACTIONS ? 30 : 15;
const SPEED_TEST_SAMPLES = 50; // 速度测试样本数

// 腾讯财经 API
function fetchTencent(code) {
  return new Promise((resolve) => {
    const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},day,,,800,qfq`;
    const proxy = PROXY && PROXY.length > 0 ? `-x "${PROXY}"` : '';
    const cmd = `curl --noproxy "*" ${proxy} -s -L "${url}"`;
    const startTime = Date.now();

    exec(cmd, { timeout: 15000 }, (error, stdout) => {
      const timeUsed = Date.now() - startTime;
      try {
        const data = JSON.parse(stdout);
        if (data.data && data.data[code]) {
          const stockData = data.data[code];
          const name = stockData.qt && stockData.qt[code] ? stockData.qt[code][1] : '';
          const klines = stockData.qfqday ? stockData.qfqday.map(k => ({
            date: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]),
            low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5])
          })) : [];
          if (name) {
            resolve({ code, name, klines, success: true, time: timeUsed, api: 'tencent' });
            return;
          }
        }
        resolve({ code, success: false, time: timeUsed, api: 'tencent' });
      } catch (e) {
        resolve({ code, success: false, time: timeUsed, api: 'tencent' });
      }
    });
  });
}

// 东方财富 API
function fetchEastmoney(code) {
  return new Promise((resolve) => {
    const secid = code.startsWith('sh') ? `1.${code.slice(2)}` : `0.${code.slice(2)}`;
    const url = `https://push2.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&end=20500101&lmt=800`;
    const proxy = PROXY && PROXY.length > 0 ? `-x "${PROXY}"` : '';
    const cmd = `curl --noproxy "*" ${proxy} -s -L "${url}"`;
    const startTime = Date.now();

    exec(cmd, { timeout: 15000 }, (error, stdout) => {
      const timeUsed = Date.now() - startTime;
      try {
        const data = JSON.parse(stdout);
        if (data.data && data.data.klines && data.data.name) {
          const klines = data.data.klines.map(k => {
            const arr = k.split(',');
            return {
              date: arr[0], open: parseFloat(arr[1]), high: parseFloat(arr[2]),
              low: parseFloat(arr[3]), close: parseFloat(arr[4]), volume: parseFloat(arr[5])
            };
          });
          resolve({ code, name: data.data.name, klines, success: true, time: timeUsed, api: 'eastmoney' });
          return;
        }
        resolve({ code, success: false, time: timeUsed, api: 'eastmoney' });
      } catch (e) {
        resolve({ code, success: false, time: timeUsed, api: 'eastmoney' });
      }
    });
  });
}

// 生成股票代码列表
function generateStockCodes() {
  const codes = [];
  for (let i = 600000; i <= 603999; i++) codes.push('sh' + i);
  for (let i = 688000; i <= 688999; i++) codes.push('sh' + i);
  for (let i = 0; i <= 999; i++) codes.push('sz' + String(i).padStart(6, '0'));
  for (let i = 2000; i <= 2999; i++) codes.push('sz' + String(i).padStart(6, '0'));
  for (let i = 300000; i <= 300999; i++) codes.push('sz' + String(i).padStart(6, '0'));
  return codes;
}

// 速度测试 - 确定两个API的性能比例
async function speedTest(codes) {
  console.log('\n=== 速度测试 ===');
  const testSamples = codes.slice(0, SPEED_TEST_SAMPLES);

  // 并行测试两个API
  const tencentResults = await Promise.all(testSamples.map(c => fetchTencent(c)));
  const eastmoneyResults = await Promise.all(testSamples.map(c => fetchEastmoney(c)));

  // 计算成功率和平均响应时间
  const tencentSuccess = tencentResults.filter(r => r.success).length;
  const tencentAvgTime = tencentResults.reduce((sum, r) => sum + r.time, 0) / tencentResults.length;

  const eastmoneySuccess = eastmoneyResults.filter(r => r.success).length;
  const eastmoneyAvgTime = eastmoneyResults.reduce((sum, r) => sum + r.time, 0) / eastmoneyResults.length;

  // 计算得分：成功率 * (1/平均响应时间)
  const tencentScore = tencentSuccess > 0 ? (tencentSuccess / SPEED_TEST_SAMPLES) * (1000 / tencentAvgTime) : 0;
  const eastmoneyScore = eastmoneySuccess > 0 ? (eastmoneySuccess / SPEED_TEST_SAMPLES) * (1000 / eastmoneyAvgTime) : 0;

  const totalScore = tencentScore + eastmoneyScore;

  const tencentRatio = totalScore > 0 ? Math.round((tencentScore / totalScore) * 100) : 50;
  const eastmoneyRatio = 100 - tencentRatio;

  console.log(`腾讯: 成功率 ${tencentSuccess}/${SPEED_TEST_SAMPLES}, 平均 ${tencentAvgTime.toFixed(0)}ms, 得分 ${tencentScore.toFixed(2)}`);
  console.log(`东财: 成功率 ${eastmoneySuccess}/${SPEED_TEST_SAMPLES}, 平均 ${eastmoneyAvgTime.toFixed(0)}ms, 得分 ${eastmoneyScore.toFixed(2)}`);
  console.log(`分配比例: 腾讯 ${tencentRatio}%, 东方财富 ${eastmoneyRatio}%`);

  return { tencentRatio, eastmoneyRatio, tencentSuccess, eastmoneySuccess };
}

// 根据比例分配任务
function assignTasks(codes, tencentRatio) {
  const tencentCount = Math.floor(codes.length * tencentRatio / 100);
  return {
    tencent: codes.slice(0, tencentCount),
    eastmoney: codes.slice(tencentCount)
  };
}

async function fetchBatch(fetchFn, codes, apiName) {
  const results = [];
  for (let i = 0; i < codes.length; i += CONCURRENCY) {
    const batch = codes.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(c => fetchFn(c)));
    results.push(...batchResults);
    console.log(`[${apiName}] ${Math.min(i + CONCURRENCY, codes.length)}/${codes.length}`);
  }
  return results;
}

async function main() {
  const codes = generateStockCodes();
  console.log(`总股票数: ${codes.length}`);

  // 速度测试
  const { tencentRatio, eastmoneyRatio, tencentSuccess, eastmoneySuccess } = await speedTest(codes);

  // 如果两个API都可用，按比例分配
  let tasks;
  if (tencentSuccess > 0 && eastmoneySuccess > 0) {
    tasks = assignTasks(codes, tencentRatio / 100);
  } else if (tencentSuccess > 0) {
    tasks = { tencent: codes, eastmoney: [] };
    console.log('仅使用腾讯API');
  } else if (eastmoneySuccess > 0) {
    tasks = { tencent: [], eastmoney: codes };
    console.log('仅使用东方财富API');
  } else {
    console.error('两个API都无法使用!');
    return;
  }

  console.log(`\n分配: 腾讯 ${tasks.tencent.length}, 东方财富 ${tasks.eastmoney.length}\n`);

  const startTime = Date.now();

  // 并行获取
  const promises = [];
  if (tasks.tencent.length > 0) {
    promises.push(fetchBatch(fetchTencent, tasks.tencent, '腾讯'));
  }
  if (tasks.eastmoney.length > 0) {
    promises.push(fetchBatch(fetchEastmoney, tasks.eastmoney, '东财'));
  }

  const allResults = (await Promise.all(promises)).flat();
  console.log(`\n完成! 耗时: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  // 保存结果
  const stocks = [];
  let success = 0, fail = 0;

  for (const result of allResults) {
    if (result.success && result.name) {
      const filePath = path.join(DATA_DIR, result.code + '.json');
      fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
      stocks.push({ code: result.code, name: result.name });
      success++;
    } else {
      fail++;
    }
  }

  console.log(`成功: ${success}, 失败: ${fail}`);

  stocks.sort((a, b) => a.code.localeCompare(b.code));
  fs.writeFileSync(path.join(DATA_DIR, 'stocks.json'), JSON.stringify(stocks, null, 2));
  console.log(`已保存 stocks.json (${stocks.length} 只股票)`);
}

main().catch(console.error);
