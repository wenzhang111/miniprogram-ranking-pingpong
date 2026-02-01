const db = wx.cloud.database()

Page({
  data: {
    tourId: '',
    tourTitle: '',
    list: [],       // 已报名列表
    allPlayers: [], // 所有球员库（用于补录）
    allNames: []    // Picker显示的文字数组
  },

  onLoad(options) {
    // 接收上一页传来的赛事ID和标题
    this.setData({ 
      tourId: options.id,
      tourTitle: options.title 
    })
    this.loadRegistrations()
    this.loadAllPlayers()
  },

  // 1. 加载已报名名单
  loadRegistrations() {
    wx.showLoading({ title: '加载名单...' })
    db.collection('registrations').where({
      tournament_id: this.data.tourId
    }).get().then(res => {
      wx.hideLoading()
      this.setData({ list: res.data })
    }).catch(err => {
      wx.hideLoading()
      console.error(err)
    })
  },

  // 2. 加载所有球员 (为了给管理员补录用)
  loadAllPlayers() {
    wx.cloud.callFunction({
      name: 'getRankList',
      success: res => {
        this.setData({
          allPlayers: res.result,
          // 拼装显示：马龙 (1800)
          allNames: res.result.map(p => `${p.name} (${p.score})`)
        })
      }
    })
  },

  // 3. 踢人 (使用新云函数 quit)
  removePlayer(e) {
    const regId = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name
    
    wx.showModal({
      title: '确认移出',
      content: `确定要把 ${name} 从名单中删除吗？`,
      success: res => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' })
          
          wx.cloud.callFunction({
            name: 'manageRegistration',
            data: {
              action: 'quit', // 动作：退出
              reg_id: regId,
              tournament_id: this.data.tourId
            },
            success: (res) => {
              wx.hideLoading() // 记得隐藏loading
              if (res.result.success) {
                wx.showToast({ title: '已移出' })
                this.loadRegistrations() // 刷新列表
              } else {
                wx.showModal({ title: '失败', content: res.result.msg, showCancel: false })
              }
            },
            fail: err => {
              wx.hideLoading()
              console.error(err)
              wx.showToast({ title: '网络错误', icon: 'none' })
            }
          })
        }
      }
    })
  },

  // 4. 管理员手动补录 (使用新云函数 join)
  adminAddPlayer(e) {
    const idx = e.detail.value
    const player = this.data.allPlayers[idx] // 选中的那个球员对象
    
    wx.showModal({
      title: '确认补录',
      content: `确定要把 ${player.name} 加入比赛吗？`,
      success: res => {
        if (res.confirm) {
          wx.showLoading({ title: '补录中...' })
          
          wx.cloud.callFunction({
            name: 'manageRegistration',
            data: {
              action: 'join', // 动作：加入
              tournament_id: this.data.tourId,
              tournament_title: this.data.tourTitle,
              player_id: player.player_id,
              player_name: player.name
            },
            success: res => {
              wx.hideLoading() // 隐藏 loading
              if (res.result.success) {
                wx.showToast({ title: '补录成功' })
                this.loadRegistrations() // 刷新列表
              } else {
                // 如果报错（比如已经报过名了），弹窗提示
                wx.showModal({ title: '提示', content: res.result.msg, showCancel: false })
              }
            },
            fail: err => {
              wx.hideLoading()
              console.error(err)
              wx.showToast({ title: '调用失败', icon: 'none' })
            }
          })
        }
      }
    })
  }
})