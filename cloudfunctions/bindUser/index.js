// cloudfunctions/bindUser/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { docId, phone } = event
  const wxContext = cloud.getWXContext()
  const myOpenid = wxContext.OPENID

  if (!docId) {
    return { success: false, msg: '缺少记录ID' }
  }

  try {
    // 强制更新指定记录
    await db.collection('players').doc(docId).update({
      data: {
        openid: myOpenid, // 绑定微信ID
        phone: phone || ''
      }
    })

    return { success: true }
  } catch (e) {
    console.error('绑定失败:', e)
    return { success: false, msg: e.message || '数据库更新失败' }
  }
}