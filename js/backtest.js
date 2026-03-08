/**
 * 回测逻辑
 */

// 股票数据缓存
let stockDataCache = {};
let selectedStock = null;
let backtestChart = null;
let equityCurveData = null; // 保存原始收益曲线数据
let initialCapitalData = null; // 保存初始资金
let searchDebounceTimer = null; // 搜索防抖定时器

// 压缩数据缓存
let compressedDataCache = null; // 存储解压后的股票数据
let isLoadingCompressedData = false;
let loadedChunks = new Set(); // 已加载的块索引

// 缓存配置
const CACHE_KEY = 'stock_list_cache';
const CACHE_EXPIRY = 60 * 60 * 1000; // 1小时

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  ThemeManager.init();
  await loadStockList();
  setupEventListeners();
});

// 解压 gzip 数据（需要 pako.js）
function decompressGzip(base64Data) {
  if (typeof pako === 'undefined') {
    console.error('pako.js 未加载');
    return null;
  }
  try {
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const decompressed = pako.inflate(bytes, { to: 'string' });
    return JSON.parse(decompressed);
  } catch (e) {
    console.error('解压失败:', e);
    return null;
  }
}
// 缓存chunks索引
let chunksIndexCache = null;

// 加载chunks索引
async function loadChunksIndex() {
  if (chunksIndexCache) {
    return chunksIndexCache;
  }

  try {
    const response = await fetch('data-chunks/index.json');
    chunksIndexCache = await response.json();
    return chunksIndexCache;
  } catch (e) {
    console.error('加载chunks索引失败:', e);
    return null;
  }
}

// 从data-chunks加载所有股票列表
async function loadStockListFromChunks() {
  const chunks = await loadChunksIndex();
  if (!chunks) return null;

  const allStocks = [];
  const loadedChunkData = {};

  // 加载所有chunk
  for (let i = 0; i < chunks.length; i++) {
    try {
      const response = await fetch(`data-chunks/${chunks[i].filename}`);
      const chunkData = await response.json();
      const stockData = decompressGzip(chunkData.data);
      loadedChunkData[i] = stockData;
    } catch (e) {
      console.error(`加载chunk ${i}失败:`, e);
    }
  }

  // 提取股票代码和名称
  for (const chunkData of Object.values(loadedChunkData)) {
    for (const [code, stock] of Object.entries(chunkData)) {
      allStocks.push({
        code: code,
        name: stock.n || stock.c || code
      });
    }
  }

  return allStocks;
}

// 加载指定块的数据
async function loadChunk(chunkIndex) {
  if (loadedChunks.has(chunkIndex)) {
    return compressedDataCache[chunkIndex] || null;
  }

  try {
    const chunks = await loadChunksIndex();
    if (!chunks || !chunks[chunkIndex]) {
      console.error(`块 ${chunkIndex} 不存在`);
      return null;
    }

    // 加载对应的小文件
    const response = await fetch(`data-chunks/${chunks[chunkIndex].filename}`);
    const chunkData = await response.json();

    const stockData = decompressGzip(chunkData.data);
    if (!compressedDataCache) {
      compressedDataCache = {};
    }
    compressedDataCache[chunkIndex] = stockData;
    loadedChunks.add(chunkIndex);

    console.log(`已加载块 ${chunkIndex}, 包含 ${Object.keys(stockData).length} 只股票`);
    return stockData;
  } catch (e) {
    console.error('加载压缩数据失败:', e);
    return null;
  }
}

