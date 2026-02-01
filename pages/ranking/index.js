const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    playerList: [],
    isAdmin: false
  },

  onShow() {
    this.checkAdmin()
    this.getRank()
  },

  checkAdmin() {
    const adminStatus = (app.globalData && app.globalData.isAdmin) ? true : false
    if (this.data.isAdmin !== adminStatus) {
      this.setData({ isAdmin: adminStatus })
    }
  },

  getRank() {
    wx.cloud.callFunction({
      name: 'getRankList',
      success: res => {
        this.setData({ playerList: res.result })
      },
      fail: err => {
        console.error(err)
      }
    })
  },

  // 跳转到个人详情页
  goToPlayerDetail(e) {
    const playerId = e.currentTarget.dataset.id
    console.log('【调试】点击了球员ID:', playerId)

    if (!playerId) return

    // 【关键修改】必须跳到 player_detail，不能跳到 profile
    wx.navigateTo({
      url: `/pages/player_detail/index?id=${playerId}`,
      fail: (err) => {
        console.error('跳转失败:', err)
        wx.showToast({ title: '无法跳转', icon: 'none' })
      }
    })
  },

  // 其他跳转函数
  // 跳转到赛事列表页
  goToTourList() {
    wx.navigateTo({ url: '/pages/admin/tour_list' })
  },
  // 删除原来的 goToAdminSingle, goToAdminGroup, goToMatchManage
  goToHistory() { wx.navigateTo({ url: '/pages/history/index' }) },
  goToStats() { wx.navigateTo({ url: '/pages/stats/index' }) },
  goToMyMatches() { wx.navigateTo({ url: '/pages/add/add' }) },
})