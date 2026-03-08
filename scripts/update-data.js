/**
 * 数据更新脚本
 * 从腾讯财经API获取A股数据并保存到JSON文件
 *
 * 使用方法: node scripts/update-data.js
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const DATA_DIR = path.join(__dirname, '..', 'data');

// 腾讯财经API
const API_BASE = 'https://web.ifzq.gtimg.cn';
const PROXY = 'http://127.0.0.1:7890';

// 确保目录存在
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 使用curl获取数据
function fetchWithCurl(url) {
  return new Promise((resolve, reject) => {
    const cmd = `curl -x "${PROXY}" -s "${url}"`;
    exec(cmd, { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(e);
      }
    });
  });
}

// A股主要股票代码列表 - 真实存在的股票
function getStockList() {
  // 指数
  const indexes = [
    { code: 'sh000001', name: '上证指数' },
    { code: 'sz399001', name: '深证成指' },
    { code: 'sh000300', name: '沪深300' },
    { code: 'sh000016', name: '上证50' },
    { code: 'sz399006', name: '创业板指' },
    { code: 'sh000688', name: '科创50' },
    { code: 'sh000905', name: '中证500' },
    { code: 'sh000852', name: '中证1000' },
  ];

  // 上海主板 - 蓝筹股和大盘股
  const shMainBoard = [
    { code: 'sh600000', name: '浦发银行' },
    { code: 'sh600015', name: '华夏银行' },
    { code: 'sh600016', name: '民生银行' },
    { code: 'sh600018', name: '上港集团' },
    { code: 'sh600019', name: '宝钢股份' },
    { code: 'sh600028', name: '中国石化' },
    { code: 'sh600030', name: '中信证券' },
    { code: 'sh600036', name: '招商银行' },
    { code: 'sh600048', name: '保利发展' },
    { code: 'sh600050', name: '中国联通' },
    { code: 'sh600104', name: '上汽集团' },
    { code: 'sh600109', name: '国金证券' },
    { code: 'sh600111', name: '北方稀土' },
    { code: 'sh600150', name: '中国船舶' },
    { code: 'sh600170', name: '上海建工' },
    { code: 'sh600176', name: '中国巨石' },
    { code: 'sh600183', name: '生益科技' },
    { code: 'sh600196', name: '复星医药' },
    { code: 'sh600276', name: '恒瑞医药' },
    { code: 'sh600309', name: '万华化学' },
    { code: 'sh600406', name: '国电南瑞' },
    { code: 'sh600438', name: '通威股份' },
    { code: 'sh600519', name: '贵州茅台' },
    { code: 'sh600547', name: '山东黄金' },
    { code: 'sh600585', name: '海螺水泥' },
    { code: 'sh600690', name: '青岛海尔' },
    { code: 'sh600703', name: '三安光电' },
    { code: 'sh600745', name: '闻泰科技' },
    { code: 'sh600760', name: '中航沈飞' },
    { code: 'sh600809', name: '山西汾酒' },
    { code: 'sh600837', name: '海通证券' },
    { code: 'sh600887', name: '伊利股份' },
    { code: 'sh600900', name: '长江电力' },
    { code: 'sh600905', name: '三峡能源' },
    { code: 'sh600989', name: '宝信软件' },
    { code: 'sh601006', name: '大秦铁路' },
    { code: 'sh601012', name: '隆基绿能' },
    { code: 'sh601066', name: '中信建投' },
    { code: 'sh601088', name: '中国神华' },
    { code: 'sh601118', name: '海南橡胶' },
    { code: 'sh601138', name: '工业富联' },
    { code: 'sh601155', name: '新城控股' },
    { code: 'sh601166', name: '兴业银行' },
    { code: 'sh601169', name: '北京银行' },
    { code: 'sh601211', name: '国泰君安' },
    { code: 'sh601288', name: '农业银行' },
    { code: 'sh601318', name: '中国平安' },
    { code: 'sh601328', name: '交通银行' },
    { code: 'sh601398', name: '工商银行' },
    { code: 'sh601601', name: '中国太保' },
    { code: 'sh601628', name: '中国人寿' },
    { code: 'sh601668', name: '中国建筑' },
    { code: 'sh601688', name: '中国中车' },
    { code: 'sh601766', name: '中国中铁' },
    { code: 'sh601800', name: '中国交建' },
    { code: 'sh601818', name: '光大银行' },
    { code: 'sh601857', name: '中国石油' },
    { code: 'sh601888', name: '中国中铁' },
    { code: 'sh601919', name: '中远海控' },
    { code: 'sh601939', name: '建设银行' },
    { code: 'sh601985', name: '中国核电' },
    { code: 'sh601988', name: '中国银行' },
    { code: 'sh601989', name: '中国重工' },
    { code: 'sh603019', name: '中科曙光' },
    { code: 'sh603160', name: '汇顶科技' },
    { code: 'sh603259', name: '药明康德' },
    { code: 'sh603288', name: '海天味业' },
    { code: 'sh603501', name: '韦尔股份' },
    { code: 'sh603799', name: '华友钴业' },
    { code: 'sh603986', name: '兆易创新' },
  ];

  // 深圳主板
  const szMainBoard = [
    { code: 'sz000001', name: '平安银行' },
    { code: 'sz000002', name: '万科A' },
    { code: 'sz000063', name: '中兴通讯' },
    { code: 'sz000100', name: 'TCL科技' },
    { code: 'sz000166', name: '申万宏源' },
    { code: 'sz000333', name: '美的集团' },
    { code: 'sz000338', name: '潍柴动力' },
    { code: 'sz000425', name: '建投能源' },
    { code: 'sz000501', name: '鄂尔多斯' },
    { code: 'sz000538', name: '云南白药' },
    { code: 'sz000581', name: '威孚高科' },
    { code: 'sz000651', name: '格力电器' },
    { code: 'sz000661', name: '长春高新' },
    { code: 'sz000725', name: '京东方A' },
    { code: 'sz000768', name: '中航飞机' },
    { code: 'sz000783', name: '长江证券' },
    { code: 'sz000858', name: '五粮液' },
    { code: 'sz000876', name: '新希望' },
    { code: 'sz000938', name: '紫金矿业' },
    { code: 'sz000999', name: '华润三九' },
  ];

  // 创业板
  const cybCodes = [
    { code: 'sz300001', name: '睿创微纳' },
    { code: 'sz300003', name: '乐普医疗' },
    { code: 'sz300014', name: '亿纬锂能' },
    { code: 'sz300015', name: '爱尔眼科' },
    { code: 'sz300033', name: '同花顺' },
    { code: 'sz300059', name: '东方财富' },
    { code: 'sz300122', name: '智飞生物' },
    { code: 'sz300124', name: '长盈精密' },
    { code: 'sz300142', name: '沃森生物' },
    { code: 'sz300166', name: '东方国信' },
    { code: 'sz300212', name: '易瑞生物' },
    { code: 'sz300223', name: '晶瑞股份' },
    { code: 'sz300252', name: '信维通信' },
    { code: 'sz300274', name: '朗科智能' },
    { code: 'sz300315', name: '冠捷科技' },
    { code: 'sz300408', name: '三环集团' },
    { code: 'sz300459', name: '金力泰' },
    { code: 'sz300496', name: '中科信息' },
    { code: 'sz300558', name: '金亚科技' },
    { code: 'sz300750', name: '宁德时代' },
    { code: 'sz300760', name: '迈瑞医疗' },
  ];

  // 科创板
  const kcbCodes = [
    { code: 'sh688001', name: '华兴源创' },
    { code: 'sh688002', name: '天准科技' },
    { code: 'sh688003', name: '金山办公' },
    { code: 'sh688005', name: '容百科技' },
    { code: 'sh688006', name: '华大基因' },
    { code: 'sh688008', name: '国泰君安' },
    { code: 'sh688009', name: '心脉医疗' },
    { code: 'sh688010', name: '天宜上佳' },
    { code: 'sh688012', name: '中微公司' },
    { code: 'sh688111', name: '江苏北人' },
    { code: 'sh688116', name: '天奈科技' },
    { code: 'sh688122', name: '华峰测控' },
    { code: 'sh688127', name: '华光新材' },
    { code: 'sh688139', name: '康方生物' },
    { code: 'sh688155', name: '华虹半导体' },
    { code: 'sh688158', name: '优刻得' },
    { code: 'sh688165', name: '华特气体' },
    { code: 'sh688169', name: '石头科技' },
    { code: 'sh688180', name: '兆易创新' },
    { code: 'sh688185', name: '康希诺' },
    { code: 'sh688195', name: '鼎龙股份' },
    { code: 'sh688208', name: '超卓集团' },
    { code: 'sh688228', name: '望海康信' },
    { code: 'sh688256', name: '寒武纪' },
    { code: 'sh688266', name: '阳光电源' },
    { code: 'sh688278', name: '特宝生物' },
    { code: 'sh688285', name: '高铁电气' },
    { code: 'sh688317', name: '前沿生物' },
    { code: 'sh688356', name: '江苏神通' },
    { code: 'sh688357', name: '长远锂科' },
    { code: 'sh688369', name: '中航泰达' },
    { code: 'sh688377', name: '迪威尔' },
    { code: 'sh688396', name: '华润微' },
    { code: 'sh688468', name: '龙腾光电' },
    { code: 'sh688499', name: '利元亨' },
    { code: 'sh688521', name: '芯原股份' },
    { code: 'sh688561', name: '中芯国际' },
    { code: 'sh688578', name: '艾为电子' },
    { code: 'sh688599', name: '天合光能' },
    { code: 'sh688608', name: '芯朋微' },
    { code: 'sh688611', name: '金博股份' },
    { code: 'sh688630', name: '沪硅产业' },
  ];

  return [...indexes, ...shMainBoard, ...szMainBoard, ...cybCodes, ...kcbCodes];
}

// 获取单只股票K线数据
async function getStockKline(code, days = 2500) {
  try {
    const url = `${API_BASE}/appstock/app/fqkline/get?param=${code},day,,,${days},qfq`;
    const data = await fetchWithCurl(url);

    if (data.data && data.data[code]) {
      const stockData = data.data[code];
      let klines = [];

      // 优先使用 qfqday（前复权）
      if (stockData.qfqday && stockData.qfqday.length > 0) {
        klines = stockData.qfqday.map(k => ({
          date: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5])
        }));
      } else if (stockData.day && stockData.day.length > 0) {
        klines = stockData.day.map(k => ({
          date: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5])
        }));
      }

      if (klines.length > 0) {
        const latest = klines[klines.length - 1];
        const quote = {
          date: latest.date,
          open: latest.open,
          high: latest.high,
          low: latest.low,
          close: latest.close,
          volume: latest.volume
        };

        return { klines, quote };
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

// 保存股票数据到文件
function saveStockData(code, name, data) {
  const filePath = path.join(DATA_DIR, `${code}.json`);
  const fileData = {
    code,
    name,
    updatedAt: new Date().toISOString(),
    ...data
  };
  fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2), 'utf8');
}

// 主函数
async function main() {
  console.log('🚀 开始更新A股数据...\n');

  ensureDir(DATA_DIR);

  // 1. 获取股票列表
  const stocks = getStockList();
  console.log(`📊 共 ${stocks.length} 只股票\n`);

  // 保存股票列表
  const stockListFile = path.join(DATA_DIR, 'stocks.json');
  fs.writeFileSync(stockListFile, JSON.stringify(stocks, null, 2), 'utf8');
  console.log('✅ 股票列表已保存\n');

  // 2. 获取每只股票的K线数据
  console.log('📈 正在获取K线数据...');
  let success = 0;
  let failed = 0;

  for (let i = 0; i < stocks.length; i++) {
    const stock = stocks[i];

    if (i % 10 === 0) {
      console.log(`  进度: ${i}/${stocks.length} (${((i/stocks.length)*100).toFixed(1)}%)`);
    }

    const data = await getStockKline(stock.code, 1500);

    if (data && data.klines && data.klines.length > 0) {
      saveStockData(stock.code, stock.name, data);
      success++;
      console.log(`  ✓ ${stock.code} ${stock.name} (${data.klines.length} days)`);
    } else {
      failed++;
    }

    // 避免请求过快
    if (i % 5 === 0) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n✅ 数据更新完成!`);
  console.log(`   成功: ${success} 只`);
  console.log(`   失败: ${failed} 只`);
  console.log(`\n📁 数据保存在: ${DATA_DIR}`);
}

main().catch(console.error);
