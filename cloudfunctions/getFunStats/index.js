// cloudfunctions/getFunStats/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    // 1. 一次性拉取最近 1000 条已完赛记录
    const res = await db.collection('matches')
      .where({ status: 1 })
      .limit(1000)
      .get()
    
    const matches = res.data

    // === 开始所有计算逻辑 ===
    let playerNames = {}
    let matchCountMap = {} // 卷王
    let opponentMap = {}   // 海王
    let pairCountMap = {}  // 真爱
    let winCounts = {}     // 严父
    
    // 连胜需要按时间正序（旧 -> 新）
    let sortedMatches = [...matches].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    let currentStreakMap = {}
    let maxStreakMap = {}

    // 遍历每一场比赛
    sortedMatches.forEach(m => {
      const p1 = String(m.player1)
      const p2 = String(m.player2)
      const winner = String(m.winner)

      // 记录名字
      if (m.player1_name) playerNames[p1] = m.player1_name
      if (m.player2_name) playerNames[p2] = m.player2_name

      if (!m.winner) return;

      const loser = (winner === p1) ? p2 : p1

      // A. 卷王 (总场次)
      matchCountMap[p1] = (matchCountMap[p1] || 0) + 1
      matchCountMap[p2] = (matchCountMap[p2] || 0) + 1

      // B. 海王 (对手数量)
      if (!opponentMap[p1]) opponentMap[p1] = new Set()
      if (!opponentMap[p2]) opponentMap[p2] = new Set()
      opponentMap[p1].add(p2)
      opponentMap[p2].add(p1)

      // C. 真爱 & 严父数据准备
      const idA = p1 < p2 ? p1 : p2
      const idB = p1 < p2 ? p2 : p1
      const pairKey = `${idA}_${idB}`
      pairCountMap[pairKey] = (pairCountMap[pairKey] || 0) + 1

      if (!winCounts[winner]) winCounts[winner] = {}
      if (!winCounts[winner][loser]) winCounts[winner][loser] = 0
      winCounts[winner][loser]++

      // D. 连胜计算
      currentStreakMap[winner] = (currentStreakMap[winner] || 0) + 1
      if ((currentStreakMap[winner] || 0) > (maxStreakMap[winner] || 0)) {
        maxStreakMap[winner] = currentStreakMap[winner]
      }
      currentStreakMap[loser] = 0
    })

    // === 生成最终榜单数组 ===

    // 1. 卷王榜 (前3)
    const juanwang = Object.keys(matchCountMap).map(id => ({
      name: playerNames[id] || '未知',
      count: matchCountMap[id]
    })).sort((a, b) => b.count - a.count).slice(0, 3)

    // 2. 海王榜 (前3)
    const haiwang = Object.keys(opponentMap).map(id => ({
      name: playerNames[id] || '未知',
      count: opponentMap[id].size
    })).sort((a, b) => b.count - a.count).slice(0, 3)

    // 3. 连胜榜 (至少5连胜, 前10)
    const liansheng = Object.keys(maxStreakMap).map(id => ({
      name: playerNames[id] || '未知',
      count: maxStreakMap[id]
    })).filter(i => i.count >=5)
      .sort((a, b) => b.count - a.count).slice(0, 10)

    // 4. 真爱榜 (至少5场, 前5)
    const zhenai = Object.keys(pairCountMap).map(key => {
      const [id1, id2] = key.split('_')
      return {
        p1: playerNames[id1] || '未知',
        p2: playerNames[id2] || '未知',
        count: pairCountMap[key],
        unique: key
      }
    }).filter(i => i.count >= 5)
      .sort((a, b) => b.count - a.count).slice(0, 5)

    // 5. 严父/福星榜
    let yanfuResults = []
    for (let winnerId in winCounts) {
      for (let loserId in winCounts[winnerId]) {
        const idA = winnerId < loserId ? winnerId : loserId
        const idB = winnerId < loserId ? loserId : winnerId
        const win = winCounts[winnerId][loserId]
        const total = pairCountMap[`${idA}_${idB}`] || 0

        // 规则：至少3场，胜率 >= 80%
        if (total >= 3 && (win / total >= 0.8)) {
          yanfuResults.push({
            winner: playerNames[winnerId] || '未知',
            loser: playerNames[loserId] || '未知',
            win_count: win,
            total_count: total,
            rate: Math.round((win / total) * 100) + '%',
            unique: `${winnerId}_${loserId}`
          })
        }
      }
    }
    yanfuResults.sort((a, b) => b.win_count - a.win_count)

    // 返回计算好的数据
    return {
      success: true,
      data: {
        juanwangList: juanwang,
        haiwangList: haiwang,
        lianshengList: liansheng,
        zhenaiList: zhenai,
        yanfuList: yanfuResults, // 严父榜
        fuxingList: yanfuResults // 福星榜数据源一样
      }
    }

  } catch (e) {
    console.error(e)
    return { success: false, error: e }
  }
}