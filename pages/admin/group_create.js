const db = wx.cloud.database()
Page({
  data: {
    allPlayers: [], // 存所有 50+ 人
    players: [],    // 存当前显示在列表里的人
    tournaments: [], // 存赛事列表
    tourNames: [],
    selectedTourName: '',
    // ... 其他 data ...
  },

  onLoad() {
    // 1. 加载所有球员
    wx.cloud.callFunction({
      name: 'getRankList',
      success: res => {
        this.setData({ 
          allPlayers: res.result,
          players: res.result // 默认显示所有人
        })
      }
    })

    // 2. 加载所有赛事 (为了做筛选)
    db.collection('tournaments').orderBy('date', 'desc').get().then(res => {
      this.setData({
        tournaments: res.data,
        tourNames: res.data.map(t => t.title)
      })
    })
  },

  // 筛选逻辑
  filterByTour(e) {
    const idx = e.detail.value
    const tour = this.data.tournaments[idx]
    
    this.setData({ selectedTourName: tour.title })
    wx.showLoading({ title: '筛选中...' })

    // 去查报名表
    db.collection('registrations').where({
      tournament_id: tour._id
    }).get().then(res => {
      wx.hideLoading()
      const regList = res.data
      const regIds = regList.map(r => r.player_id) // 拿到报名的ID列表

      // 过滤：只保留在 regIds 里的人
      const filtered = this.data.allPlayers.filter(p => regIds.includes(p.player_id))

      if (filtered.length === 0) {
        wx.showToast({ title: '该比赛没人报名', icon: 'none' })
        this.setData({ players: this.data.allPlayers }) // 回退到显示所有人
      } else {
        this.setData({ players: filtered })
        wx.showToast({ title: `筛选出 ${filtered.length} 人` })
        
        // 顺便把赛事名自动填进去
        this.setData({ tourName: tour.title })
      }
    })
  },
  
  bindTour(e) { this.setData({ tourName: e.detail.value }) },
  bindGroup(e) { this.setData({ groupName: e.detail.value }) },

  bindPlayersChange(e) {
    // 获取选中的索引数组 ["0", "2", "5"]
    const indices = e.detail.value
    // 计算场次：n * (n-1) / 2
    const n = indices.length
    const count = n * (n - 1) / 2
    
    this.setData({
      selectedIndices: indices,
      matchCount: count
    })
  },

  async generateSchedule() {
    const d = this.data
    if (!d.tourName || !d.groupName) {
      return wx.showToast({ title: '请填写完整信息', icon: 'none' })
    }
    if (d.selectedIndices.length < 3) {
      return wx.showToast({ title: '至少选3个人', icon: 'none' })
    }

    wx.showLoading({ title: '正在生成...' })

    // 1. 提取出选中的球员对象列表
    const selectedPlayers = d.selectedIndices.map(idx => d.players[idx])

    // 2. 算法：双重循环生成对阵 (A vs B, A vs C...)
    const matchesToAdd = []
    for (let i = 0; i < selectedPlayers.length; i++) {
      for (let j = i + 1; j < selectedPlayers.length; j++) {
        const p1 = selectedPlayers[i]
        const p2 = selectedPlayers[j]

        matchesToAdd.push({
          tournament: d.tourName, // 2026春季赛
          stage: '小组赛',        // 阶段
          group: d.groupName,     // A组
          player1: p1.player_id,
          player1_name: p1.name,
          player2: p2.player_id,
          player2_name: p2.name,
          status: 0,              // 待开赛
          created_at: new Date()
        })
      }
    }

    // 3. 批量写入数据库
    // 云开发限制一次最多写数据库可能有并发限制，我们用循环简单的写
    // 比赛数量不会太多（6人也就15场），循环写没问题
    try {
      const tasks = []
      matchesToAdd.forEach(match => {
        const promise = db.collection('matches').add({ data: match })
        tasks.push(promise)
      })

      // 等待所有写入完成
      await Promise.all(tasks)

      wx.hideLoading()
      wx.showModal({
        title: '生成完毕',
        content: `成功创建了 ${matchesToAdd.length} 场比赛！`,
        showCancel: false,
        success: () => wx.navigateBack()
      })

    } catch (err) {
      wx.hideLoading()
      console.error(err)
      wx.showToast({ title: '生成出错', icon: 'none' })
    }
  }
})