// 根据股票代码查找所在的块
// 基于实际数据分布的范围查询
function findStockChunk(code) {
  if (code.startsWith('bj')) {
    return 0;  // bj 在块 0-1
  }

  if (code.startsWith('sh')) {
    const num = parseInt(code.slice(2));
    // 根据实际数据分布 (从chunk文件分析得到)
    if (num < 560080) return 10;  // sh515860 ~ sh560070
    if (num < 563800) return 11;  // sh560080 ~ sh563780
    if (num < 600120) return 12;  // sh563800 ~ sh600119
    if (num < 600346) return 13;  // sh600120 ~ sh600345
    if (num < 600595) return 14;  // sh600346 ~ sh600594
    if (num < 600795) return 15;  // sh600595 ~ sh600794
    if (num < 601086) return 16;  // sh600795 ~ sh601083
    if (num < 603001) return 17;  // sh601086 ~ sh603000 (sh601398在这里!)
    if (num < 603231) return 18;  // sh603001 ~ sh603230
    if (num < 603608) return 19;  // sh603231 ~ sh603607
    if (num < 603979) return 20;  // sh603608 ~ sh603978
    if (num < 688080) return 21;  // sh603979 ~ sh688079
    if (num < 688800) return 22;  // sh688080 ~ sh688799
    return 23; // 其他上海股票
  }

  if (code.startsWith('sz')) {
    // 深圳股票从chunk 32开始
    const num = parseInt(code.slice(2));
    if (num < 1000) return 32;   // sz000001 ~ sz000999
    if (num < 10000) return 33;   // sz001000 ~ sz009999
    if (num < 30000) return 34;   // sz010000 ~ sz029999
    if (num < 250000) return 35;  // sz030000 ~ sz249999
    if (num < 300000) return 36;  // sz250000 ~ sz299999
    if (num < 400000) return 37;  // sz300000 ~ sz399999
    if (num < 500000) return 38;  // sz400000 ~ sz499999
    if (num < 130000) return 39;  // sz100000 ~ sz129999
    if (num < 140000) return 40;  // sz130000 ~ sz139999
    if (num < 160000) return 42;  // sz140000 ~ sz159999
    if (num < 170000) return 43;  // sz160000 ~ sz169999
    if (num < 180000) return 44;  // sz170000 ~ sz179999
    return 51; // 其他深圳股票
  }

  return 0;
}

// 从压缩数据中获取股票数据
async function getStockFromCompressedData(code) {
  const chunkIndex = findStockChunk(code);
  const chunkData = await loadChunk(chunkIndex);

  if (!chunkData || !chunkData[code]) {
    // 尝试遍历所有块（备用方案）
    console.log(`在块 ${chunkIndex} 中未找到 ${code}，搜索其他块...`);
    try {
      const chunks = await loadChunksIndex();
      if (!chunks) return null;

      for (let i = 0; i < chunks.length; i++) {
        // 跳过已加载的块
        if (loadedChunks.has(i)) {
          const cached = compressedDataCache[i];
          if (cached && cached[code]) {
            return { stock: cached[code], chunkIndex: i };
          }
          continue;
        }

        // 只加载需要的块
        const data = decompressGzip(chunks[i].data);
        if (data && data[code]) {
          compressedDataCache[i] = data;
          loadedChunks.add(i);
          return { stock: data[code], chunkIndex: i };
        }
      }
    } catch (e) {
      console.error('搜索所有块失败:', e);
    }
    return null;
  }

  return { stock: chunkData[code], chunkIndex };
}

// 从缓存加载股票列表
function getCachedStocks() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const { data, timestamp } = JSON.parse(cached);
    // 检查缓存是否过期
    if (Date.now() - timestamp > CACHE_EXPIRY) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
}

// 保存股票列表到缓存
function setCachedStocks(stocks) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      data: stocks,
      timestamp: Date.now()
    }));
  } catch (e) {
    console.warn('缓存股票列表失败:', e);
  }
}

// 显示搜索状态消息
function showSearchStatus(message, isError = false) {
  const resultsDiv = document.getElementById('search-results');
  resultsDiv.innerHTML = `<div class="search-result-item" style="color: ${isError ? 'var(--down-color, #e74c3c)' : 'var(--text-secondary)'}">${message}</div>`;
  resultsDiv.classList.add('show');
}

// 加载股票列表
async function loadStockList() {
  const searchInput = document.getElementById('stock-search');

  // 先尝试从缓存加载
  const cachedStocks = getCachedStocks();
  if (cachedStocks) {
    stockDataCache = { stocks: cachedStocks };
    searchInput.placeholder = '输入股票代码或名称搜索...';
    return;
  }

  // 显示加载状态
  searchInput.placeholder = '加载股票列表中...';
  searchInput.disabled = true;

  try {
    // 从data-chunks加载股票列表
    const stocks = await loadStockListFromChunks();

    if (!stocks || stocks.length === 0) {
      throw new Error('无法加载股票数据');
    }

    // 保存到缓存
    setCachedStocks(stocks);
    stockDataCache = { stocks };
    searchInput.placeholder = '输入股票代码或名称搜索...';

  } catch (error) {
    console.error('加载股票列表失败:', error);

    // 尝试从缓存恢复（即使过期也使用）
    const cachedStocks = getCachedStocks() || [];
    if (cachedStocks.length > 0) {
      stockDataCache = { stocks: cachedStocks };
      searchInput.placeholder = '输入股票代码或名称搜索... (缓存)';
    } else {
      searchInput.placeholder = '加载失败，请刷新页面重试';
      showSearchStatus('加载股票列表失败: ' + error.message, true);
    }
  } finally {
    searchInput.disabled = false;
  }
}

