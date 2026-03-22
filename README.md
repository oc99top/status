# 网站状态监控平台

一个基于Cloudflare Workers和D1数据库的网站访问统计与状态监控平台，支持多设备自适应，界面美观大方。

## 功能特点

- 📊 **访问统计**：展示今日累计访问量和本月独立访客数
- 📱 **响应式设计**：完美适配桌面、平板和移动设备
- 🕒 **实时监控**：每小时自动检测网站状态和延迟
- 📈 **数据可视化**：使用图表直观展示访问量和延迟变化
- 🔍 **详细分析**：点击卡片查看网站详细统计信息
- ⚡ **高性能**：基于Cloudflare Workers，快速响应

## 技术栈

- **前端**：HTML5, CSS3 (Tailwind CSS), JavaScript (Chart.js)
- **后端**：Cloudflare Workers
- **数据库**：Cloudflare D1 (SQLite)

## 快速开始

### 1. 前置要求

- Cloudflare账户
- 已启用Cloudflare Workers和D1数据库

### 2. 配置D1数据库

1. 创建D1数据库实例
2. 执行以下SQL语句创建所需表结构：

```sql
-- 创建网站表
CREATE TABLE websites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建访问统计表
CREATE TABLE access_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id INTEGER NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  total_visits INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  latency FLOAT,
  FOREIGN KEY (website_id) REFERENCES websites(id)
);

-- 插入示例网站数据
INSERT INTO websites (name, url) VALUES 
('示例网站', 'https://example.com'),
('GitHub', 'https://github.com'),
('Google', 'https://google.com');
```

### 3. 部署Cloudflare Workers

1. 克隆本仓库
2. 安装依赖：

```bash
npm install
```

3. 登录Cloudflare：

```bash
wrangler login
```

4. 创建D1数据库：

```bash
wrangler d1 create website-monitor-db
```

5. 更新`wrangler.toml`文件中的`database_id`为您创建的数据库ID

6. 初始化数据库表结构：

```bash
npm run db:init
```

7. 本地开发测试（可选）：

```bash
npm run dev
```

8. 部署到Cloudflare：

```bash
npm run deploy
```

### 4. 配置前端页面

1. 打开`index.html`文件，找到API配置部分：

```javascript
const apiConfig = {
    // 替换为您的Cloudflare Workers URL
    baseUrl: 'https://your-worker.your-username.workers.dev/api'
};
```

2. 将`baseUrl`替换为您部署的Cloudflare Workers URL

3. 将更新后的`index.html`部署到您的静态网站托管服务（如Cloudflare Pages、GitHub Pages等）

## 使用说明

### 配置监控网站

网站配置现在存储在`worker.js`文件中的`config`对象中：

```javascript
const config = {
  websites: [
    {
      id: 1,
      name: "示例网站",
      url: "https://example.com"
    },
    // 添加更多网站...
  ],
  // ...其他配置
};
```

修改后需要重新部署Worker：

```bash
npm run deploy
```

如果您想在不修改代码的情况下管理网站，可以使用SQL语句直接操作D1数据库：

```bash
# 添加新网站
wrangler d1 execute website-monitor-db --command="INSERT INTO websites (name, url) VALUES ('新网站', 'https://new-website.com')"

# 查看所有网站
npm run db:preview
```

### 自定义监控参数

在`config.js`文件中，您可以自定义以下监控参数：

```javascript
const config = {
  // ...网站配置
  monitoring: {
    // 延迟测试超时阈值 (毫秒)
    timeout: 1000,
    
    // 延迟状态阈值 (毫秒)
    thresholds: {
      // 正常状态最大延迟
      normal: 500,
      // 拥挤状态最大延迟
      crowded: 1000
    },
    
    // 数据保留时间 (天)
    dataRetentionDays: 30
  }
};
```

### 查看网站状态

1. 打开部署的前端页面
2. 主页将显示所有网站的总览数据和状态卡片
3. 点击任意卡片可查看该网站的详细统计信息

## 数据说明

### 状态标识

- 🟢 **正常**：网站延迟低于500ms
- 🟡 **拥挤**：网站延迟在500ms-1000ms之间
- 🔴 **离线**：网站延迟超过1000ms或无法访问

### 统计指标

- **今日累计访问量**：从今天0点到现在的所有访问次数
- **今日独立访客**：从今天0点到现在的独立访客数量
- **本月独立访客**：从本月1号到现在的独立访客数量
- **平均延迟**：过去48小时的平均延迟时间
- **最高延迟**：过去48小时的最高延迟时间

## 构建和部署命令

### 构建命令
```bash
npm run build
```

### 部署命令
```bash
npm run deploy
```

### 数据库初始化
```bash
npm run db:init
```

### 查看数据库内容
```bash
npm run db:preview
```

## 故障排除

### 网站显示为离线但实际可访问

1. 检查`config.js`中的网站URL是否正确
2. 调整`monitoring.timeout`和`monitoring.thresholds`参数
3. 确认Cloudflare Workers可以访问该网站（某些网站可能屏蔽了Cloudflare IP）

### 数据不更新

1. 检查Cloudflare Workers定时触发器是否正常工作
2. 验证D1数据库连接是否正确配置
3. 查看Workers日志以获取详细错误信息

## 许可证

MIT License