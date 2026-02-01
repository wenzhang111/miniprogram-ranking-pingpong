// cloudfunctions/login/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const myOpenid = wxContext.OPENID

  // 1. 打印我的ID，看看对不对
  console.log('【调试】当前用户的OpenID是:', myOpenid)

  try {
    // 2. 去数据库查，并把查到的结果打印出来
    const res = await db.collection('admins').where({
      openid: myOpenid
    }).get()

    console.log('【调试】数据库查询结果:', res.data)

    const isAdmin = res.data.length > 0
    console.log('【调试】最终判定:', isAdmin ? '是管理员' : '不是管理员')

    return {
      openid: myOpenid,
      isAdmin: isAdmin,
      debugInfo: res.data // 把查到的东西返回给前端看看
    }
  }  catch (e) {
    console.error('【调试】报错:', e)
    // 【修改】把错误详细信息返回回去
    return { 
      success: false, 
      error: e.message || e.errMsg || JSON.stringify(e) // 确保能看到错误文本
    }
  }
}