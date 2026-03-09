/**
 * 设置页面逻辑
 */

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  ThemeManager.init();
  loadSettings();
  setupEventListeners();
});

// 加载设置到界面
function loadSettings() {
  const settings = ThemeManager.getSettings();

  // 风格选择
  document.querySelectorAll('#style-options .radio-label').forEach(label => {
    label.classList.remove('selected');
    if (label.dataset.value === (settings.style || 'warm')) {
      label.classList.add('selected');
      label.querySelector('input').checked = true;
    }
  });

  // 主题
  document.querySelectorAll('#theme-options .radio-label').forEach(label => {
    label.classList.remove('selected');
    if (label.dataset.value === settings.theme) {
      label.classList.add('selected');
      label.querySelector('input').checked = true;
    }
  });

  // 涨跌颜色
  document.querySelectorAll('#color-scheme-options .radio-label').forEach(label => {
    label.classList.remove('selected');
    if (label.dataset.value === settings.colorScheme) {
      label.classList.add('selected');
      label.querySelector('input').checked = true;
    }
  });

  // 色盲模式
  document.querySelectorAll('#colorblind-options .radio-label').forEach(label => {
    label.classList.remove('selected');
    if (label.dataset.value === settings.colorblind) {
      label.classList.add('selected');
      label.querySelector('input').checked = true;
    }
  });
}

// 设置事件监听
function setupEventListeners() {
  // 风格选择
  document.querySelectorAll('#style-options .radio-label').forEach(label => {
    label.addEventListener('click', () => {
      const value = label.dataset.value;
      document.querySelectorAll('#style-options .radio-label').forEach(l => l.classList.remove('selected'));
      label.classList.add('selected');

      const settings = ThemeManager.getSettings();
      settings.style = value;
      ThemeManager.saveSettings(settings);
      ThemeManager.applySettings(settings);
    });
  });

  // 主题选择
  document.querySelectorAll('#theme-options .radio-label').forEach(label => {
    label.addEventListener('click', () => {
      const value = label.dataset.value;
      document.querySelectorAll('#theme-options .radio-label').forEach(l => l.classList.remove('selected'));
      label.classList.add('selected');

      const settings = ThemeManager.getSettings();
      settings.theme = value;
      ThemeManager.saveSettings(settings);
      ThemeManager.applySettings(settings);
    });
  });

  // 涨跌颜色选择
  document.querySelectorAll('#color-scheme-options .radio-label').forEach(label => {
    label.addEventListener('click', () => {
      const value = label.dataset.value;
      document.querySelectorAll('#color-scheme-options .radio-label').forEach(l => l.classList.remove('selected'));
      label.classList.add('selected');

      const settings = ThemeManager.getSettings();
      settings.colorScheme = value;
      ThemeManager.saveSettings(settings);
      ThemeManager.applySettings(settings);
    });
  });

  // 色盲模式选择
  document.querySelectorAll('#colorblind-options .radio-label').forEach(label => {
    label.addEventListener('click', () => {
      const value = label.dataset.value;
      document.querySelectorAll('#colorblind-options .radio-label').forEach(l => l.classList.remove('selected'));
      label.classList.add('selected');

      const settings = ThemeManager.getSettings();
      settings.colorblind = value;
      ThemeManager.saveSettings(settings);
      ThemeManager.applySettings(settings);
    });
  });
}

// 重置设置
function resetSettings() {
  if (confirm('确定要恢复所有设置为默认值吗？')) {
    localStorage.removeItem('finance-tools-settings');
    ThemeManager.applySettings(ThemeManager.defaults);
    loadSettings();
  }
}
