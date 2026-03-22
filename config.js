/**
 * 网站监控配置文件
 * 在此文件中配置需要监控的网站列表
 */

const config = {
  // 网站列表
  websites: [
    {
      id: 1,
      name: "示例网站",
      url: "https://example.com"
    },
    {
      id: 2,
      name: "GitHub",
      url: "https://github.com"
    },
    {
      id: 3,
      name: "Google",
      url: "https://google.com"
    },
    {
      id: 4,
      name: "Cloudflare",
      url: "https://cloudflare.com"
    },
    {
      id: 5,
      name: "百度",
      url: "https://baidu.com"
    },
    {
      id: 6,
      name: "京东",
      url: "https://jd.com"
    }
  ],
  
  // 监控配置
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
  },
  
  // 界面配置
  ui: {
    // 刷新间隔 (毫秒)
    refreshInterval: 300000, // 5分钟
    
    // 图表配置
    charts: {
      // 柱状图最大显示数据点数量
      maxDataPoints: 48 // 48小时
    }
  }
};