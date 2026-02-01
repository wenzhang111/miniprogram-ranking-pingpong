const app = getApp()
const db = wx.cloud.database()
const _ = db.command

Page({
  data: {
    // === Tab 0: 赛程管理 ===
    curTab: 0,
    matchStatus: 0, // 0=待录入, 1=已录入
    matchList: [],

    // === Tab 1: 积分排名 ===
    tourList: [],       
    tourNames: [],      
    tourIndex: null,    
    tourInput: '',      

    // 分组选择相关
    groupList: ['全部'], 
    groupIndex: 0,       
    
    // 缓存数据
    cachedMatches: [],   
    rankList: []
  },

  // 1. 页面加载：处理从别的页面跳过来的参数
  onLoad(options) {
    // 如果是从首页或管理页带参数跳转过来的
    if (options.tourId || options.title) {
      this.setData({
        // 自动切换到 Tab 1 (积分排名)
        curTab: options.tab ? parseInt(options.tab) : 1,
        // 自动填入搜索框 (如果有标题)
        tourInput: options.title || ''
      })
      
      // 如果是为了看排名，且有名字，直接加载
      if (this.data.curTab === 1 && this.data.tourInput) {
        this.loadStandings()
      }
    }
    
    // 预加载一下赛事列表，方便用户切换
    this.loadTournaments()
  },

  // 2. 页面显示：刷新数据
  onShow() {
    // 根据当前 Tab 刷新数据
    if (this.data.curTab === 0) {
      // === 修复点：这里原来写的是 loadMyMatches，现在改为 loadMatches ===
      this.loadMatches()
    } else {
      // 如果在排名页，且列表为空，拉取一下
      if (this.data.tourList.length === 0) {
        this.loadTournaments()
      }
    }
  },

  // 3. 切换顶部大 Tab
  switchTab(e) {
    const idx = parseInt(e.currentTarget.dataset.idx)
    this.setData({ curTab: idx })
    
    if (idx === 0) {
      this.loadMatches()
    } else {
      if (this.data.tourList.length === 0) {
        this.loadTournaments()
      }
    }
  },

  // ===============================================
  // Tab 0: 赛程管理逻辑
  // ===============================================
  
  // 切换 待录入/已录入
  switchStatus(e) {
    const status = parseInt(e.currentTarget.dataset.status)
    if (status === this.data.matchStatus) return
    this.setData({ matchStatus: status, matchList: [] })
    this.loadMatches()
  },

  // 加载比赛
  loadMatches() {
    wx.showLoading({ title: '加载赛程...' })
    db.collection('matches')
      .where({ status: this.data.matchStatus })
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

  // 点击卡片操作
  handleMatchClick(e) {
    const idx = e.currentTarget.dataset.idx
    const match = this.data.matchList[idx]
    if (this.data.matchStatus === 0) {
      this.openResultModal(match)
    } else {
      this.revokeMatch(match)
    }
  },

  // 录入弹窗
  openResultModal(match) {
    wx.showActionSheet({
      itemList: [`🔵 ${match.player1_name} 胜`, `🔴 ${match.player2_name} 胜`],
      success: (res) => {
        const winnerCode = res.tapIndex === 0 ? 'A' : 'B'
        wx.showModal({
          title: '确认提交?',
          content: `${winnerCode==='A'?match.player1_name:match.player2_name} 获胜？`,
          success: (confirmRes) => {
            if (confirmRes.confirm) this.submitResult(match, winnerCode)
          }
        })
      }
    })
  },

  // 提交结果
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
          wx.showToast({ title: '已录入' })
          this.loadMatches()
        } else {
          wx.showModal({ title: '错误', content: '系统错误' })
        }
      }
    })
  },

  // 撤销结果
  revokeMatch(match) {
    wx.showModal({
      title: '确认撤销?',
      content: `即将重置 ${match.player1_name} VS ${match.player2_name} 的结果。\n双方积分将回退。`,
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '撤销中' })
          wx.cloud.callFunction({
            name: 'submitMatch',
            data: { match_id: match._id, action: 'revoke' },
            success: res => {
              wx.hideLoading()
              if (res.result.success) {
                wx.showToast({ title: '已撤销' })
                this.loadMatches()
              } else {
                wx.showModal({ title: '失败', content: res.result.error })
              }
            }
          })
        }
      }
    })
  },

  // ===============================================
  // Tab 1: 积分排名逻辑
  // ===============================================
  
  // 加载赛事列表给 Picker 用
  loadTournaments() {
    // 只有当列表为空时才显示loading，避免每次切换Tab都闪一下
    if (this.data.tourList.length === 0) {
      wx.showLoading({ title: '加载赛事...' })
    }
    
    db.collection('tournaments')
      .orderBy('created_at', 'desc')
      .limit(20)
      .get()
      .then(res => {
        wx.hideLoading()
        const list = res.data
        this.setData({ 
          tourList: list, 
          tourNames: list.map(t => t.title) 
        })
      })
      .catch(err => {
        wx.hideLoading()
        console.error(err)
      })
  },

  // 1. 选中赛事 -> 拉取数据 + 自动提取组名
  bindTourPickerChange(e) {
    const idx = e.detail.value
    this.setData({
      tourIndex: idx,
      tourInput: this.data.tourNames[idx],
      rankList: [],
      groupList: ['全部'], 
      groupIndex: 0
    })
    this.loadStandings() // 自动查
  },

  // 2. 选中分组 -> 本地过滤
  bindGroupPickerChange(e) {
    const idx = e.detail.value
    this.setData({ groupIndex: idx })
    this.filterAndCalculate() // 重新计算排名
  },

  // 3. 从数据库加载所有比赛
  loadStandings() {
    if (!this.data.tourInput) return

    wx.showLoading({ title: '分析赛况...' })

    db.collection('matches').where({
      tournament: this.data.tourInput, 
      status: 1 
    })
    .limit(1000) 
    .get().then(res => {
      wx.hideLoading()
      const allMatches = res.data
      
      if (allMatches.length === 0) {
        wx.showModal({ title: '暂无数据', content: '暂无已完赛记录', showCancel: false })
        this.setData({ rankList: [], cachedMatches: [], groupList: ['全部'] })
        return
      }

      // === 自动提取组名 ===
      const groupsSet = new Set()
      allMatches.forEach(m => {
        const gName = m.group || m.round
        if (gName) groupsSet.add(gName)
      })
      const groupOptions = ['全部', ...Array.from(groupsSet).sort()]

      this.setData({
        cachedMatches: allMatches, // 缓存
        groupList: groupOptions,
        groupIndex: 0 
      })

      // 计算并显示排名
      this.filterAndCalculate()
    })
  },

  // 4. 过滤数据并计算 (本地逻辑)
  filterAndCalculate() {
    const { cachedMatches, groupList, groupIndex } = this.data
    const selectedGroup = groupList[groupIndex]

    let targetMatches = cachedMatches

    // 如果选的不是"全部"，就进行过滤
    if (selectedGroup !== '全部') {
      targetMatches = cachedMatches.filter(m => {
        return m.group == selectedGroup || m.round == selectedGroup
      })
    }

    if (targetMatches.length === 0) {
      this.setData({ rankList: [] })
    } else {
      this.calculateRank(targetMatches)
    }
  },

  // 计算积分
  calculateRank(matches) {
    let stats = {}
    matches.forEach(m => {
      if (!stats[m.player1]) stats[m.player1] = { name: m.player1_name, win: 0, lose: 0, points: 0 }
      if (!stats[m.player2]) stats[m.player2] = { name: m.player2_name, win: 0, lose: 0, points: 0 }

      if (m.winner == m.player1) {
        stats[m.player1].win++; stats[m.player1].points += 2;
        stats[m.player2].lose++; stats[m.player2].points += 1;
      } else {
        stats[m.player2].win++; stats[m.player2].points += 2;
        stats[m.player1].lose++; stats[m.player1].points += 1;
      }
    })
    
    let list = Object.values(stats).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points
      return b.win - a.win
    })
    this.setData({ rankList: list })
  }
})