// 设置事件监听
function setupEventListeners() {
  // 搜索功能
  const searchInput = document.getElementById('stock-search');
  searchInput.addEventListener('input', handleSearch);

  // 策略切换
  const strategySelect = document.getElementById('strategy');
  strategySelect.addEventListener('change', (e) => {
    const smaParams = document.getElementById('sma-params');
    const dcaParams = document.getElementById('dca-params');

    smaParams.style.display = e.target.value === 'sma' ? 'block' : 'none';
    dcaParams.style.display = e.target.value === 'dca' ? 'block' : 'none';
  });

  // 点击其他地方关闭搜索结果
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box')) {
      document.getElementById('search-results').classList.remove('show');
    }
  });
}

// 搜索处理（带防抖）
function handleSearch(e) {
  // 清除之前的防抖定时器
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }

  const query = e.target.value.trim();

  // 立即隐藏结果如果为空
  if (query.length < 1) {
    document.getElementById('search-results').classList.remove('show');
    return;
  }

  // 300ms 防抖
  searchDebounceTimer = setTimeout(() => {
    performSearch(query);
  }, 300);
}

// 执行搜索
// 拼音首字母到中文的映射
const pinyinMap = {
  // 常用股票
  'gsyh': '工商银行', 'gs': '工商银行', 'gsbank': '工商银行', 'icbc': '工商银行',
  'jhsy': '建设银行', 'jsbank': '建设银行', 'ccb': '建设银行',
  'nyyh': '农业银行', 'nybank': '农业银行', 'abc': '农业银行',
  'zsyh': '招商银行', 'zsbank': '招商银行', 'cmb': '招商银行',
  'payh': '平安银行', 'pabank': '平安银行',
  'zgpa': '中国平安', 'pingan': '中国平安', '601318': '中国平安',
  'zxbank': '中信银行',
  'msy': '民生银行', 'msbank': '民生银行',
  'hxyh': '华夏银行', 'hxbank': '华夏银行',
  'gdyh': '光大银行', 'gdbank': '光大银行',
  'fyyh': '兴业银行', 'xybank': '兴业银行',
  'pfy': '浦发银行', 'pfbank': '浦发银行',
  'shbank': '上海银行',
  'njy': '南京银行', 'njbank': '南京银行',
  'bgy': '北京银行', 'bgbank': '北京银行',
  // 常用词
  'yh': '银行', 'bank': '银行',
  'gjs': '钢铁', 'gt': '钢铁',
  'dc': '地产', 'fang': '房地产',
  'gy': '工业',
  'ny': '农业',
  'dz': '电子',
  'kj': '科技',
  'wl': '网络',
  'sj': '手机',
  'dzsw': '电子商务',
  'yy': '医药',
  'yl': '医疗',
  'sp': '食品',
  'nc': '酿酒',
  'jx': '家电',
  'dq': '电气',
  'tc': '汽车',
  'jx': '机械',
  'js': '建筑',
  'cl': '材料',
  'ny': '能源',
  'tf': '通信',
  'mt': '媒体',
  'yx': '游戏',
  'dy': '电影',
  'ly': '旅游',
  'hk': '航空',
  'sn': '水运',
  'wl': '物流',
  'sf': '证券',
  'bx': '保险',
  'jr': '金融',
  'sc': '市场'
};

// 获取中文关键词
function getChineseKeyword(query) {
  const lowerQuery = query.toLowerCase();
  return pinyinMap[lowerQuery] || '';
}

function performSearch(query) {
  const resultsDiv = document.getElementById('search-results');
  const lowerQuery = query.toLowerCase();

  // 检查数据是否加载
  const stocks = stockDataCache.stocks;
  if (!stocks || !Array.isArray(stocks)) {
    resultsDiv.innerHTML = '<div class="search-result-item">股票数据加载中，请稍候...</div>';
    resultsDiv.classList.add('show');
    return;
  }

  // 获取中文关键词
  const chineseKeyword = getChineseKeyword(query);

  // 搜索匹配：代码、名称、或拼音首字母
  const matches = stocks.filter(s => {
    const codeMatch = s.code.toLowerCase().includes(lowerQuery);
    const nameMatch = s.name.toLowerCase().includes(lowerQuery);
    const pinyinMatch = chineseKeyword && s.name.includes(chineseKeyword);
    return codeMatch || nameMatch || pinyinMatch;
  }).slice(0, 10);

  if (matches.length === 0) {
    resultsDiv.innerHTML = '<div class="search-result-item">未找到匹配的股票</div>';
  } else {
    resultsDiv.innerHTML = matches.map(s =>
      `<div class="search-result-item" onclick="selectStock('${s.code}', '${s.name}')">
        ${s.name} (${s.code})
      </div>`
    ).join('');
  }

  resultsDiv.classList.add('show');
}

