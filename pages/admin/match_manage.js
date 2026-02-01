const db = wx.cloud.database()

Page({
  data: {
    matchList: [],
    currentStatus: 0, // 0=待录入, 1=已录入
    allNames: [],     // 供 picker 使用
    allPlayers: []    // 供 picker 逻辑使用
  },

  onLoad() {
    // 加载球员供底部补录使用
    this.loadPlayersForPicker()
  },

  onShow() {
    this.loadAllMatches()
  },

  // === 1. 切换 Tab 逻辑 ===
  switchTab(e) {
    const status = e.currentTarget.dataset.status
    if (status === this.data.currentStatus) return
    
    this.setData({ 
      currentStatus: status,
      matchList: [] // 切换时先清空列表
    })
    this.loadAllMatches()
  },

  // === 2. 加载比赛列表 ===
  loadAllMatches() {
    wx.showLoading({ title: '加载中' })
    
    db.collection('matches')
      .where({ 
        // 核心：根据 currentStatus (0或1) 过滤
        status: this.data.currentStatus 
      }) 
      .orderBy('created_at', 'desc') 
      .limit(50) 
      .get()
      .then(res => {
        wx.hideLoading()
        this.setData({ matchList: res.data })
      })
      .catch(err => {
        wx.hideLoading()
        console.error(err)
      })
  },

  // === 3. 录入结果 (原有逻辑) ===
  openResultModal(e) {
    const idx = e.currentTarget.dataset.idx
    const match = this.data.matchList[idx]

    wx.showActionSheet({
      itemList: [
        `🔵 ${match.player1_name} 胜`, 
        `🔴 ${match.player2_name} 胜`
      ],
      success: (res) => {
        const winnerCode = res.tapIndex === 0 ? 'A' : 'B'
        
        wx.showModal({
          title: '确认提交?',
          content: `管理员操作：确认 ${winnerCode==='A'?match.player1_name:match.player2_name} 获胜？`,
          success: (confirmRes) => {
            if (confirmRes.confirm) {
              this.submitResult(match, winnerCode)
            }
          }
        })
      }
    })
  },

  submitResult(match, winnerCode) {
    wx.showLoading({ title: '提交中...' })
    
    wx.cloud.callFunction({
      name: 'submitMatch',
      data: {
        match_id: match._id,
        p1_id: match.player1,
        p2_id: match.player2,
        winner_code: winnerCode
      },
      success: res => {
        wx.hideLoading()
        if (res.result.success) {
          wx.showToast({ title: '代录成功' })
          this.loadAllMatches() // 刷新列表
        } else {
          wx.showModal({ title: '错误', content: '提交失败' })
        }
      },
      fail: err => {
        wx.hideLoading()
        console.error(err)
        wx.showToast({ title: '网络错误', icon: 'none' })
      }
    })
  },

  // === 4. 撤销/重置逻辑 (新增) ===
  revokeMatch(e) {
    const idx = e.currentTarget.dataset.idx
    const match = this.data.matchList[idx]

    wx.showModal({
      title: '确认撤销?',
      content: `即将重置 ${match.player1_name} VS ${match.player2_name}。\n若已产生积分将自动回退。`,
      confirmColor: '#ff4d4f', // 红色警告色
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '撤销中' })
          
          wx.cloud.callFunction({
            name: 'submitMatch',
            data: {
              match_id: match._id,
              action: 'revoke' // 关键指令
            },
            success: res => {
              wx.hideLoading()
              if (res.result.success) {
                wx.showToast({ title: '已撤销' })
                this.loadAllMatches() // 刷新列表
              } else {
                wx.showModal({ title: '失败', content: res.result.error || '未知错误' })
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

  // === 5. 辅助：加载Picker数据 ===
  loadPlayersForPicker() {
    db.collection('players').get().then(res => {
      this.setData({
        allPlayers: res.data,
        allNames: res.data.map(p => p.name)
      })
    })
  },

  // 手动补录回调
  adminAddPlayer(e) {
    const idx = e.detail.value
    const player = this.data.allPlayers[idx]
    if (player) {
       wx.showToast({ title: '选中: ' + player.name, icon: 'none' })
       // 这里可以加跳转逻辑，例如：
       // wx.navigateTo({ url: `/pages/create/index?pid=${player._id}` })
    }
  }
})