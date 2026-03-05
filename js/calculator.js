/**
 * 计算器逻辑
 */

// 图表实例
let sipChart = null;
let compoundChart = null;

// 格式化货币
function formatMoney(amount) {
  if (amount >= 100000000) {
    return (amount / 100000000).toFixed(2) + ' 亿';
  } else if (amount >= 10000) {
    return (amount / 10000).toFixed(2) + ' 万';
  }
  return amount.toFixed(2) + ' 元';
}

// 定投计算器
function calculateSIP() {
  const amount = parseFloat(document.getElementById('sip-amount').value);
  const years = parseFloat(document.getElementById('sip-years').value);
  const rate = parseFloat(document.getElementById('sip-rate').value) / 100;

  // 月利率
  const monthlyRate = rate / 12;
  const months = years * 12;

  // 计算定投复利
  // FV = PMT * (((1 + r)^n - 1) / r)
  const futureValue = amount * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
  const principal = amount * months;
  const profit = futureValue - principal;
  const returnRate = (profit / principal) * 100;

  // 显示结果
  document.getElementById('sip-principal').textContent = formatMoney(principal);
  document.getElementById('sip-final').textContent = formatMoney(futureValue);

  const profitEl = document.getElementById('sip-profit');
  profitEl.textContent = formatMoney(profit);
  profitEl.className = 'result-value ' + (profit >= 0 ? 'positive' : 'negative');

  const returnEl = document.getElementById('sip-return');
  returnEl.textContent = returnRate.toFixed(2) + '%';
  returnEl.className = 'result-value ' + (returnRate >= 0 ? 'positive' : 'negative');

  document.getElementById('sip-result').style.display = 'block';

  // 绘制图表
  drawSIPChart(amount, years, monthlyRate);
}

// 绘制定投收益图
function drawSIPChart(monthlyAmount, years, monthlyRate) {
  const ctx = document.getElementById('sip-chart').getContext('2d');
  const months = years * 12;

  const labels = [];
  const principalData = [];
  const valueData = [];

  for (let i = 1; i <= months; i++) {
    if (i % 12 === 0) { // 每年显示一次
      labels.push(`第${i/12}年`);
      principalData.push(monthlyAmount * i);
      valueData.push(monthlyAmount * ((Math.pow(1 + monthlyRate, i) - 1) / monthlyRate));
    }
  }

  if (sipChart) {
    sipChart.destroy();
  }

  sipChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: '账户价值',
          data: valueData,
          borderColor: ThemeManager.getColors().up,
          backgroundColor: 'rgba(38, 166, 154, 0.1)',
          fill: true
        },
        {
          label: '本金',
          data: principalData,
          borderColor: '#999',
          borderDash: [5, 5],
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top'
        }
      },
      scales: {
        y: {
          ticks: {
            callback: value => formatMoney(value)
          }
        }
      }
    }
  });
}

// 复利计算器
function calculateCompound() {
  const principal = parseFloat(document.getElementById('compound-principal').value);
  const rate = parseFloat(document.getElementById('compound-rate').value) / 100;
  const years = parseFloat(document.getElementById('compound-years').value);

  // 复利计算
  const finalAmount = principal * Math.pow(1 + rate, years);
  const profit = finalAmount - principal;

  // 显示结果
  document.getElementById('compound-final').textContent = formatMoney(finalAmount);

  const profitEl = document.getElementById('compound-profit');
  profitEl.textContent = formatMoney(profit);
  profitEl.className = 'result-value ' + (profit >= 0 ? 'positive' : 'negative');

  document.getElementById('compound-result').style.display = 'block';

  // 绘制图表
  drawCompoundChart(principal, rate, years);
}

// 绘制复利增长图
function drawCompoundChart(principal, rate, years) {
  const ctx = document.getElementById('compound-chart').getContext('2d');

  const labels = [];
  const valueData = [];

  for (let i = 0; i <= years; i++) {
    labels.push(`第${i}年`);
    valueData.push(principal * Math.pow(1 + rate, i));
  }

  if (compoundChart) {
    compoundChart.destroy();
  }

  compoundChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: '本息总额',
        data: valueData,
        borderColor: ThemeManager.getColors().up,
        backgroundColor: 'rgba(38, 166, 154, 0.1)',
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top'
        }
      },
      scales: {
        y: {
          ticks: {
            callback: value => formatMoney(value)
          }
        }
      }
    }
  });
}

// 股票收益计算器
function calculateStock() {
  const buyPrice = parseFloat(document.getElementById('stock-buy-price').value);
  const sellPrice = parseFloat(document.getElementById('stock-sell-price').value);
  const quantity = parseInt(document.getElementById('stock-quantity').value);
  const feeRate = parseFloat(document.getElementById('stock-fee-rate').value) / 100;
  const stampRate = parseFloat(document.getElementById('stock-stamp-rate').value) / 100;

  // 买入成本 = 买入价格 * 数量 * (1 + 手续费率)
  const buyCost = buyPrice * quantity * (1 + feeRate);

  // 卖出收入 = 卖出价格 * 数量 * (1 - 手续费率 - 印花税率)
  const sellIncome = sellPrice * quantity * (1 - feeRate - stampRate);

  // 手续费
  const fee = buyPrice * quantity * feeRate + sellPrice * quantity * feeRate;

  // 印花税
  const stamp = sellPrice * quantity * stampRate;

  // 净利润
  const netProfit = sellIncome - buyCost;

  // 收益率
  const returnRate = (netProfit / (buyPrice * quantity)) * 100;

  // 显示结果
  document.getElementById('stock-buy-cost').textContent = formatMoney(buyCost);
  document.getElementById('stock-sell-income').textContent = formatMoney(sellIncome);
  document.getElementById('stock-fee').textContent = formatMoney(fee);
  document.getElementById('stock-stamp').textContent = formatMoney(stamp);

  const profitEl = document.getElementById('stock-net-profit');
  profitEl.textContent = formatMoney(netProfit);
  profitEl.className = 'result-value ' + (netProfit >= 0 ? 'positive' : 'negative');

  const returnEl = document.getElementById('stock-return');
  returnEl.textContent = returnRate.toFixed(2) + '%';
  returnEl.className = 'result-value ' + (returnRate >= 0 ? 'positive' : 'negative');

  document.getElementById('stock-result').style.display = 'block';
}

// PE 估值计算器
function calculatePE() {
  const eps = parseFloat(document.getElementById('pe-eps').value);
  const industryPE = parseFloat(document.getElementById('pe-industry').value);

  // 合理价格 = EPS * PE
  const price = eps * industryPE;
  const lowPrice = price * 0.8;
  const highPrice = price * 1.2;

  document.getElementById('pe-price').textContent = formatMoney(price);
  document.getElementById('pe-range').textContent =
    formatMoney(lowPrice) + ' ~ ' + formatMoney(highPrice);

  document.getElementById('pe-result').style.display = 'block';
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  ThemeManager.init();
});
