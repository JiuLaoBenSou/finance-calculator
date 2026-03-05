/**
 * 主逻辑
 */

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 初始化主题
  ThemeManager.init();

  // 更新主题按钮文字
  updateThemeButton();

  // 初始化移动端菜单
  initMobileMenu();
});

// 移动端菜单
function initMobileMenu() {
  const menuBtn = document.querySelector('.mobile-menu-btn');
  const navLinks = document.querySelector('.nav-links');

  if (menuBtn && navLinks) {
    menuBtn.addEventListener('click', () => {
      navLinks.classList.toggle('show');
    });
  }
}

// 更新主题按钮显示
function updateThemeButton() {
  const themeBtn = document.querySelector('.theme-toggle');
  if (!themeBtn) return;

  const settings = ThemeManager.getSettings();
  const icons = { light: '☀️', dark: '🌙', system: '🖥️' };
  themeBtn.textContent = icons[settings.theme] || '🖥️';
}

// 切换主题（供其他页面调用）
function toggleTheme() {
  const settings = ThemeManager.getSettings();
  const themes = ['light', 'dark', 'system'];
  const currentIndex = themes.indexOf(settings.theme);
  const nextIndex = (currentIndex + 1) % themes.length;

  settings.theme = themes[nextIndex];
  ThemeManager.saveSettings(settings);
  ThemeManager.applySettings(settings);
  updateThemeButton();
}
