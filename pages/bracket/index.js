const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    tourId: '',
    tourTitle: '',
    isAdmin: false,
    rounds: [] 
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ 
        tourId: options.id,
        isAdmin: app.globalData.isAdmin || false
      })
      
      // 获取赛事标题，生成下一轮时会用到
      db.collection('tournaments').doc(options.id).get().then(res => {
        this.setData({ tourTitle: res.data.title })
      })
    }
  },

  onShow() {
    this.loadBracket()
  },

  // 下拉刷新支持
  onPullDownRefresh() {
    this.loadBracket(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 1. 加载对阵图
  loadBracket(callback) {
    if (!this.data.tourId) return

    wx.showLoading({ title: '加载赛程...' })
    
    db.collection('matches')
      .where({
        tournament_id: this.data.tourId,
        stage: 'knockout'
      })
      .orderBy('round_index', 'asc') // 轮次排序
      .get()
      .then(res => {
        const matches = res.data
        
        // 容错：防止 round_index 缺失
        matches.forEach(m => m.round_index = Number(m.round_index) || 1)

        // 分组：按 round_index 归类
        const roundMap = {}
        matches.forEach(m => {
          if (!roundMap[m.round_index]) roundMap[m.round_index] = []
          roundMap[m.round_index].push(m)
        })

        // 转数组并按轮次 Key 排序 (1, 2, 3...)
        const groups = Object.keys(roundMap)
                       .sort((a, b) => Number(a) - Number(b))
                       .map(k => roundMap[k])
        
        // 组内排序：按创建时间，保证树状图顺序不乱
        groups.forEach(g => g.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)))

        this.setData({ rounds: groups })
        wx.hideLoading()
        if(callback) callback()
      })
      .catch(err => {
        wx.hideLoading()
        console.error(err)
        if(callback) callback()
      })
  },

  // 2. 生成下一轮 (纯前端计算逻辑)
  generateNextRound() {
    const rounds = this.data.rounds
    if (rounds.length === 0) return wx.showToast({ title: '无数据', icon: 'none' })

    // 获取最后一轮数据
    const lastRoundMatches = rounds[rounds.length - 1]
    const lastRoundIndex = lastRoundMatches[0].round_index
    const nextRoundIndex = Number(lastRoundIndex) + 1

    // A. 检查本轮是否全部完赛
    const unfinished = lastRoundMatches.filter(m => m.status === 0)
    if (unfinished.length > 0) {
      return wx.showModal({
        title: '无法生成',
        content: `本轮还有 ${unfinished.length} 场没打完。\n请先完成：${unfinished[0].player1_name} VS ${unfinished[0].player2_name}`,
        showCancel: false
      })
    }

    // B. 提取晋级者 (Winners)
    let winners = []
    try {
      lastRoundMatches.forEach(m => {
        // 轮空 (player2 == -1) 的直接晋级
        if (m.player2 == -1) {
          winners.push({ id: m.player1, name: m.player1_name })
          return
        }
        
        // 正常对决：匹配胜者ID
        const wId = String(m.winner)
        if (wId === String(m.player1)) {
          winners.push({ id: m.player1, name: m.player1_name })
        } else if (wId === String(m.player2)) {
          winners.push({ id: m.player2, name: m.player2_name })
        } else {
          throw new Error(`数据异常：${m.player1_name} VS ${m.player2_name} 胜者ID不匹配`)
        }
      })
    } catch (e) {
      return wx.showModal({ title: '错误', content: e.message })
    }

    // 如果只剩1人，说明冠军产生了
    if (winners.length < 2) {
      return wx.showToast({ title: '冠军已产生', icon: 'success' })
    }

    // C. 生成下一轮对阵数组
    let roundName = `淘汰赛 第${nextRoundIndex}轮`
    if (winners.length === 2) roundName = "👑 决赛"
    else if (winners.length <= 4) roundName = "半决赛"

    const newMatches = []
    
    // 相邻两者配对：Winner 1 vs Winner 2
    for (let i = 0; i < winners.length; i += 2) {
      if (i + 1 < winners.length) {
        // 正常对决
        newMatches.push({
          tournament: this.data.tourTitle || '淘汰赛',
          tournament_id: this.data.tourId,
          stage: 'knockout',
          round_index: nextRoundIndex,
          round: roundName,
          player1: winners[i].id,
          player1_name: winners[i].name,
          player2: winners[i+1].id,
          player2_name: winners[i+1].name,
          status: 0,
          created_at: new Date() // 记录时间保证顺序
        })
      } else {
        // 奇数人轮空
        newMatches.push({
          tournament: this.data.tourTitle || '淘汰赛',
          tournament_id: this.data.tourId,
          stage: 'knockout',
          round_index: nextRoundIndex,
          round: roundName,
          player1: winners[i].id,
          player1_name: winners[i].name,
          player2: -1,
          player2_name: '轮空(直接晋级)',
          winner: winners[i].id, // 默认赢
          status: 1, // 默认完赛
          created_at: new Date()
        })
      }
    }

    // D. 提交给 saveBracket 云函数
    wx.showModal({
      title: '确认生成',
      content: `即将生成 ${roundName}，共 ${newMatches.length} 场。`,
      success: res => {
        if (res.confirm) {
          wx.showLoading({ title: '保存中' })
          wx.cloud.callFunction({
            name: 'saveBracket',
            data: { 
              newMatches: newMatches, 
              tournament_id: this.data.tourId 
            },
            success: res => {
              wx.hideLoading()
              if (res.result.success) {
                wx.showToast({ title: '生成成功' })
                this.loadBracket()
              } else {
                wx.showModal({ title: '保存失败', content: JSON.stringify(res.result) })
              }
            },
            fail: err => {
              wx.hideLoading()
              wx.showModal({ title: '网络错误', content: err.errMsg })
            }
          })
        }
      }
    })
  },

  // 3. 管理员点击卡片 (录入/撤销)
  adminRecord(e) {
    if (!this.data.isAdmin) return
    const { idx, roundidx } = e.currentTarget.dataset
    
    // 安全校验
    if (!this.data.rounds[roundidx] || !this.data.rounds[roundidx][idx]) return
    
    const match = this.data.rounds[roundidx][idx]

    // 轮空场次不可操作
    if (match.player2 == -1) return

    // 已完赛 -> 询问撤销
    if (match.status == 1) {
      wx.showActionSheet({
        itemList: ['⚠️ 撤销录入 (回退积分)'],
        itemColor: '#ff4d4f',
        success: res => {
          if (res.tapIndex === 0) this.revokeMatch(match)
        }
      })
      return
    }

    // 未完赛 -> 录入结果
    wx.showActionSheet({
      itemList: [`🔵 ${match.player1_name} 胜`, `🔴 ${match.player2_name} 胜`],
      success: res => {
        const winnerCode = res.tapIndex === 0 ? 'A' : 'B'
        this.submitResult(match, winnerCode)
      }
    })
  },

  // 4. 提交结果
  submitResult(match, winnerCode) {
    wx.showLoading({ title: '提交中' })
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
          this.loadBracket() // 成功后直接刷新
        } else {
          wx.showToast({ title: '失败', icon: 'none' })
        }
      },
      fail: err => {
        wx.hideLoading()
        console.error(err)
        wx.showToast({ title: '网络异常', icon: 'none' })
      }
    })
  },

  // 5. 撤销结果
  revokeMatch(match) {
    wx.showModal({
      title: '高风险操作',
      content: '确定要撤销并重置这场比赛吗？',
      confirmColor: '#ff4d4f',
      success: modalRes => {
        if (modalRes.confirm) {
          wx.showLoading({ title: '撤销中...' })
          wx.cloud.callFunction({
            name: 'submitMatch',
            data: {
              match_id: match._id,
              action: 'revoke' // 关键参数
            },
            success: res => {
              wx.hideLoading()
              if (res.result.success) {
                wx.showToast({ title: '已撤销' })
                this.loadBracket()
              } else {
                wx.showModal({ title: '失败', content: res.result.error })
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
  }
})