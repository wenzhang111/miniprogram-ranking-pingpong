// cloudfunctions/tournamentEngine/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  // 接收参数
  const { action, tournament_id, group_size, advance_count, seed_ids } = event

  try {
    // ==============================================================================
    // 🚀 动作 1：启动小组赛 (发牌算法保证绝对公平)
    // ==============================================================================
    if (action === 'start_group') {
      const checkExist = await db.collection('matches').where({
        tournament_id, stage: 'group'
      }).count()
      if (checkExist.total > 0) return { success: false, msg: '小组赛已存在' }

      const regRes = await db.collection('registrations').where({ tournament_id }).get()
      let players = regRes.data
      if (players.length < 3) return { success: false, msg: '报名人数不足' }

      // 1. 种子与闲家分离
      let seeds = []
      let others = []
      if (seed_ids && seed_ids.length > 0) {
        seed_ids.forEach(sid => {
          const p = players.find(item => item.player_id === sid)
          if (p) seeds.push(p)
        })
        others = players.filter(p => !seed_ids.includes(p.player_id))
      } else {
        others = players
      }

      // 2. 闲家随机洗牌
      for (let i = others.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [others[i], others[j]] = [others[j], others[i]];
      }

      // 3. 准备容器
      const groups = [] 
      const groupNames = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N']
      // 计算分组数量：比如14人，每组4人 -> 分4组
      const numGroups = Math.ceil(players.length / group_size)
      for (let i = 0; i < numGroups; i++) groups[i] = [];
      
      // 4. 【核心公平算法】发牌式分配
      // 就像发扑克牌一样，一人发一张，转圈发。
      // 这样 14 人分 4 组会自动变成：4, 4, 3, 3 (最公平)
      
      // A. 先发种子 (蛇形：1->A, 2->Last...)
      let topPointer = 0
      let bottomPointer = numGroups - 1
      let placeTop = true

      seeds.forEach(p => {
        if (placeTop) {
          groups[topPointer].push(p)
          topPointer++
        } else {
          groups[bottomPointer].push(p)
          bottomPointer--
        }
        if (topPointer > bottomPointer) { topPointer = 0; bottomPointer = numGroups - 1; }
        placeTop = !placeTop
      })

      // B. 再发闲家 (接着刚才的顺序继续转圈发)
      // 这里的 currentGroupIdx 是关键，保证接着种子没发完的地方继续
      let currentGroupIdx = seeds.length % numGroups 
      
      others.forEach(p => {
        groups[currentGroupIdx].push(p)
        currentGroupIdx = (currentGroupIdx + 1) % numGroups
      })

      // 5. 生成对阵
      const matches = []
      const groupUpdates = [] 

      groups.forEach((groupPlayers, gIdx) => {
        const groupName = groupNames[gIdx] + '组'
        groupPlayers.forEach(p => {
          groupUpdates.push(
            db.collection('registrations').doc(p._id).update({ data: { group: groupName } })
          )
        })

        for (let i = 0; i < groupPlayers.length; i++) {
          for (let j = i + 1; j < groupPlayers.length; j++) {
            matches.push({
              tournament: players[0].tournament_title || '小组赛',
              tournament_id: tournament_id,
              stage: 'group',
              group: groupName,
              player1: groupPlayers[i].player_id,
              player1_name: groupPlayers[i].player_name,
              player2: groupPlayers[j].player_id,
              player2_name: groupPlayers[j].player_name,
              status: 0,
              created_at: new Date()
            })
          }
        }
      })

      for (let m of matches) await db.collection('matches').add({ data: m })
      await Promise.all(groupUpdates)
      await db.collection('tournaments').doc(tournament_id).update({ 
        data: { stage: 1, config: { group_size: Number(group_size), advance: Number(advance_count) } } 
      })

      return { success: true, msg: `分组完成` }
    }
    // ==============================================================================
    // 🚀 动作 2：启动淘汰赛 (计算积分 + 晋级 + 轮空)
    // ==============================================================================
    else if (action === 'start_knockout') {
      
      // 0. 防重复锁：严格检查
      const checkExist = await db.collection('matches').where({
        tournament_id, stage: 'knockout'
      }).count()
      if (checkExist.total > 0) return { success: false, msg: '淘汰赛已存在，请勿重复操作' }

      const tourRes = await db.collection('tournaments').doc(tournament_id).get()
      const advanceNum = tourRes.data.config.advance || 2
      const tourTitle = tourRes.data.title || '淘汰赛'

      // 1. 拉取小组赛记录
      const matchRes = await db.collection('matches').where({
        tournament_id: tournament_id, stage: 'group', status: 1
      }).limit(1000).get()
      
      // 2. 算分
      let stats = {}
      matchRes.data.forEach(m => {
        if (!stats[m.player1]) stats[m.player1] = { id: m.player1, name: m.player1_name, group: m.group, score: 0 }
        if (!stats[m.player2]) stats[m.player2] = { id: m.player2, name: m.player2_name, group: m.group, score: 0 }
        if (m.winner == m.player1) { stats[m.player1].score += 2; stats[m.player2].score += 1; }
        else { stats[m.player2].score += 2; stats[m.player1].score += 1; }
      })

      // 3. 选出线者
      let groupRankings = {}
      Object.values(stats).forEach(p => {
        if (!groupRankings[p.group]) groupRankings[p.group] = []
        groupRankings[p.group].push(p)
      })

      let qualifiers = [] 
      for (let gName in groupRankings) {
        groupRankings[gName].sort((a, b) => b.score - a.score)
        qualifiers = qualifiers.concat(groupRankings[gName].slice(0, advanceNum))
      }

      const N = qualifiers.length
      if (N < 2) return { success: false, msg: '出线人数不足' }

      // 4. 计算轮空 (补齐 2, 4, 8, 16...)
      let targetSize = 2
      while (targetSize < N) { targetSize *= 2 }
      const byeCount = targetSize - N

      // 5. 按积分排序 (高分优先轮空)
      qualifiers.sort((a, b) => b.score - a.score)

      const bracketMatches = []
      let roundName = `淘汰赛 第1轮 (${targetSize}强)`
      let pIdx = 0

      // A. 轮空组
      for (let i = 0; i < byeCount; i++) {
        const p = qualifiers[pIdx]
        bracketMatches.push({
          tournament: tourTitle, tournament_id, stage: 'knockout',
          round_index: 1, round: roundName,
          player1: p.id, player1_name: p.name,
          player2: -1, player2_name: '轮空(直接晋级)',
          winner: p.id, status: 1, created_at: new Date()
        })
        pIdx++
      }

      // B. 对战组 (剩下的洗牌配对)
      let remaining = qualifiers.slice(pIdx)
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }

      for (let i = 0; i < remaining.length; i += 2) {
        if (i + 1 < remaining.length) {
          bracketMatches.push({
            tournament: tourTitle, tournament_id, stage: 'knockout',
            round_index: 1, round: roundName, 
            player1: remaining[i].id, player1_name: remaining[i].name,
            player2: remaining[i+1].id, player2_name: remaining[i+1].name,
            status: 0, created_at: new Date()
          })
        }
      }

      // 6. 写入
      for (let m of bracketMatches) await db.collection('matches').add({ data: m })
      await db.collection('tournaments').doc(tournament_id).update({ data: { stage: 2 } })

      return { success: true, msg: `晋级 ${N} 人` }
    }

    // ==============================================================================
    // 🚀 动作 3：生成下一轮 (修复版：不依赖数据库排序，手动找最大轮次)
    // ==============================================================================
    else if (action === 'next_round') {
      
      // 1. 获取所有淘汰赛记录 (不加 limit，防止记录多漏掉)
      // 注意：这里不使用 orderBy，防止索引问题导致查不到
      const allKnockoutRes = await db.collection('matches').where({
        tournament_id, stage: 'knockout'
      }).limit(1000).get()
      
      if (allKnockoutRes.data.length === 0) return { success: false, msg: '无淘汰赛数据' }
      
      // 2. 【关键】在内存中计算当前最大轮次
      const allMatches = allKnockoutRes.data
      let maxRound = 0
      allMatches.forEach(m => {
        if (m.round_index > maxRound) maxRound = m.round_index
      })
      
      const currentRoundIndex = maxRound
      const nextRoundIndex = maxRound + 1
      
      // 2.5 防重复：看看下一轮是不是已经有了？
      const hasNext = allMatches.some(m => m.round_index === nextRoundIndex)
      if (hasNext) return { success: false, msg: '下一轮已存在，请勿重复生成' }

      // 3. 筛选出本轮比赛
      const currentMatches = allMatches.filter(m => m.round_index === currentRoundIndex)
      
      // 按时间排序，保证对阵树顺序
      currentMatches.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

      // 4. 检查完赛
      const unfinished = currentMatches.filter(m => m.status === 0)
      if (unfinished.length > 0) return { success: false, msg: `本轮还有 ${unfinished.length} 场未完赛` }

      // 5. 提取胜者
      const winners = []
      const tourTitle = currentMatches[0].tournament || '淘汰赛'

      for (let m of currentMatches) {
        let wId = String(m.winner)
        // 轮空处理
        if (m.player2 == -1) {
          winners.push({ id: m.player1, name: m.player1_name })
          continue
        }
        // 正常处理
        if (!m.winner) continue;
        
        if (wId === String(m.player1)) winners.push({ id: m.player1, name: m.player1_name })
        else if (wId === String(m.player2)) winners.push({ id: m.player2, name: m.player2_name })
      }

      if (winners.length < 2) return { success: true, msg: '冠军已产生！' }

      // 6. 生成下一轮
      const nextMatches = []
      let roundName = `淘汰赛 第${nextRoundIndex}轮`
      if (winners.length === 2) roundName = "👑 决赛"
      else if (winners.length <= 4) roundName = "半决赛"

      for (let i = 0; i < winners.length; i += 2) {
        let p1 = winners[i]
        if (i + 1 < winners.length) {
          let p2 = winners[i+1]
          nextMatches.push({
            tournament: tourTitle, tournament_id, stage: 'knockout',
            round_index: nextRoundIndex, round: roundName, 
            player1: p1.id, player1_name: p1.name,
            player2: p2.id, player2_name: p2.name,
            status: 0, created_at: new Date()
          })
        } else {
          // 轮空
          nextMatches.push({
            tournament: tourTitle, tournament_id, stage: 'knockout',
            round_index: nextRoundIndex, round: roundName,
            player1: p1.id, player1_name: p1.name,
            player2: -1, player2_name: '轮空(直接晋级)',
            winner: p1.id, status: 1, created_at: new Date()
          })
        }
      }

      // 7. 写入
      for (let m of nextMatches) {
        await db.collection('matches').add({ data: m })
      }

      return { success: true, msg: `第 ${nextRoundIndex} 轮生成成功` }
    }

  } catch (e) {
    return { success: false, error: e.toString() }
  }
}