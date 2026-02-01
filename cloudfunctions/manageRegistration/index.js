// cloudfunctions/manageRegistration/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action, tournament_id, tournament_title, player_id, player_name, reg_id } = event
  const wxContext = cloud.getWXContext()
  const myOpenid = wxContext.OPENID

  try {
    // ================= 🟢 报名逻辑 (Join) =================
    if (action === 'join') {
      
      // 【新增逻辑】1. 先检查赛事是否开启 (status === 1)
      // 如果管理员暂停了(status=2)或者结束了，就不让报
      const tourRes = await db.collection('tournaments').doc(tournament_id).get()
      const tour = tourRes.data
      
      if (tour.status !== 1) {
        return { success: false, msg: '报名已暂停或结束' }
      }

      // 2. 查重：防止重复报名
      const check = await db.collection('registrations').where({
        tournament_id: tournament_id,
        player_id: player_id
      }).get()

      if (check.data.length > 0) {
        return { success: false, msg: '你已经报过名了' }
      }

      // 3. 写入报名 + 人数+1
      await db.runTransaction(async transaction => {
        await transaction.collection('registrations').add({
          data: {
            tournament_id,
            tournament_title,
            player_id,
            player_name,
            operator_openid: myOpenid,
            created_at: new Date()
          }
        })
        await transaction.collection('tournaments').doc(tournament_id).update({
          data: { count: _.inc(1) }
        })
      })
      return { success: true, type: 'join' }
    }

    // ================= 🔴 退出/踢人逻辑 (Quit) =================
    else if (action === 'quit') {
      if (!reg_id) return { success: false, msg: '缺少记录ID' }

      await db.runTransaction(async transaction => {
        await transaction.collection('registrations').doc(reg_id).remove()
        
        await transaction.collection('tournaments').doc(tournament_id).update({
          data: { count: _.inc(-1) }
        })
      })
      return { success: true, type: 'quit' }
    }

    else {
      return { success: false, msg: '无效的操作' }
    }

  } catch (e) {
    console.error(e)
    return { success: false, error: e }
  }
}