// app.js
App({
  // 1. 这里必须显式定义，不能漏掉
  globalData: {
    isAdmin: false, 
    openid: ''
  },

  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: 'cloud1-9gnq1eag64a5874f', // 【请记得把你的环境ID填回来！】
        traceUser: true,
      })
    }
    this.checkAuth()
  },

  checkAuth() {
    wx.cloud.callFunction({
      name: 'login',
      success: res => {
        console.log('云函数返回:', res.result)
        
        // 2. 强制转换：不管返回什么，都转成 true 或 false
        const isAdmin = res.result.isAdmin ? true : false
        
        this.globalData.openid = res.result.openid
        this.globalData.isAdmin = isAdmin
        
        // 3. 回调给首页时，也强制传布尔值
        if (this.authCallback) {
          this.authCallback(isAdmin)
        }
      },
      fail: err => {
        console.error('身份识别失败', err)
        // 失败了也是普通用户
        this.globalData.isAdmin = false
        if (this.authCallback) {
          this.authCallback(false)
        }
      }
    })
  }
})