// 选择股票
async function selectStock(code, name) {
  selectedStock = { code, name };

  document.getElementById('search-results').classList.remove('show');
  document.getElementById('stock-search').value = '';
  document.getElementById('selected-stock').style.display = 'block';
  document.getElementById('selected-stock-name').textContent = name;
  document.getElementById('selected-stock-code').textContent = code;

  // 加载股票数据
  await loadStockData(code);
}

  // 从API获取股票数据（备用方案）
async function tryFetchAPI(code) {
  try {
    const response = await fetch(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},day,,,800,qfq`);
    const text = await response.text();
    const data = JSON.parse(text);
    if (data.data && data.data[code]) {
      const stockData = data.data[code];
      const name = stockData.qt && stockData.qt[code] ? stockData.qt[code][1] : '';
      const klines = stockData.qfqday ? stockData.qfqday.map(k => ({
        date: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]),
        low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5])
      })) : [];
      return { code, name, klines };
    }
    throw new Error('无数据');
  } catch (e) {
    // 如果fetch失败，尝试东方财富API
    const secid = code.startsWith('sh') ? `1.${code.slice(2)}` : `0.${code.slice(2)}`;
    const url2 = `https://push2.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&end=20500101&lmt=800`;
    const response2 = await fetch(url2);
    const data2 = await response2.json();
    if (data2.data && data2.data.klines) {
      const klines = data2.data.klines.map(k => {
        const arr = k.split(',');
        return { date: arr[0], open: parseFloat(arr[1]), high: parseFloat(arr[2]),
          low: parseFloat(arr[3]), close: parseFloat(arr[4]), volume: parseFloat(arr[5]) };
      });
      return { code, name: data2.data.name, klines };
    }
    throw new Error('API都失败');
  }
}

// 加载股票数据
async function loadStockData(code) {
  try {
    // 先尝试从压缩数据加载
    const compressedResult = await getStockFromCompressedData(code);

    if (compressedResult && compressedResult.stock) {
      const stock = compressedResult.stock;
      // 转换格式：k 是数组 [date, open, high, low, close, volume]
      const klines = stock.k ? stock.k.map(k => ({
        date: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5])
      })) : [];

      selectedStock.data = {
        code: stock.c || code,
        name: stock.n || '',
        klines: klines
      };
    } else {
      // 如果压缩数据中没有，尝试从API获取
      console.log('压缩数据中未找到，从API获取...');
      const apiData = await tryFetchAPI(code);
      if (apiData && apiData.klines && apiData.klines.length > 0) {
        selectedStock.data = apiData;
      } else {
        throw new Error('无法获取股票数据');
      }
    }

    // 设置日期范围
    if (selectedStock.data.klines && selectedStock.data.klines.length > 0) {
      const data = selectedStock.data;
      const startDateInput = document.getElementById('start-date');
      const endDateInput = document.getElementById('end-date');

      // 数据是按日期从早到晚排列的，所以[0]是最早日期，[length-1]是最晚日期
      const earliestDate = data.klines[0].date;
      const latestDate = data.klines[data.klines.length - 1].date;

      // 使用Date对象进行比较，确保正确处理日期
      const latest = new Date(latestDate);
      const earliest = new Date(earliestDate);
      const currentStart = new Date(startDateInput.value);
      const currentEnd = new Date(endDateInput.value);

      // 设置日期输入框的范围 (min是最早日期，max是最晚日期)
      startDateInput.min = earliestDate;
      startDateInput.max = latestDate;
      endDateInput.min = earliestDate;
      endDateInput.max = latestDate;

      // 如果当前日期超出范围，则更新为数据范围内的合理默认值
      // 默认使用数据的前80%时间范围
      const range = latest.getTime() - earliest.getTime();
      const defaultStart = new Date(earliest.getTime() + range * 0.1);
      const defaultEnd = new Date(latest.getTime() - range * 0.05);

      // 显示数据范围提示
      const dataYears = range / (1000 * 60 * 60 * 24 * 365);
      const dataRangeEl = document.getElementById('stock-data-range');
      dataRangeEl.textContent = `数据范围：${earliestDate} ~ ${latestDate}（约${dataYears.toFixed(1)}年）`;

      if (isNaN(currentStart.getTime()) || currentStart < earliest || currentStart > latest) {
        startDateInput.value = defaultStart.toISOString().split('T')[0];
      }
      if (isNaN(currentEnd.getTime()) || currentEnd < earliest || currentEnd > latest) {
        endDateInput.value = defaultEnd.toISOString().split('T')[0];
      }
    }
  } catch (error) {
    console.error('加载股票数据失败:', error);
    selectedStock.data = null;
  }
}

