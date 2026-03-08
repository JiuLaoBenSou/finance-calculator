const fs = require('fs');
const path = require('path');

const stocks = [];

// 读取所有sh开头的文件
const files = fs.readdirSync('.').filter(f => (f.startsWith('sh') || f.startsWith('sz')) && f.endsWith('.json'));

files.forEach(f => {
  try {
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (data.name && data.name.length > 2) {
      stocks.push({code: f.replace('.json', ''), name: data.name});
    } else {
      stocks.push({code: f.replace('.json', ''), name: f.replace('.json', '')});
    }
  } catch(e) {
    stocks.push({code: f.replace('.json', ''), name: f.replace('.json', '')});
  }
});

stocks.sort((a,b) => a.code.localeCompare(b.code));
fs.writeFileSync('stocks.json', JSON.stringify(stocks, null, 2));
console.log('Done! Total:', stocks.length);
