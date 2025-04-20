const { Level } = require('level'); // 正确导入方式

// 初始化 LevelDB
let db;
try {
  db = new Level('./tokenPoolsDB', { valueEncoding: 'json' });
  console.log('成功初始化 LevelDB');
} catch (error) {
  console.error('无法初始化 LevelDB:', error.message);
  process.exit(1);
}

db.put('testKey', { value: 'test' }, (err) => {
  if (err) {
    console.error('存储 testKey 失败:', err.message);
    return;
  }
  console.log('成功存储 testKey');
  db.get('testKey', (err, value) => {
    if (err) {
      console.error('读取 testKey 失败:', err.message);
      return;
    }
    console.log('读取值:', value);
    db.close((err) => {
      if (err) console.error('关闭数据库失败:', err.message);
    });
  });
});