// 清除选择
function clearSelection() {
  selectedStock = null;
  document.getElementById('selected-stock').style.display = 'none';
}

// 运行回测
async function runBacktest() {
  if (!selectedStock || !selectedStock.data) {
    alert('请先选择股票');
    return;
  }

  const loading = document.getElementById('backtest-loading');
  const resultSection = document.getElementById('result-section');
  const runButton = document.getElementById('run-backtest');

  loading.style.display = 'block';
  resultSection.style.display = 'none';
  runButton.disabled = true;

  try {
    // 获取参数
    const strategy = document.getElementById('strategy').value;
    const initialCapital = parseFloat(document.getElementById('initial-capital').value);
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;

    // 获取K线数据
    const klines = selectedStock.data.klines || [];

    // 过滤日期范围
    const filteredKlines = klines.filter(k => k.date >= startDate && k.date <= endDate);

    if (filteredKlines.length === 0) {
      alert('所选日期范围内没有数据');
      loading.style.display = 'none';
      runButton.disabled = false;
      return;
    }

    // 根据策略执行回测
    let result;
    switch (strategy) {
      case 'hold':
        result = backtestHold(filteredKlines, initialCapital);
        break;
      case 'sma':
        const shortPeriod = parseInt(document.getElementById('sma-short').value);
        const longPeriod = parseInt(document.getElementById('sma-long').value);
        result = backtestSMA(filteredKlines, initialCapital, shortPeriod, longPeriod);
        break;
      case 'dca':
        const dcaAmount = parseFloat(document.getElementById('dca-amount').value);
        result = backtestDCA(filteredKlines, initialCapital, dcaAmount);
        break;
      default:
        result = backtestHold(filteredKlines, initialCapital);
    }

    // 显示结果
    displayResult(result, initialCapital, filteredKlines);

  } catch (error) {
    console.error('回测出错:', error);
    alert('回测出错: ' + error.message);
  }

  loading.style.display = 'none';
  runButton.disabled = false;
}

// 持有策略回测
function backtestHold(klines, initialCapital) {
  const firstPrice = klines[0].close;
  const lastPrice = klines[klines.length - 1].close;
  const shares = initialCapital / firstPrice;
  const finalValue = shares * lastPrice;

  const trades = [{
    date: klines[0].date,
    type: '买入',
    price: firstPrice,
    shares: shares,
    capital: initialCapital
  }, {
    date: klines[klines.length - 1].date,
    type: '卖出',
    price: lastPrice,
    shares: shares,
    capital: finalValue
  }];

  // 计算胜率：最后价格 > 买入价格 = 胜
  const isWin = lastPrice > firstPrice ? 1 : 0;

  return {
    trades,
    finalValue,
    buyCount: 1,
    sellCount: 1,
    wins: isWin,
    equityCurve: klines.map(k => ({
      date: k.date,
      value: shares * k.close
    }))
  };
}

