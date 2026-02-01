const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  // 接收前端传来的新比赛数组和赛事ID
  const { newMatches, tournament_id } = event

  try {
    // 1. 批量写入数据库
    // 循环写入比 Promise.all 更稳定，防止并发限制
    for (let m of newMatches) {
      // 强制确保 round_index 是数字类型，方便排序
      m.round_index = Number(m.round_index)
      // 确保有创建时间
      m.created_at = new Date()
      
      await db.collection('matches').add({ data: m })
    }
    
    // 2. 更新赛事状态为“进行中”(2)
    await db.collection('tournaments').doc(tournament_id).update({
      data: { stage: 2 } 
    })

    return { success: true, count: newMatches.length }
  } catch (e) {
    console.error(e)
    return { success: false, error: e }
  }
}