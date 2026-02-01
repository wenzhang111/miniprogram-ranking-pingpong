const db = wx.cloud.database()
const app = getApp()

Page({
  data: {
    tourId: '',
    tour: {},
    regList: [], // 原始报名列表
    
    // 种子管理数据
    selectedSeeds: [], // 已选种子对象数组
    unseededList: [],  // 未选闲家对象数组
    unseededNames: [], // Picker 显示用
    
    // 配置
    groupSize: 4,
    advanceCount: 2,
    estimateGroups: 0,
    
    statusText: { 0: '报名中', 1: '小组赛激战中', 2: '淘汰赛决战中', 3: '已结束' },
    isAdmin: false
  },

  onLoad(options) {
    const isAdmin = app.globalData.isAdmin || false
    this.setData({ isAdmin })

    if (options.id) {
      this.setData({ tourId: options.id })
      this.loadData()
    }
  },

  onPullDownRefresh() {
    this.loadData(() => wx.stopPullDownRefresh())
  },

  // 加载数据
  loadData(cb) {
    wx.showLoading({ title: '加载数据' })
    
    db.collection('tournaments').doc(this.data.tourId).get().then(res => {
      this.setData({ tour: res.data })
      
      db.collection('registrations').where({ tournament_id: this.data.tourId }).get().then(regRes => {
        const allPlayers = regRes.data
        
        // 每次加载重置种子列表 (或者你可以选择不重置，这里简单起见重置)
        // 如果想保留之前的选择，需要更复杂的逻辑，通常没必要
        this.setData({ 
          regList: allPlayers,
          unseededList: allPlayers,
          selectedSeeds: [],
          unseededNames: allPlayers.map(p => p.player_name)
        })
        
        this.calcEstimate()
        wx.hideLoading()
        if(cb) cb()
      })
    })
  },

  // === 种子管理 ===
  addSeed(e) {
    const idx = e.detail.value
    const player = this.data.unseededList[idx]
    
    // 移入种子，移出闲家
    const newSeeds = [...this.data.selectedSeeds, player]
    const newUnseeded = this.data.unseededList.filter(p => p._id !== player._id)
    
    this.updateLists(newSeeds, newUnseeded)
  },

  removeSeed(e) {
    const idx = e.currentTarget.dataset.idx
    const player = this.data.selectedSeeds[idx]
    
    // 移出种子，移回闲家
    const newSeeds = this.data.selectedSeeds.filter((p, i) => i !== idx)
    const newUnseeded = [...this.data.unseededList, player]
    
    this.updateLists(newSeeds, newUnseeded)
  },

  updateLists(seeds, unseeded) {
    this.setData({
      selectedSeeds: seeds,
      unseededList: unseeded,
      unseededNames: unseeded.map(p => p.player_name)
    })
  },

  // === 配置计算 ===
  bindGroupSize(e) { 
    this.setData({ groupSize: parseInt(e.detail.value) })
    this.calcEstimate()
  },
  bindAdvance(e) { 
    this.setData({ advanceCount: parseInt(e.detail.value) }) 
  },
  calcEstimate() {
    const total = this.data.regList.length
    const size = this.data.groupSize || 1
    this.setData({ estimateGroups: Math.ceil(total / size) })
  },

  // === 🚀 开启小组赛 ===
  startGroupStage() {
    if (!this.data.isAdmin) return

    const { groupSize, advanceCount, selectedSeeds, regList } = this.data
    
    if (regList.length < 3) return wx.showToast({ title: '人数不足3人', icon: 'none' })
    if (groupSize < 3) return wx.showToast({ title: '每组至少3人', icon: 'none' })

    // 提取种子ID
    const seedIds = selectedSeeds.map(p => p.player_id)

    wx.showModal({
      title: '确认开赛',
      content: `共 ${regList.length} 人，${seedIds.length} 名种子。\n将生成分组对阵，确认吗？`,
      success: res => {
        if (res.confirm) {
          this.callEngine('start_group', {
            group_size: groupSize,
            advance_count: advanceCount,
            seed_ids: seedIds // 传种子ID给云函数
          })
        }
      }
    })
  },

  // === 🚀 开启淘汰赛 ===
  startKnockout() {
    if (!this.data.isAdmin) return
    wx.showModal({
      title: '进入淘汰赛',
      content: '确认所有小组赛已结束？系统将计算出线名单。',
      success: res => {
        if (res.confirm) {
          this.callEngine('start_knockout', {})
        }
      }
    })
  },

  // === 📞 调用云引擎 ===
  callEngine(action, params) {
    wx.showLoading({ title: '计算中...', mask: true })
    wx.cloud.callFunction({
      name: 'tournamentEngine',
      data: {
        action: action,
        tournament_id: this.data.tourId,
        ...params
      },
      success: res => {
        wx.hideLoading()
        if (res.result.success) {
          wx.showToast({ title: '成功', icon: 'success' })
          setTimeout(() => this.loadData(), 1500)
        } else {
          wx.showModal({ title: '失败', content: res.result.msg || '未知错误', showCancel: false })
        }
      },
      fail: err => {
        console.error(err)
        wx.hideLoading()
        wx.showToast({ title: '网络错误', icon: 'none' })
      }
    })
  },

  // === 跳转功能 ===
  viewGroupRank() { wx.switchTab({ url: '/pages/ranking/index' }) }, // 这里假设 ranking 页有展示逻辑，或者你可以跳到 add 页面看排名
  viewBracket() { wx.navigateTo({ url: `/pages/bracket/index?id=${this.data.tourId}` }) },
  
  // 插入单场 (带参数跳转)
  goToSingleMatch() {
    const url = `/pages/admin/match_create?tourId=${this.data.tourId}&tourTitle=${this.data.tour.title}`
    wx.navigateTo({ url })
  }
})