// 均线策略回测
function backtestSMA(klines, initialCapital, shortPeriod, longPeriod) {
  if (klines.length < longPeriod) {
    throw new Error('数据量不足，无法计算均线');
  }

  // 计算均线
  const smaShort = calculateSMA(klines, shortPeriod);
  const smaLong = calculateSMA(klines, longPeriod);

  let capital = initialCapital;
  let shares = 0;
  const trades = [];
  const equityCurve = [];

  let buyCount = 0;
  let sellCount = 0;
  let wins = 0;

  for (let i = longPeriod; i < klines.length; i++) {
    const date = klines[i].date;
    const price = klines[i].close;
    const short = smaShort[i];
    const long = smaLong[i];

    // 金叉：短期均线从下往上穿过长期均线
    if (i > longPeriod && smaShort[i-1] <= smaLong[i-1] && short > long && capital > 0) {
      shares = capital / price;
      buyCount++;
      trades.push({
        date,
        type: '买入',
        price: price,
        shares: shares,
        capital: capital
      });
      capital = 0;
    }

    // 死叉：短期均线从上往下穿过长期均线
    else if (i > longPeriod && smaShort[i-1] >= smaLong[i-1] && short < long && shares > 0) {
      const sellValue = shares * price;
      if (trades.length > 0 && trades[trades.length - 1].type === '买入') {
        const buyPrice = trades[trades.length - 1].price;
        if (price > buyPrice) wins++;
      }
      sellCount++;
      trades.push({
        date,
        type: '卖出',
        price: price,
        shares: shares,
        capital: sellValue
      });
      capital = sellValue;
      shares = 0;
    }

    // 记录当前市值
    const currentValue = shares * price + capital;
    equityCurve.push({ date, value: currentValue });
  }

  // 如果还有持仓，按最后价格卖出
  if (shares > 0) {
    const lastPrice = klines[klines.length - 1].close;
    const finalValue = shares * lastPrice;
    trades.push({
      date: klines[klines.length - 1].date,
      type: '卖出',
      price: lastPrice,
      shares: shares,
      capital: finalValue
    });
    equityCurve[equityCurve.length - 1].value = finalValue;
  }

  return {
    trades,
    finalValue: equityCurve[equityCurve.length - 1].value,
    buyCount,
    sellCount,
    wins,
    equityCurve
  };
}

// 计算简单移动平均线
function calculateSMA(klines, period) {
  const sma = [];
  for (let i = 0; i < klines.length; i++) {
    if (i < period - 1) {
      sma.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += klines[i - j].close;
      }
      sma.push(sum / period);
    }
  }
  return sma;
}

// 定投策略回测
function backtestDCA(klines, initialCapital, monthlyAmount) {
  let capital = initialCapital;
  const trades = [];
  const equityCurve = [];
  let totalShares = 0;
  let buyCount = 0;

  // 按月份分组
  const monthlyData = {};
  klines.forEach(k => {
    const month = k.date.substring(0, 7); // YYYY-MM
    if (!monthlyData[month]) {
      monthlyData[month] = k;
    }
  });

  const months = Object.keys(monthlyData).sort();

  months.forEach(month => {
    const dayData = monthlyData[month];
    const price = dayData.close;

    if (capital >= monthlyAmount) {
      const shares = monthlyAmount / price;
      totalShares += shares;
      buyCount++;
      capital -= monthlyAmount;

      trades.push({
        date: dayData.date,
        type: '买入',
        price: price,
        shares: shares,
        capital: monthlyAmount
      });
    }

    const currentValue = totalShares * price + capital;
    equityCurve.push({ date: dayData.date, value: currentValue });
  });

  // 最后按收盘价计算
  const lastPrice = klines[klines.length - 1].close;
  const finalValue = totalShares * lastPrice + capital;

  // 计算胜率：最终价值 > 总投入 = 胜
  const totalInvested = initialCapital + (monthlyAmount * buyCount);
  const isWin = finalValue > totalInvested ? 1 : 0;

  return {
    trades,
    finalValue,
    buyCount,
    sellCount: 0,
    wins: isWin,
    equityCurve
  };
}

