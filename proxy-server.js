/**
 * 股票数据代理服务器
 * 解决浏览器跨域调用腾讯/东方财富API的问题
 *
 * 使用方法:
 *   node proxy-server.js
 *   然后在前端调用 /api/tencent 或 /api/eastmoney
 */

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 8080;
const PROXY_PORT = process.env.PROXY_PORT || 7890; // 代理端口

// HTTP代理配置
const PROXY = process.env.HTTP_PROXY || `http://127.0.0.1:${PROXY_PORT}`;
const HTTPS_PROXY = process.env.HTTPS_PROXY || `http://127.0.0.1:${PROXY_PORT}`;

// 腾讯API代理
function proxyTencent(req, res) {
  const query = req.url.replace('/api/tencent?', '');
  const targetUrl = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?${query}`;

  console.log(`[Tencent] ${new Date().toISOString()} - ${targetUrl.substring(0, 80)}...`);

  const options = {
    hostname: 'web.ifzq.gtimg.cn',
    path: `/appstock/app/fqkline/get?${query}`,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://web.ifzq.gtimg.cn/'
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('[Tencent] Error:', err.message);
    res.writeHead(500, { 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: err.message }));
  });

  proxyReq.end();
}

// 东方财富API代理
function proxyEastmoney(req, res) {
  const query = req.url.replace('/api/eastmoney?', '');
  const targetUrl = `https://push2.eastmoney.com/api/qt/stock/kline/get?${query}`;

  console.log(`[Eastmoney] ${new Date().toISOString()} - ${targetUrl.substring(0, 80)}...`);

  const options = {
    hostname: 'push2.eastmoney.com',
    path: `/api/qt/stock/kline/get?${query}`,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://quote.eastmoney.com/'
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('[Eastmoney] Error:', err.message);
    res.writeHead(500, { 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: err.message }));
  });

  proxyReq.end();
}

// 股票名称代理
function proxyStockName(req, res) {
  const query = req.url.replace('/api/name?', '');
  const params = new URLSearchParams(query);
  const code = params.get('code');

  if (!code) {
    res.writeHead(400, { 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Missing code parameter' }));
    return;
  }

  const targetUrl = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},day,,,1,qfa`;

  console.log(`[Name] ${new Date().toISOString()} - ${code}`);

  const options = {
    hostname: 'web.ifzq.gtimg.cn',
    path: `/appstock/app/fqkline/get?param=${code},day,,,1,qfa`,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    let data = '';
    proxyRes.on('data', chunk => data += chunk);
    proxyRes.on('end', () => {
      try {
        const json = JSON.parse(data);
        let name = code;
        if (json.data && json.data[code] && json.data[code].qt && json.data[code].qt[code]) {
          name = json.data[code].qt[code][1];
        }
        res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ code, name }));
      } catch (e) {
        res.writeHead(500, { 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  });

  proxyReq.on('error', (err) => {
    console.error('[Name] Error:', err.message);
    res.writeHead(500, { 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: err.message }));
  });

  proxyReq.end();
}

// 静态文件服务
const fs = require('fs');
const path = require('path');

function serveStatic(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);

  const ext = path.extname(filePath);
  const contentTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json'
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
    res.end(data);
  });
}

// 主服务器
const server = http.createServer((req, res) => {
  const pathname = url.parse(req.url).pathname;

  if (pathname.startsWith('/api/tencent')) {
    proxyTencent(req, res);
  } else if (pathname.startsWith('/api/eastmoney')) {
    proxyEastmoney(req, res);
  } else if (pathname.startsWith('/api/name')) {
    proxyStockName(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log('========================================');
  console.log(`🚀 代理服务器运行在 http://localhost:${PORT}`);
  console.log('');
  console.log('API endpoints:');
  console.log(`  - 腾讯K线: /api/tencent?param=sh600519,day,,,100,qfq`);
  console.log(`  - 东方财富K线: /api/eastmoney?secid=1.600519&klt=101&lmt=100`);
  console.log(`  - 股票名称: /api/name?code=sh600519`);
  console.log('');
  console.log('或直接访问静态文件');
  console.log('========================================');
});
