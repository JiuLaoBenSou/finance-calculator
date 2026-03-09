/**
 * 主题管理模块
 * 处理主题切换、风格选择、涨跌颜色、色盲模式等功能
 */

const ThemeManager = {
  // 默认设置
  defaults: {
    style: 'warm',      // original, warm (风格)
    theme: 'system',    // light, dark, system (界面)
    colorScheme: 'red-green', // green-red, red-green
    colorblind: '0'     // 0, 1, 2
  },

  // 获取设置
  getSettings() {
    const settings = { ...this.defaults };
    const stored = localStorage.getItem('finance-tools-settings');

    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        Object.assign(settings, parsed);
      } catch (e) {
        console.error('Failed to parse settings:', e);
      }
    }

    return settings;
  },

  // 保存设置
  saveSettings(settings) {
    localStorage.setItem('finance-tools-settings', JSON.stringify(settings));
  },

  // 应用设置
  applySettings(settings) {
    const html = document.documentElement;

    // 风格选择
    html.setAttribute('data-style', settings.style || 'warm');

    // 界面主题
    let theme = settings.theme;
    if (theme === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    html.setAttribute('data-theme', theme);

    // 涨跌颜色
    html.setAttribute('data-color-scheme', settings.colorScheme);

    // 色盲模式
    html.setAttribute('data-colorblind', settings.colorblind);

    // 更新本地变量以供JS使用
    this.currentSettings = settings;
  },

  // 初始化
  init() {
    const settings = this.getSettings();
    this.applySettings(settings);

    // 监听系统主题变化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      const currentSettings = this.getSettings();
      if (currentSettings.theme === 'system') {
        this.applySettings(currentSettings);
      }
    });

    return settings;
  },

  // 获取当前涨跌颜色
  getColors() {
    const settings = this.getSettings();
    const colorScheme = settings.colorScheme;

    if (colorScheme === 'red-green') {
      return { up: '#ef5350', down: '#26a69a' };
    }

    // 默认绿涨红跌
    return { up: '#26a69a', down: '#ef5350' };
  },

  // 格式化涨跌
  formatChange(value) {
    const colors = this.getColors();
    const color = value >= 0 ? colors.up : colors.down;
    return `<span style="color: ${color}">${value >= 0 ? '+' : ''}${value.toFixed(2)}</span>`;
  }
};

// 导出
window.ThemeManager = ThemeManager;