// 显示回测结果
function displayResult(result, initialCapital, klines) {
  const resultSection = document.getElementById('result-section');

  // 获取用户输入的日期
  const startDateStr = document.getElementById('start-date').value;
  const endDateStr = document.getElementById('end-date').value;

  // 计算投资年限（使用用户输入的日期）
  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);
  let years = (endDate - startDate) / (1000 * 60 * 60 * 24 * 365);

  // 边界检查：确保 years 是有效的正数
  if (!years || years <= 0 || isNaN(years)) {
    years = 1; // 默认设为1年
  }

  // 获取实际数据覆盖的日期范围
  const dataStartDate = klines && klines.length > 0 ? klines[0].date : '';
  const dataEndDate = klines && klines.length > 0 ? klines[klines.length - 1].date : '';
  const dataYears = klines && klines.length > 1 ?
    (new Date(dataEndDate) - new Date(dataStartDate)) / (1000 * 60 * 60 * 24 * 365) : 0;

  // 计算收益率
  let totalReturn = 0;
  if (result.finalValue && initialCapital && initialCapital > 0) {
    totalReturn = ((result.finalValue - initialCapital) / initialCapital) * 100;
  }

  // 计算年化收益率（使用实际数据的日期范围）
  let annualReturn = 0;
  // 使用实际数据的年限来计算年化收益率（而非用户输入的日期范围）
  const calculationYears = (dataYears > 0 && dataYears <= years) ? dataYears : years;
  if (result.finalValue && initialCapital && result.finalValue > 0 && initialCapital > 0 && calculationYears > 0) {
    const ratio = result.finalValue / initialCapital;
    annualReturn = (Math.pow(ratio, 1 / calculationYears) - 1) * 100;
  }

  // 处理特殊情况
  if (!isFinite(annualReturn) || isNaN(annualReturn)) {
    annualReturn = 0;
  }

  // 胜率计算（必须有结果）
  let winRate = 0;
  if (result.sellCount > 0 && result.wins !== undefined && result.wins !== null) {
    // 有卖出操作：胜率 = 盈利次数 / 卖出次数
    winRate = (result.wins / result.sellCount) * 100;
  } else {
    // 没有卖出操作（如持有、定投）：最终价值 > 初始价值 = 胜
    winRate = (result.finalValue > initialCapital) ? 100 : 0;
  }

  // 更新显示
  const colors = ThemeManager.getColors();

  const returnEl = document.getElementById('total-return');
  returnEl.textContent = isFinite(totalReturn) ? totalReturn.toFixed(2) + '%' : '0.00%';
  returnEl.style.color = totalReturn >= 0 ? colors.up : colors.down;

  const annualEl = document.getElementById('annual-return');
  annualEl.textContent = (isFinite(annualReturn) ? annualReturn.toFixed(2) : '0.00') + '%';
  annualEl.style.color = annualReturn >= 0 ? colors.up : colors.down;

  document.getElementById('buy-count').textContent = result.buyCount;
  document.getElementById('sell-count').textContent = result.sellCount;
  document.getElementById('win-rate').textContent = winRate.toFixed(1) + '%';
  document.getElementById('final-assets').textContent = formatMoney(result.finalValue);

  // 绘制图表
  drawBacktestChart(result.equityCurve, initialCapital);

  // 显示交易记录
  const tradeList = document.getElementById('trade-list');
  tradeList.innerHTML = `
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="border-bottom: 2px solid var(--border-color);">
          <th style="padding: 0.5rem; text-align: left;">日期</th>
          <th style="padding: 0.5rem; text-align: left;">操作</th>
          <th style="padding: 0.5rem; text-align: right;">价格</th>
          <th style="padding: 0.5rem; text-align: right;">股数</th>
          <th style="padding: 0.5rem; text-align: right;">金额</th>
        </tr>
      </thead>
      <tbody>
        ${result.trades.map(t => `
          <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 0.5rem;">${t.date}</td>
            <td style="padding: 0.5rem; color: ${t.type === '买入' ? ThemeManager.getColors().down : ThemeManager.getColors().up};">${t.type}</td>
            <td style="padding: 0.5rem; text-align: right;">${t.price.toFixed(2)}</td>
            <td style="padding: 0.5rem; text-align: right;">${t.shares.toFixed(2)}</td>
            <td style="padding: 0.5rem; text-align: right;">${formatMoney(t.capital)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  resultSection.style.display = 'block';
}

// 绘制回测图表
// 按月汇总数据
function aggregateByMonth(equityCurve) {
  const monthlyData = {};

  equityCurve.forEach(item => {
    const month = item.date.substring(0, 7); // YYYY-MM
    if (!monthlyData[month] || item.date > monthlyData[month].date) {
      monthlyData[month] = item;
    }
  });

  return Object.values(monthlyData).sort((a, b) => a.date.localeCompare(b.date));
}

function drawBacktestChart(equityCurve, initialCapital) {
  // 保存原始数据
  equityCurveData = equityCurve;
  initialCapitalData = initialCapital;

  // 默认按日显示
  renderChart(equityCurve, initialCapital, 'daily');
}

