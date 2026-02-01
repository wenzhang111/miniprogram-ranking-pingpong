const app = getApp()
const db = wx.cloud.database()
const _ = db.command

Page({
  data: {
    // 注册表单数据
    name: '',
    phone: '',
    
    // 用户信息
    myInfo: null,
    
    // 权限控制
    isAdmin: false, 
    
    // 生涯统计 (默认空值)
    stats: {
      totalMatches: 0,
      winRate: '0%',
      winCount: 0,
      titles: [] 
    }
  },

  onShow() {
    // 1. 获取管理员权限
    this.setData({
      isAdmin: app.globalData.isAdmin || false
    })

    // 2. 检查登录状态并加载数据
    this.checkLoginStatus()
  },

  // 检查登录状态
  async checkLoginStatus() {
    try {
      const { result } = await wx.cloud.callFunction({ name: 'login' })
      const myOpenid = result.openid

      const res = await db.collection('players').where({ openid: myOpenid }).get()

      if (res.data.length > 0) {
        const player = res.data[0]
        this.setData({ myInfo: player })
        // 登录成功后，调用云函数获取生涯数据
        this.loadCareerStats(player.player_id)
      } else {
        this.setData({ myInfo: null })
      }
    } catch (e) {
      console.error('登录检查失败', e)
    }
  },

  // === 核心修改：调用云函数获取统计 ===
  loadCareerStats(playerId) {
    // 不再在前端查库，而是调用 getPlayerStats
    wx.cloud.callFunction({
      name: 'getPlayerStats',
      data: {
        player_id: playerId
      },
      success: res => {
        if (res.result.success) {
          // 云函数算好了直接用
          this.setData({
            stats: res.result.data
          })
        } else {
          console.error('获取生涯数据失败', res.result.error)
        }
      },
      fail: err => {
        console.error('调用云函数失败', err)
      }
    })
  },

  bindName(e) { this.setData({ name: e.detail.value }) },
  bindPhone(e) { this.setData({ phone: e.detail.value }) },

  // 注册逻辑
  async register() {
    if (!this.data.name) return wx.showToast({ title: '姓名必填', icon: 'none' })

    wx.showLoading({ title: '匹配身份中...' })

    try {
      const { result } = await wx.cloud.callFunction({ name: 'login' })
      const myOpenid = result.openid

      const checkSelf = await db.collection('players').where({ openid: myOpenid }).get()
      if (checkSelf.data.length > 0) {
        wx.hideLoading()
        return wx.showModal({ title: '提示', content: '您已注册！', showCancel: false })
      }

      const checkName = await db.collection('players').where({ name: this.data.name }).get()

      if (checkName.data.length > 0) {
        const oldPlayer = checkName.data[0]
        wx.hideLoading()
        wx.showModal({
          title: '找到历史积分',
          content: `姓名：${oldPlayer.name}\nID：${oldPlayer.player_id}\n积分：${oldPlayer.score}\n\n这是您本人吗？`,
          confirmText: '是我，绑定',
          cancelText: '不是',
          success: async (res) => {
            if (res.confirm) {
              wx.showLoading({ title: '绑定中...' })
              await db.collection('players').doc(oldPlayer._id).update({
                data: {
                  openid: myOpenid,
                  phone: this.data.phone || ''
                }
              })
              this.registerSuccess()
            }
          }
        })
      } else {
        const newId = parseInt(Date.now().toString().slice(-6))
        await db.collection('players').add({
          data: {
            player_id: newId,
            name: this.data.name,
            phone: this.data.phone || '',
            score: 1450,
            openid: myOpenid
          }
        })
        this.registerSuccess()
      }
    } catch (err) {
      wx.hideLoading()
      console.error(err)
      wx.showToast({ title: '系统错误', icon: 'none' })
    }
  },

  registerSuccess() {
    wx.hideLoading()
    wx.showToast({ title: '欢迎加入', icon: 'success' })
    setTimeout(() => {
      this.checkLoginStatus()
    }, 1500)
  },

  goToHistory() {
    wx.navigateTo({ url: '/pages/history/index' })
  },
  
  goToChampionSet() {
    wx.navigateTo({ url: '/pages/admin/champion_set/index' })
  },

  // 复制微信号
  copyVx() {
    wx.setClipboardData({
      data: 'w353088286',
      success: () => {
        wx.showToast({ title: '微信号已复制' })
      }
    })
  },

  openEditModal() {
    wx.showModal({
      title: '修改个性签名',
      editable: true,
      placeholderText: '请输入新的签名',
      content: this.data.myInfo.phone || '', 
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '更新中' })
          await db.collection('players').doc(this.data.myInfo._id).update({
            data: { phone: res.content }
          })
          wx.hideLoading()
          wx.showToast({ title: '修改成功' })
          this.checkLoginStatus()
        }
      }
    })
  }
})