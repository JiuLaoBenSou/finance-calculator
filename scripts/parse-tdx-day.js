/**
 * 解析通达信日线数据 (.day文件)
 * 格式：每条记录32字节
 * - date: 4字节 (交易日，从1990年开始的天数偏移)
 * - open/high/low/close: 4字节 (价格，乘以10000)
 * - amount: 4字节 (成交额)
 * - volume: 4字节 (成交量)
 * - turnover: 4字节 (换手率，乘以10000)
 */

const fs = require('fs');
const path = require('path');

function parseTdxDayFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const records = [];
  const recordSize = 32;
  const count = Math.floor(buffer.length / recordSize);

  for (let i = 0; i < count; i++) {
    const offset = i * recordSize;

    // 日期：4字节整数，直接是 YYYYMMDD 格式
    // 例如: 0x01321b63 = 20061027 = 2006-10-27
    const dateNum = buffer.readUInt32LE(offset);
    const dateStr = String(dateNum).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');

    // 开盘价：4字节，低位在前，乘以10000
    const open = buffer.readUInt32LE(offset + 4) / 10000;

    // 最高价
    const high = buffer.readUInt32LE(offset + 8) / 10000;

    // 最低价
    const low = buffer.readUInt32LE(offset + 12) / 10000;

    // 收盘价
    const close = buffer.readUInt32LE(offset + 16) / 10000;

    // 成交额
    const amount = buffer.readUInt32LE(offset + 20);

    // 成交量
    const volume = buffer.readUInt32LE(offset + 24);

    // 换手率
    const turnover = buffer.readUInt32LE(offset + 28) / 10000;

    records.push({
      date: dateStr,
      open,
      high,
      low,
      close,
      volume,
      amount,
      turnover
    });
  }

  // 按日期排序（从早到晚）
  records.sort((a, b) => a.date.localeCompare(b.date));

  return records;
}

// 测试解析一个文件
const testFile = process.argv[2];
if (testFile) {
  const data = parseTdxDayFile(testFile);
  console.log('Records:', data.length);
  console.log('First date:', data[0].date);
  console.log('Last date:', data[data.length - 1].date);
  console.log('Sample:', JSON.stringify(data[0], null, 2));
}

module.exports = { parseTdxDayFile };
