# 金融计算器项目开发规范

## 开发流程
1. **本地修改** - 所有代码修改先在本地 `F:\vibe coding\project\Financecaculator` 进行
2. **本地测试** - 确认功能正常后再推送到GitHub
3. **版本备份** - 每个版本都要使用备份脚本备份

## 备份命令
```bash
# 创建备份
node scripts/backup.js "版本描述"

# 查看备份列表
node scripts/backup.js list

# 恢复备份
node scripts/backup.js restore <备份文件名>
```

## 注意事项
- 最多保留3个备份，超过自动删除最早的
- 备份文件保存在 `.backups/` 目录
- 每次GitHub推送前必须先本地备份
- 测试时使用 Ctrl+Shift+R 强制刷新浏览器
