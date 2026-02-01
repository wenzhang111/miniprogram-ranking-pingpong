// cloudfunctions/getPlayerStats/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { player_id } = event

  try {
    // 1. 获取所有已完赛的记录 (云端上限 1000 条，够用了)
    const matchRes = await db.collection('matches').where(
      _.and([
        { status: 1 },
        _.or([{ player1: player_id }, { player2: player_id }])
      ])
    )
    .limit(1000) // 关键：突破20条限制
    .get()

    const matches = matchRes.data
    const total = matches.length
    let wins = 0

    // 2. 计算胜场
    matches.forEach(m => {
      if (m.winner == player_id) wins++
    })

    const rate = total === 0 ? 0 : Math.round((wins / total) * 100)

    // 3. 获取所有冠军头衔
    const titleRes = await db.collection('champions').where({ 
      champion: player_id 
    }).get()
    
    const titles = titleRes.data.map(t => t.title || `${t.year} ${t.tournament} 冠军`)

    return {
      success: true,
      data: {
        totalMatches: total,
        winCount: wins,
        winRate: rate + '%',
        titles: titles
      }
    }

  } catch (e) {
    return { success: false, error: e }
  }
}