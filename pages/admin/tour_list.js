const db = wx.cloud.database()

Page({
  data: {
    list: []
  },

  onShow() {
    this.loadList()
  },

  // 加载所有赛事
  loadList() {
    wx.showLoading({ title: '加载中...' })
    db.collection('tournaments')
      .orderBy('created_at', 'desc') // 按创建时间倒序
      .get()
      .then(res => {
        this.setData({ list: res.data })
        wx.hideLoading()
      })
      .catch(err => {
        console.error(err)
        wx.hideLoading()
      })
  },

  // 跳转：发布新赛事
  goToCreate() {
    wx.navigateTo({ url: '/pages/admin/tournament_create' })
  },
  
  // 跳转：进入总控台 (分组、排阵、淘汰赛都在这里)
  goToControl(e) { 
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/admin/tour_control?id=${id}` }) 
  },
  
  // 跳转：管理名单 (踢人、补录)
  goToNames(e) {
    const { id, title } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/admin/registration_list?id=${id}&title=${title}` })
  },

  // 动作：删除赛事
  deleteTour(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '高风险操作',
      content: '确定要删除该赛事吗？\n(关联的比赛记录建议手动清理)',
      confirmColor: '#ff4d4f',
      success: res => {
        if(res.confirm) {
          wx.showLoading({ title: '删除中' })
          // 仅删除赛事本身，防止误删其他数据。
          // 如果需要彻底删除关联的matches和registrations，建议写一个云函数专门处理
          db.collection('tournaments').doc(id).remove().then(() => {
            wx.hideLoading()
            wx.showToast({ title: '已删除' })
            this.loadList() // 刷新
          })
        }
      }
    })
  }
})