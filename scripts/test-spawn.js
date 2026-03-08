const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PROXY = 'http://127.0.0.1:7890';
const API_BASE = 'https://web.ifzq.gtimg.cn';

function fetchWithCurlSync(code) {
  const url = `${API_BASE}/appstock/app/fqkline/get?param=${code},day,,,5,qfq`;
  const cmd = `curl -x "${PROXY}" -s -L "${url}"`;
  const result = spawnSync('cmd.exe', ['/c', cmd], { encoding: 'utf8' });
  return result.stdout;
}

async function main() {
  console.log('Testing with spawnSync...');

  const testCodes = ['sh600000', 'sh600001', 'sz000001'];

  for (const code of testCodes) {
    const raw = fetchWithCurlSync(code);
    console.log(code + ': ' + raw.substring(0, 100));

    try {
      const response = JSON.parse(raw);
      if (response.data && response.data[code]) {
        console.log('  Success!');
      } else {
        console.log('  No data');
      }
    } catch (e) {
      console.log('  Error:', e.message);
    }

    // Wait
    await new Promise(r => setTimeout(r, 1000));
  }
}

main();