// 渲染图表
function renderChart(equityCurve, initialCapital, viewMode) {
  const canvas = document.getElementById('backtest-chart');
  const ctx = canvas.getContext('2d');

  // 根据显示模式处理数据
  let processedCurve = equityCurve;
  if (viewMode === 'monthly') {
    processedCurve = aggregateByMonth(equityCurve);
  }

  const labels = processedCurve.map(e => e.date);
  const values = processedCurve.map(e => e.value);

  if (backtestChart) {
    backtestChart.destroy();
  }

  const colors = ThemeManager.getColors();
  const lineColor = values[values.length - 1] >= initialCapital ? colors.up : colors.down;

  // 自定义拖拽平移变量
  let isDragging = false;
  let dragStartX = 0;
  let dragStartIndex = 0;

  backtestChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: '资产净值',
        data: values,
        borderColor: lineColor,
        backgroundColor: lineColor + '20',
        fill: true,
        tension: 0.1,
        pointRadius: viewMode === 'monthly' ? 4 : 1,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top'
        },
        zoom: {
          zoom: {
            wheel: {
              enabled: true,
              modifierKey: null,
              speed: 0.1
            },
            drag: {
              enabled: false
            },
            pinch: {
              enabled: true
            },
            mode: 'x'
          },
          pan: {
            enabled: false  // 使用自定义拖拽实现
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return '资产净值: ' + formatMoney(context.raw);
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 45
          }
        },
        y: {
          ticks: {
            callback: value => formatMoney(value)
          }
        }
      }
    }
  });

  // 自定义拖拽平移功能
  const chartArea = canvas.parentElement;
  chartArea.style.cursor = 'grab';
  let originalMin = null;
  let originalMax = null;

  chartArea.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return; // 只响应左键
    isDragging = true;
    dragStartX = e.clientX;

    // 保存当前的显示范围
    const xScale = backtestChart.scales.x;
    originalMin = xScale.min;
    originalMax = xScale.max;

    chartArea.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', function(e) {
    if (!isDragging || originalMin === null) return;

    const xScale = backtestChart.scales.x;
    const canvasWidth = canvas.width;
    const deltaX = e.clientX - dragStartX;

    // 计算移动的比例
    const ratio = deltaX / canvasWidth;
    const totalRange = labels.length - 1;
    const currentRange = originalMax - originalMin;
    const deltaIndex = Math.round(currentRange * ratio);

    // 计算新的范围
    let newMin = originalMin - deltaIndex;
    let newMax = originalMax - deltaIndex;

    // 边界检查
    if (newMin < 0) {
      newMin = 0;
      newMax = Math.min(currentRange, labels.length - 1);
    }
    if (newMax > labels.length - 1) {
      newMax = labels.length - 1;
      newMin = Math.max(0, labels.length - 1 - currentRange);
    }

    // 更新显示范围
    backtestChart.options.scales.x.min = newMin;
    backtestChart.options.scales.x.max = newMax;
    backtestChart.update('none');
  });

  document.addEventListener('mouseup', function() {
    if (isDragging) {
      isDragging = false;
      chartArea.style.cursor = 'grab';
    }
  });

  document.addEventListener('mouseleave', function() {
    if (isDragging) {
      isDragging = false;
      chartArea.style.cursor = 'grab';
    }
  });

  // 更新按钮状态 - 使用计算后的颜色而不是CSS变量
  const btnDaily = document.getElementById('btn-view-daily');
  const btnMonthly = document.getElementById('btn-view-monthly');
  const styles = getComputedStyle(document.documentElement);

  const bgSecondary = styles.getPropertyValue('--bg-secondary').trim() || '#f5f5f5';
  const textPrimary = styles.getPropertyValue('--text-primary').trim() || '#333333';

  btnDaily.style.background = viewMode === 'daily' ? colors.up : bgSecondary;
  btnDaily.style.color = viewMode === 'daily' ? 'white' : textPrimary;
  btnMonthly.style.background = viewMode === 'monthly' ? colors.up : bgSecondary;
  btnMonthly.style.color = viewMode === 'monthly' ? 'white' : textPrimary;
}

// 切换显示模式
function setChartView(viewMode) {
  if (!equityCurveData || !initialCapitalData) return;
  renderChart(equityCurveData, initialCapitalData, viewMode);
}

// 格式化货币
function formatMoney(amount) {
  if (amount >= 100000000) {
    return (amount / 100000000).toFixed(2) + ' 亿';
  } else if (amount >= 10000) {
    return (amount / 10000).toFixed(2) + ' 万';
  }
  return amount.toFixed(2) + ' 元';
}

// 暴露函数到全局作用域（供 HTML onclick 调用）
window.setChartView = setChartView;
window.selectStock = selectStock;
window.clearSelection = clearSelection;
window.runBacktest = runBacktest;
