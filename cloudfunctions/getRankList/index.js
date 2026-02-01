// cloudfunctions/getRankList/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  // 1. 获取所有球员 (限制提高到 1000)
  const pPromise = db.collection('players')
    .orderBy('score', 'desc')
    .limit(1000) // <--- 关键！这里解除了20条限制
    .get()

  // 2. 获取所有冠军记录
  const cPromise = db.collection('champions')
    .limit(1000)
    .get()

  try {
    const [pRes, cRes] = await Promise.all([pPromise, cPromise])
    const players = pRes.data
    const champs = cRes.data

    // 3. 在云端就把头衔拼好
    const list = players.map(p => {
      const myTitles = champs
        .filter(c => c.champion === p.player_id)
        .map(c => c.title || `${c.year}${c.tournament}冠军`)
      
      return {
        ...p,
        titles: myTitles
      }
    })

    return list

  } catch (e) {
    console.error(e)
    return []
  }
}