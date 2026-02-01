const app = getApp()
const db = wx.cloud.database()
const _ = db.command

const PAGE_SIZE = 20 // 每次加载20条

Page({
  data: {
    curTab: 0, // 0=我的, 1=全部
    isAdmin: false,
    myPlayerId: null,
    matchList: [],
    
    // 分页相关状态
    page: 0,
    isEnd: false, // 是否已加载完所有数据
    isLoading: false // 防止重复请求
  },

  onShow() {
    const isAdmin = app.globalData.isAdmin || false
    this.setData({ isAdmin })
    this.initData()
  },

  // 下拉刷新
  onPullDownRefresh() {
    // 重置分页状态
    this.setData({
      page: 0,
      isEnd: false,
      matchList: []
    }, () => {
      this.loadHistory(() => wx.stopPullDownRefresh())
    })
  },

  // 触底加载更多
  onReachBottom() {
    if (!this.data.isEnd && !this.data.isLoading) {
      this.setData({ page: this.data.page + 1 })
      this.loadHistory()
    }
  },

  async initData() {
    // 首次加载不需要 loading 弹窗，体验更好
    try {
      const { result } = await wx.cloud.callFunction({ name: 'login' })
      const res = await db.collection('players').where({ openid: result.openid }).get()
      
      if (res.data.length > 0) {
        this.setData({ myPlayerId: res.data[0].player_id })
      } else {
        this.setData({ myPlayerId: null })
      }

      // 重置并加载
      this.setData({ page: 0, isEnd: false, matchList: [] })
      this.loadHistory()

    } catch (e) {
      console.error(e)
    }
  },

  switchTab(e) {
    const idx = parseInt(e.currentTarget.dataset.idx)
    // 切换标签时，重置分页
    this.setData({ 
      curTab: idx,
      page: 0,
      isEnd: false,
      matchList: [] 
    })
    this.loadHistory()
  },

  // 核心加载函数
  loadHistory(callback) {
    if (this.data.isLoading) return
    this.setData({ isLoading: true })

    wx.showLoading({ title: '加载中...' })

    // 构建查询条件
    let whereCondition = { status: 1 }

    if (this.data.curTab === 0) {
      if (!this.data.myPlayerId) {
        wx.hideLoading()
        this.setData({ isLoading: false })
        if (!this.data.isAdmin) wx.showToast({ title: '请先注册', icon: 'none' })
        if (callback) callback()
        return 
      }
      whereCondition = _.and([
        { status: 1 },
        _.or([
          { player1: this.data.myPlayerId },
          { player2: this.data.myPlayerId }
        ])
      ])
    }

    // 分页查询：skip = page * size
    const skipCount = this.data.page * PAGE_SIZE

    db.collection('matches')
      .where(whereCondition)
      .orderBy('date', 'desc') // 按时间倒序
      .skip(skipCount)         // 跳过前N条
      .limit(PAGE_SIZE)        // 拿20条
      .get()
      .then(res => {
        const newData = res.data.map(item => {
          return {
            ...item,
            formatDate: this.formatTime(item.date)
          }
        })

        // 判断是否到底
        if (newData.length < PAGE_SIZE) {
          this.setData({ isEnd: true })
        }

        // 拼接新旧数据
        this.setData({ 
          matchList: this.data.matchList.concat(newData),
          isLoading: false
        })
        
        wx.hideLoading()
        if (callback) callback()
      })
      .catch(err => {
        console.error(err)
        wx.hideLoading()
        this.setData({ isLoading: false })
        if (callback) callback()
      })
  },

  // 点击卡片 (撤销逻辑保持不变)
  onMatchTap(e) {
    const idx = e.currentTarget.dataset.idx
    const match = this.data.matchList[idx]
    const isParticipant = (match.player1 === this.data.myPlayerId) || (match.player2 === this.data.myPlayerId)
    
    if (!this.data.isAdmin && !isParticipant) return;

    wx.showActionSheet({
      itemList: ['🔴 撤销/重置这场比赛'],
      itemColor: '#ff4d4f',
      success: (res) => {
        if (res.tapIndex === 0) {
          this.confirmUndo(match)
        }
      }
    })
  },

  confirmUndo(match) {
    if (match.player2 == -1) return wx.showToast({ title: '轮空场次不可撤销', icon: 'none' })

    wx.showModal({
      title: '高风险操作',
      content: `确定要撤回 [${match.player1_name} vs ${match.player2_name}] 的成绩吗？\n\n双方积分将回滚，比赛变回“待开赛”。`,
      confirmColor: '#ff4d4f',
      success: res => {
        if (res.confirm) {
          wx.showLoading({ title: '撤销中...' })
          wx.cloud.callFunction({
            name: 'undoMatch',
            data: { match_id: match._id },
            success: res => {
              wx.hideLoading()
              if (res.result.success) {
                wx.showToast({ title: '已撤回', icon: 'success' })
                // 撤回后重置列表
                this.onPullDownRefresh()
              } else {
                wx.showModal({ title: '失败', content: res.result.msg })
              }
            },
            fail: err => {
              wx.hideLoading()
              console.error(err)
            }
          })
        }
      }
    })
  },

  formatTime(dateStr) {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const m = (date.getMonth() + 1).toString().padStart(2, '0')
    const d = date.getDate().toString().padStart(2, '0')
    const h = date.getHours().toString().padStart(2, '0')
    const min = date.getMinutes().toString().padStart(2, '0')
    return `${m}-${d} ${h}:${min}`
  }
})