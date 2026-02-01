const db = wx.cloud.database()

Page({
  data: {
    players: [],
    playerNames: [],
    tournaments: [],
    tourNames: [],
    
    tourName: '',
    tourId: '', 
    roundName: '单场对决',
    
    // 新增：标记是否锁定赛事
    isFixedTour: false,

    p1_index: -1,
    p2_index: -1,
    p1_name: '',
    p2_name: ''
  },

  onLoad(options) {
    this.loadPlayers()
    this.loadTournaments()
    
    // 如果是从总控台跳过来的，自动填好并锁定
    if (options.tourId) {
      this.setData({
        tourId: options.tourId,
        tourName: options.tourTitle,
        isFixedTour: true,        // 开启锁定模式
        roundName: '附加赛/友谊赛' // 默认轮次名
      })
    }
  },

  // 1. 加载所有球员 (使用云函数突破20条限制)
  loadPlayers() {
    wx.cloud.callFunction({
      name: 'getRankList',
      success: res => {
        this.setData({
          players: res.result,
          playerNames: res.result.map(p => `${p.name} (${p.score})`)
        })
      }
    })
  },

  loadTournaments() {
    db.collection('tournaments').orderBy('created_at', 'desc').get().then(res => {
      this.setData({
        tournaments: res.data,
        tourNames: res.data.map(t => t.title)
      })
    })
  },

  bindTourPicker(e) {
    const idx = e.detail.value
    this.setData({ 
      tourName: this.data.tourNames[idx],
      tourId: this.data.tournaments[idx]._id 
    })
  },
  bindRound(e) { this.setData({ roundName: e.detail.value }) },
  
  bindP1(e) { 
    const idx = e.detail.value
    this.setData({ p1_index: idx, p1_name: this.data.playerNames[idx] }) 
  },
  bindP2(e) { 
    const idx = e.detail.value
    this.setData({ p2_index: idx, p2_name: this.data.playerNames[idx] }) 
  },

  createMatch() {
    const d = this.data
    
    // 没填赛事ID的话（如果是直接进这个页面又没选），给个默认
    const finalTourId = d.tourId || '' 
    const finalTourName = d.tourName || '日常练习赛'

    if (d.p1_index < 0 || d.p2_index < 0) {
      return wx.showToast({ title: '请选择双方', icon: 'none' })
    }
    if (d.p1_index == d.p2_index) {
      return wx.showToast({ title: '不能自己打自己', icon: 'none' })
    }

    const p1 = d.players[d.p1_index]
    const p2 = d.players[d.p2_index]

    wx.showLoading({ title: '发布中...' })

    db.collection('matches').add({
      data: {
        tournament: finalTourName,
        tournament_id: finalTourId,
        round: d.roundName,
        player1: p1.player_id,
        player1_name: p1.name,
        player2: p2.player_id,
        player2_name: p2.name,
        status: 0,
        created_at: new Date()
      }
    }).then(() => {
      wx.hideLoading()
      wx.showToast({ title: '发布成功' })
      
      // 如果是锁定模式，发完直接返回总控台
      if (d.isFixedTour) {
        setTimeout(() => wx.navigateBack(), 1000)
      } else {
        // 如果是普通模式，重置选手方便继续发
        this.setData({
          p1_index: -1, p1_name: '',
          p2_index: -1, p2_name: ''
        })
      }
    })
  }
})