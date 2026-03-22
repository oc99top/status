-- 网站监控数据库模式

-- 创建网站表
CREATE TABLE IF NOT EXISTS websites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建访问统计表
CREATE TABLE IF NOT EXISTS access_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id INTEGER NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  total_visits INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  latency FLOAT,
  FOREIGN KEY (website_id) REFERENCES websites(id)
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_access_stats_website_timestamp ON access_stats(website_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_access_stats_timestamp ON access_stats(timestamp);

-- 插入示例网站数据
INSERT INTO websites (id, name, url) VALUES 
(1, '示例网站', 'https://example.com'),
(2, 'GitHub', 'https://github.com'),
(3, 'Google', 'https://google.com'),
(4, 'Cloudflare', 'https://cloudflare.com'),
(5, '百度', 'https://baidu.com'),
(6, '京东', 'https://jd.com');