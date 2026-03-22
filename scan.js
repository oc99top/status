/**
 * Cloudflare Workers 网站监控脚本
 * 用于检测网站状态并上报访问统计数据
 */

// 导入配置
import { config } from './config.js';

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
    
    // 根据路径执行不同功能
    if (url.pathname === '/api/scan') {
      // 执行网站扫描
      return handleScan(env);
    } else if (url.pathname === '/api/track') {
      // 记录访问数据
      return handleTrack(request, env);
    } else if (url.pathname === '/api/stats') {
      // 获取统计数据
      return handleStats(request, env);
    } else if (url.pathname === '/api/websites') {
      // 获取网站列表
      return handleWebsites(env);
    }
    
    // 返回404
    return new Response('Not Found', { status: 404 });
  }
};

/**
 * 处理网站扫描请求
 * @param {Object} env - 环境变量，包含D1数据库连接
 * @returns {Response} - 返回扫描结果
 */
async function handleScan(env) {
  try {
    const results = [];
    
    // 遍历所有网站进行扫描
    for (const website of config.websites) {
      // 测试网站延迟
      const latency = await testLatency(website.url);
      
      // 确定网站状态
      let status = 'online';
      if (latency >= config.monitoring.thresholds.crowded) {
        status = 'offline';
      } else if (latency >= config.monitoring.thresholds.normal) {
        status = 'crowded';
      }
      
      // 保存扫描结果到数据库
      await saveScanResult(env.DB, website.id, latency, status);
      
      // 添加到结果列表
      results.push({
        websiteId: website.id,
        url: website.url,
        latency,
        status,
        timestamp: new Date().toISOString()
      });
    }
    
    // 返回扫描结果
    return new Response(JSON.stringify({
      success: true,
      results,
      timestamp: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('扫描失败:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * 处理访问跟踪请求
 * @param {Request} request - 传入的请求对象
 * @param {Object} env - 环境变量，包含D1数据库连接
 * @returns {Response} - 返回处理结果
 */
async function handleTrack(request, env) {
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
        headers: { 'Content-Type': 'application/json' }
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
      totalVisits,
      uniqueVisitors
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('跟踪访问失败:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * 处理获取统计数据请求
 * @param {Request} request - 传入的请求对象
 * @param {Object} env - 环境变量，包含D1数据库连接
 * @returns {Response} - 返回统计数据
 */
async function handleStats(request, env) {
  try {
    // 解析请求参数
    const url = new URL(request.url);
    const websiteId = url.searchParams.get('website_id');
    const startTime = url.searchParams.get('start_time');
    const endTime = url.searchParams.get('end_time');
    
    // 构建查询条件
    let query = 'SELECT * FROM access_stats WHERE 1=1';
    const params = [];
    
    if (websiteId) {
      query += ' AND website_id = ?';
      params.push(websiteId);
    }
    
    if (startTime) {
      query += ' AND timestamp >= ?';
      params.push(parseInt(startTime));
    }
    
    if (endTime) {
      query += ' AND timestamp <= ?';
      params.push(parseInt(endTime));
    }
    
    query += ' ORDER BY timestamp';
    
    // 执行查询
    const results = await env.DB.prepare(query).bind(...params).all();
    
    // 返回统计数据
    return new Response(JSON.stringify({
      success: true,
      data: results.results
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('获取统计数据失败:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * 处理获取网站列表请求
 * @param {Object} env - 环境变量，包含D1数据库连接
 * @returns {Response} - 返回网站列表
 */
async function handleWebsites(env) {
  try {
    // 从数据库获取网站列表
    const results = await env.DB.prepare('SELECT * FROM websites').all();
    
    // 返回网站列表
    return new Response(JSON.stringify({
      success: true,
      data: results.results
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('获取网站列表失败:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
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
 * @param {string} status - 网站状态
 */
async function saveScanResult(db, websiteId, latency, status) {
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
  await handleScan(env);
  
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