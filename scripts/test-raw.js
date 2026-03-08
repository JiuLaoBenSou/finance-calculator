const { exec } = require('child_process');
const API_BASE = 'https://web.ifzq.gtimg.cn';

function fetchWithCurl(url) {
  return new Promise((resolve, reject) => {
    const cmd = `curl --noproxy "*" -s -L "${url}"`;
    exec(cmd, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

async function test() {
  const url = API_BASE + '/appstock/app/fqkline/get?param=sh600000,day,,,5,qfq';
  console.log('URL:', url);
  const raw = await fetchWithCurl(url);
  console.log('Raw:', raw.substring(0, 200));
  console.log('Raw length:', raw.length);
}

test();
