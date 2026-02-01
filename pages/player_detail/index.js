// pages/player_detail/index.js
const db = wx.cloud.database()

Page({
  data: {
    myInfo: null, // 存放头像、姓名、积分、签名等基本信息
    stats: {
      totalMatches: 0,
      winRate: '0%',
      winCount: 0,
      titles: []
    }
  },

  onLoad(options) {
    if (options.id) {
      // options.id 是字符串，player_id 是数字，需要转一下
      this.loadOtherPlayer(parseInt(options.id))
    }
  },

  // 1. 加载基本信息 (头像、名字、当前积分)
  async loadOtherPlayer(targetId) {
    wx.showLoading({ title: '加载中...' })
    try {
      const res = await db.collection('players').where({ player_id: targetId }).get()
      
      if (res.data.length > 0) {
        this.setData({ myInfo: res.data[0] })
        
        // 2. 调用云函数获取精准的生涯数据 (突破20条限制)
        this.loadCareerStats(targetId)
      } else {
        wx.showToast({ title: '查无此人', icon: 'none' })
      }
      wx.hideLoading()
    } catch (e) {
      console.error(e)
      wx.hideLoading()
    }
  },

  // 2. 核心修改：调用云函数 getPlayerStats
  loadCareerStats(playerId) {
    wx.cloud.callFunction({
      name: 'getPlayerStats',
      data: {
        player_id: playerId
      },
      success: res => {
        if (res.result.success) {
          // 云函数返回的数据结构正好对应页面的 stats
          this.setData({
            stats: res.result.data
          })
        } else {
          console.error('获取生涯数据失败', res.result.error)
        }
      },
      fail: err => {
        console.error('云函数调用失败', err)
      }
    })
  }
})