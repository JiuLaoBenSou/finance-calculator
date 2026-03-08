const { exec } = require('child_process');

const PROXY = 'http://127.0.0.1:7890';
const API_BASE = 'https://web.ifzq.gtimg.cn';

function fetchWithCurl(url) {
  return new Promise((resolve, reject) => {
    const cmd = 'curl -x "' + PROXY + '" -s -L "' + url + '"';
    exec(cmd, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

async function test() {
  const url = API_BASE + '/appstock/app/fqkline/get?param=sh600000,day,,,5,qfq';
  const raw = await fetchWithCurl(url);

  console.log('Raw length:', raw.length);
  console.log('Raw starts with:', raw.substring(0, 50));

  const response = JSON.parse(raw);
  console.log('Response keys:', Object.keys(response));
  console.log('response.data:', response.data);
  console.log('response.data.sh600000:', response.data ? response.data.sh600000 : 'no data');
}

test();
