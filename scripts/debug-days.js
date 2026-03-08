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
  const code = 'sh600000';
  const days = 2500;
  const url = API_BASE + '/appstock/app/fqkline/get?param=' + code + ',day,,,' + days + ',qfq';
  const raw = await fetchWithCurl(url);

  console.log('Raw length:', raw.length);
  console.log('Raw first 200:', raw.substring(0, 200));

  const response = JSON.parse(raw);
  console.log('response.data:', typeof response.data);
  console.log('response.data keys:', Object.keys(response.data));
  console.log('response.data.sh600000:', response.data[code]);
}

test();
