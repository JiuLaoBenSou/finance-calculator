/**
 * 本地版本备份脚本
 * 自动备份项目，最多保留3个版本
 * 使用方法: node scripts/backup.js "版本描述"
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_DIR = path.join(__dirname, '..');
const BACKUP_DIR = path.join(PROJECT_DIR, '.backups');

// 最大保留版本数
const MAX_BACKUPS = 3;

function getBackupList() {
  if (!fs.existsSync(BACKUP_DIR)) {
    return [];
  }
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('backup-') && f.endsWith('.zip'))
    .sort()
    .reverse();
}

function createBackup(description) {
  // 确保备份目录存在
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // 生成版本号
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const version = description ? `${timestamp}-${description}` : timestamp;
  const backupFile = path.join(BACKUP_DIR, `backup-${version}.zip`);

  console.log(`创建备份: backup-${version}.zip`);

  // 使用git archive创建zip备份（只包含代码，不包含.git）
  try {
    execSync(`git archive -o "${backupFile}" --prefix=finance-calculator/ HEAD`, {
      cwd: PROJECT_DIR,
      stdio: 'pipe'
    });
    console.log(`✅ 备份成功: ${backupFile}`);
  } catch (e) {
    console.error('❌ 备份失败:', e.message);
    return false;
  }

  // 检查并删除旧版本
  const backups = getBackupList();
  console.log(`\n当前备份数: ${backups.length}/${MAX_BACKUPS}`);

  if (backups.length > MAX_BACKUPS) {
    const toDelete = backups.slice(MAX_BACKUPS);
    console.log(`\n删除旧版本 (保留最新${MAX_BACKUPS}个):`);
    toDelete.forEach(f => {
      const filePath = path.join(BACKUP_DIR, f);
      fs.unlinkSync(filePath);
      console.log(`  ❌ 删除: ${f}`);
    });
  }

  console.log('\n📦 备份列表:');
  getBackupList().forEach((f, i) => {
    console.log(`  ${i + 1}. ${f}`);
  });

  return true;
}

function restoreBackup(backupFile) {
  const filePath = path.join(BACKUP_DIR, backupFile);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 备份文件不存在: ${backupFile}`);
    return false;
  }

  console.log(`从 ${backupFile} 恢复...`);

  // 备份当前版本
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const emergencyBackup = path.join(BACKUP_DIR, `emergency-${timestamp}.zip`);
  console.log('创建紧急备份...');
  try {
    execSync(`git archive -o "${emergencyBackup}" --prefix=finance-calculator/ HEAD`, {
      cwd: PROJECT_DIR,
      stdio: 'pipe'
    });
  } catch (e) {
    console.error('警告: 无法创建紧急备份', e.message);
  }

  // 解压恢复
  try {
    // 清理当前目录（保留.backups）
    const files = fs.readdirSync(PROJECT_DIR);
    files.forEach(f => {
      if (f !== '.backups' && f !== '.git') {
        const fullPath = path.join(PROJECT_DIR, f);
        if (fs.statSync(fullPath).isDirectory()) {
          execSync(`rm -rf "${fullPath}"`);
        } else {
          fs.unlinkSync(fullPath);
        }
      }
    });

    // 解压备份
    execSync(`unzip -o "${filePath}"`, { cwd: PROJECT_DIR });
    console.log('✅ 恢复成功！');
    console.log(`紧急备份: ${emergencyBackup}`);
    return true;
  } catch (e) {
    console.error('❌ 恢复失败:', e.message);
    return false;
  }
}

function listBackups() {
  const backups = getBackupList();
  if (backups.length === 0) {
    console.log('没有备份');
    return;
  }
  console.log('📦 备份列表:');
  backups.forEach((f, i) => {
    const stats = fs.statSync(path.join(BACKUP_DIR, f));
    const size = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`  ${i + 1}. ${f} (${size} MB)`);
  });
}

// 命令行参数处理
const args = process.argv.slice(2);
const command = args[0];

if (command === 'list') {
  listBackups();
} else if (command === 'restore') {
  if (!args[1]) {
    console.log('用法: node backup.js restore <备份文件名>');
    console.log('示例: node backup.js restore backup-2026-03-09-12-00-00.zip');
  } else {
    restoreBackup(args[1]);
  }
} else if (command === 'help') {
  console.log(`
本地版本备份脚本
使用说明:
  node backup.js [命令] [参数]

命令:
  node backup.js "版本描述"    - 创建新备份
  node backup.js list          - 列出所有备份
  node backup.js restore <文件> - 恢复指定备份
  node backup.js help          - 显示帮助

示例:
  node backup.js "修复搜索问题"
  node backup.js list
  node backup.js restore backup-2026-03-09-12-00-00.zip
`);
} else {
  // 默认创建备份
  const description = command || 'auto-backup';
  createBackup(description.replace(/[^a-zA-Z0-9-]/g, '-'));
}
