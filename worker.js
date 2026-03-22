/**
 * Cloudflare Workers 网站监控主脚本
 * 用于处理API请求和定时任务
 */

// 导入配置
const config = {
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
  }
};

/**
 * Cloudflare Workers 入口函数
 * @param {Request} request - 传入的请求对象
 * @param {Object} env - 环境变量，包含D1数据库连接
 * @param {Object} ctx - 上下文对象
 * @returns {Response} - 返回响应对象
 */
export default {
  async fetch(request, env, ctx) {
    // 解析请求URL
    const url = new URL(request.url);
    
    // 设置CORS头
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    
    // 处理预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // 根据路径执行不同功能
    try {
      if (url.pathname === '/api/websites') {
        // 获取网站列表和状态
        return handleGetWebsites(request, env, corsHeaders);
      } else if (url.pathname === '/api/stats') {
        // 获取网站统计数据
        return handleGetStats(request, env, corsHeaders);
      } else if (url.pathname === '/api/track') {
        // 记录访问数据
        return handleTrackVisit(request, env, corsHeaders);
      } else if (url.pathname === '/api/overview') {
        // 获取总览数据
        return handleGetOverview(request, env, corsHeaders);
      } else if (url.pathname === '/api/scan') {
        // 手动触发网站扫描
        return handleScan(env, corsHeaders);
      }
      
      // 如果是静态文件请求，返回404
      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('处理请求失败:', error);
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

/**
 * 处理获取网站列表请求
 * @param {Request} request - 传入的请求对象
 * @param {Object} env - 环境变量，包含D1数据库连接
 * @param {Object} corsHeaders - CORS头信息
 * @returns {Response} - 返回网站列表
 */
async function handleGetWebsites(request, env, corsHeaders) {
  try {
    // 从数据库获取网站列表
    let websites = await env.DB.prepare('SELECT * FROM websites').all();
    
    // 如果数据库中没有网站，则初始化
    if (websites.results.length === 0) {
      await initializeWebsites(env);
      websites = await env.DB.prepare('SELECT * FROM websites').all();
    }
    
    // 获取每个网站的最新状态
    const websitesWithStatus = await Promise.all(
      websites.results.map(async (website) => {
        // 获取最新的统计数据
        const latestStat = await env.DB.prepare(
          'SELECT latency, total_visits, unique_visitors FROM access_stats WHERE website_id = ? ORDER BY timestamp DESC LIMIT 1'
        ).bind(website.id).first();
        
        // 确定网站状态
        let status = 'online';
        let statusText = '正常';
        let latestLatency = null;
        
        if (latestStat && latestStat.latency) {
          latestLatency = latestStat.latency;
          
          if (latestLatency >= config.monitoring.thresholds.crowded) {
            status = 'offline';
            statusText = '离线';
          } else if (latestLatency >= config.monitoring.thresholds.normal) {
            status = 'crowded';
            statusText = '拥挤';
          }
        }
        
        return {
          ...website,
          status,
          statusText,
          latestLatency,
          latestVisits: latestStat ? latestStat.total_visits : 0,
          latestUniqueVisitors: latestStat ? latestStat.unique_visitors : 0
        };
      })
    );
    
    // 返回网站列表
    return new Response(JSON.stringify({
      success: true,
      data: websitesWithStatus
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('获取网站列表失败:', error);
    throw error;
  }
}

/**
 * 处理获取网站统计数据请求
 * @param {Request} request - 传入的请求对象
 * @param {Object} env - 环境变量，包含D1数据库连接
 * @param {Object} corsHeaders - CORS头信息
 * @returns {Response} - 返回统计数据
 */
async function handleGetStats(request, env, corsHeaders) {
  try {
    // 解析请求参数
    const url = new URL(request.url);
    const websiteId = url.searchParams.get('website_id');
    
    if (!websiteId) {
      return new Response(JSON.stringify({
        success: false,
        error: '缺少website_id参数'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // 获取网站信息
    const website = await env.DB.prepare(
      'SELECT * FROM websites WHERE id = ?'
    ).bind(websiteId).first();
    
    if (!website) {
      return new Response(JSON.stringify({
        success: false,
        error: '网站不存在'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // 计算时间范围
    const now = new Date();
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // 获取48小时的统计数据
    const hourlyStats = await env.DB.prepare(
      'SELECT timestamp, total_visits, unique_visitors, latency FROM access_stats WHERE website_id = ? AND timestamp >= ? ORDER BY timestamp'
    ).bind(websiteId, fortyEightHoursAgo.getTime()).all();
    
    // 计算今日统计数据
    const todayStats = await env.DB.prepare(
      'SELECT SUM(total_visits) as total_visits, SUM(unique_visitors) as unique_visitors FROM access_stats WHERE website_id = ? AND timestamp >= ?'
    ).bind(websiteId, todayStart.getTime()).first();
    
    // 计算本月统计数据
    const monthStats = await env.DB.prepare(
      'SELECT SUM(unique_visitors) as unique_visitors FROM access_stats WHERE website_id = ? AND timestamp >= ?'
    ).bind(websiteId, monthStart.getTime()).first();
    
    // 计算平均延迟和最大延迟
    let avgLatency = 0;
    let maxLatency = 0;
    
    if (hourlyStats.results.length > 0) {
      const latencies = hourlyStats.results
        .filter(stat => stat.latency !== null)
        .map(stat => stat.latency);
      
      if (latencies.length > 0) {
        avgLatency = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
        maxLatency = Math.max(...latencies);
      }
    }
    
    // 返回统计数据
    return new Response(JSON.stringify({
      success: true,
      data: {
        website,
        hourlyStats: hourlyStats.results,
        today: {
          totalVisits: todayStats ? todayStats.total_visits || 0 : 0,
          uniqueVisitors: todayStats ? todayStats.unique_visitors || 0 : 0
        },
        month: {
          uniqueVisitors: monthStats ? monthStats.unique_visitors || 0 : 0
        },
        latency: {
          average: avgLatency,
          maximum: maxLatency
        }
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('获取统计数据失败:', error);
    throw error;
  }
}

/**
 * 处理获取总览数据请求
 * @param {Request} request - 传入的请求对象
 * @param {Object} env - 环境变量，包含D1数据库连接
 * @param {Object} corsHeaders - CORS头信息
 * @returns {Response} - 返回总览数据
 */
async function handleGetOverview(request, env, corsHeaders) {
  try {
    // 计算时间范围
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    
    // 获取今日总访问量
    const todayTotalVisits = await env.DB.prepare(
      'SELECT SUM(total_visits) as total FROM access_stats WHERE timestamp >= ?'
    ).bind(todayStart.getTime()).first();
    
    // 获取昨日总访问量
    const yesterdayTotalVisits = await env.DB.prepare(
      'SELECT SUM(total_visits) as total FROM access_stats WHERE timestamp >= ? AND timestamp < ?'
    ).bind(yesterdayStart.getTime(), todayStart.getTime()).first();
    
    // 获取本月独立访客数
    const monthUniqueVisitors = await env.DB.prepare(
      'SELECT SUM(unique_visitors) as total FROM access_stats WHERE timestamp >= ?'
    ).bind(monthStart.getTime()).first();
    
    // 获取上月独立访客数
    const lastMonthUniqueVisitors = await env.DB.prepare(
      'SELECT SUM(unique_visitors) as total FROM access_stats WHERE timestamp >= ? AND timestamp < ?'
    ).bind(lastMonthStart.getTime(), monthStart.getTime()).first();
    
    // 计算环比变化
    const todayTotal = todayTotalVisits ? todayTotalVisits.total || 0 : 0;
    const yesterdayTotal = yesterdayTotalVisits ? yesterdayTotalVisits.total || 0 : 0;
    const todayChange = yesterdayTotal > 0 ? ((todayTotal - yesterdayTotal) / yesterdayTotal * 100) : 0;
    
    const monthUnique = monthUniqueVisitors ? monthUniqueVisitors.total || 0 : 0;
    const lastMonthUnique = lastMonthUniqueVisitors ? lastMonthUniqueVisitors.total || 0 : 0;
    const monthChange = lastMonthUnique > 0 ? ((monthUnique - lastMonthUnique) / lastMonthUnique * 100) : 0;
    
    // 返回总览数据
    return new Response(JSON.stringify({
      success: true,
      data: {
        today: {
          totalVisits: todayTotal,
          change: todayChange
        },
        month: {
          uniqueVisitors: monthUnique,
          change: monthChange
        },
        lastUpdated: now.toISOString()
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('获取总览数据失败:', error);
    throw error;
  }
}

/**
 * 处理访问跟踪请求
 * @param {Request} request - 传入的请求对象
 * @param {Object} env - 环境变量，包含D1数据库连接
 * @param {Object} corsHeaders - CORS头信息
 * @returns {Response} - 返回处理结果
 */
async function handleTrackVisit(request, env, corsHeaders) {
  try {
    // 解析请求体
    const data = await request.json();
    
    // 验证必要参数
    if (!data.website_id) {
      return new Response(JSON.stringify({
        success: false,
        error: '缺少website_id参数'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // 检查网站是否存在
    const website = await env.DB.prepare(
      'SELECT * FROM websites WHERE id = ?'
    ).bind(data.website_id).first();
    
    if (!website) {
      return new Response(JSON.stringify({
        success: false,
        error: '网站不存在'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // 获取当前小时的时间戳
    const now = new Date();
    const hourTimestamp = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours()
    ).getTime();
    
    // 查询当前小时的记录
    const result = await env.DB.prepare(
      'SELECT * FROM access_stats WHERE website_id = ? AND timestamp = ?'
    ).bind(data.website_id, hourTimestamp).first();
    
    let totalVisits = 1;
    let uniqueVisitors = data.is_unique ? 1 : 0;
    
    // 如果记录存在，则更新
    if (result) {
      totalVisits = result.total_visits + 1;
      uniqueVisitors = result.unique_visitors + (data.is_unique ? 1 : 0);
      
      await env.DB.prepare(
        'UPDATE access_stats SET total_visits = ?, unique_visitors = ? WHERE id = ?'
      ).bind(totalVisits, uniqueVisitors, result.id).run();
    } else {
      // 否则创建新记录
      await env.DB.prepare(
        'INSERT INTO access_stats (website_id, timestamp, total_visits, unique_visitors) VALUES (?, ?, ?, ?)'
      ).bind(data.website_id, hourTimestamp, totalVisits, uniqueVisitors).run();
    }
    
    // 返回成功响应
    return new Response(JSON.stringify({
      success: true,
      data: {
        totalVisits,
        uniqueVisitors
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('跟踪访问失败:', error);
    throw error;
  }
}

/**
 * 执行网站扫描
 * @param {Object} env - 环境变量，包含D1数据库连接
 * @param {Object} corsHeaders - CORS头信息
 * @returns {Response} - 返回扫描结果
 */
async function handleScan(env, corsHeaders) {
  try {
    const results = [];
    
    // 遍历所有网站进行扫描
    for (const website of config.websites) {
      // 测试网站延迟
      const latency = await testLatency(website.url);
      
      // 确定网站状态
      let status = 'online';
      let statusText = '正常';
      
      if (latency >= config.monitoring.thresholds.crowded) {
        status = 'offline';
        statusText = '离线';
      } else if (latency >= config.monitoring.thresholds.normal) {
        status = 'crowded';
        statusText = '拥挤';
      }
      
      // 保存扫描结果到数据库
      await saveScanResult(env.DB, website.id, latency);
      
      // 添加到结果列表
      results.push({
        websiteId: website.id,
        url: website.url,
        latency,
        status,
        statusText,
        timestamp: new Date().toISOString()
      });
    }
    
    // 返回扫描结果
    return new Response(JSON.stringify({
      success: true,
      data: results,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('扫描失败:', error);
    throw error;
  }
}

/**
 * 初始化网站数据
 * @param {Object} env - 环境变量，包含D1数据库连接
 */
async function initializeWebsites(env) {
  // 创建表结构
  await env.DB.exec(`
    CREATE TABLE IF NOT EXISTS websites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS access_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      website_id INTEGER NOT NULL,
      timestamp TIMESTAMP NOT NULL,
      total_visits INTEGER DEFAULT 0,
      unique_visitors INTEGER DEFAULT 0,
      latency FLOAT,
      FOREIGN KEY (website_id) REFERENCES websites(id)
    );
  `);
  
  // 插入网站数据
  for (const website of config.websites) {
    await env.DB.prepare(
      'INSERT INTO websites (id, name, url) VALUES (?, ?, ?)'
    ).bind(website.id, website.name, website.url).run();
  }
}

/**
 * 测试网站延迟
 * @param {string} url - 要测试的网站URL
 * @returns {Promise<number>} - 返回延迟时间（毫秒）
 */
async function testLatency(url) {
  try {
    const start = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.monitoring.timeout);
    
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow'
      });
      
      clearTimeout(timeoutId);
      const end = performance.now();
      
      return end - start;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        // 请求超时
        return config.monitoring.thresholds.crowded;
      }
      
      throw error;
    }
  } catch (error) {
    console.error(`测试 ${url} 延迟失败:`, error);
    // 发生错误时返回超时值
    return config.monitoring.thresholds.crowded;
  }
}

/**
 * 保存扫描结果到数据库
 * @param {Object} db - D1数据库连接
 * @param {number} websiteId - 网站ID
 * @param {number} latency - 延迟时间
 */
async function saveScanResult(db, websiteId, latency) {
  // 获取当前小时的时间戳
  const now = new Date();
  const hourTimestamp = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours()
  ).getTime();
  
  // 查询当前小时的记录
  const result = await db.prepare(
    'SELECT * FROM access_stats WHERE website_id = ? AND timestamp = ?'
  ).bind(websiteId, hourTimestamp).first();
  
  // 如果记录存在，则更新延迟
  if (result) {
    await db.prepare(
      'UPDATE access_stats SET latency = ? WHERE id = ?'
    ).bind(latency, result.id).run();
  } else {
    // 否则创建新记录
    await db.prepare(
      'INSERT INTO access_stats (website_id, timestamp, total_visits, unique_visitors, latency) VALUES (?, ?, ?, ?, ?)'
    ).bind(websiteId, hourTimestamp, 0, 0, latency).run();
  }
}

/**
 * Cloudflare Workers 定时触发器处理函数
 * 每小时执行一次网站扫描
 * @param {Object} event - 定时触发器事件
 * @param {Object} env - 环境变量，包含D1数据库连接
 * @param {Object} ctx - 上下文对象
 */
export async function scheduled(event, env, ctx) {
  // 执行网站扫描
  await handleScan(env, {});
  
  // 清理过期数据
  await cleanupOldData(env.DB);
}

/**
 * 清理过期数据
 * @param {Object} db - D1数据库连接
 */
async function cleanupOldData(db) {
  // 计算过期时间戳
  const now = new Date();
  const retentionDays = config.monitoring.dataRetentionDays || 30;
  const cutoffTimestamp = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - retentionDays
  ).getTime();
  
  // 删除过期数据
  await db.prepare(
    'DELETE FROM access_stats WHERE timestamp < ?'
  ).bind(cutoffTimestamp).run();
}