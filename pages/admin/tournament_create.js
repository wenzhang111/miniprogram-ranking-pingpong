const db = wx.cloud.database()

Page({
  data: { 
    title: '', 
    date: '', 
    desc: '' 
  },

  bindTitle(e) { this.setData({ title: e.detail.value }) },
  bindDate(e) { this.setData({ date: e.detail.value }) },
  bindDesc(e) { this.setData({ desc: e.detail.value }) },

  submit() {
    // 简单的非空校验
    if (!this.data.title) {
      return wx.showToast({ title: '标题不能为空', icon: 'none' })
    }
    if (!this.data.date) {
      return wx.showToast({ title: '时间不能为空', icon: 'none' })
    }

    wx.showLoading({ title: '发布中...' })
    
    db.collection('tournaments').add({
      data: {
        title: this.data.title,
        date: this.data.date,
        desc: this.data.desc || '暂无详细描述', // 如果没填给个默认值
        status: 1, // 1=开启报名
        count: 0,  // 初始报名人数
        created_at: new Date()
      }
    }).then(() => {
      wx.hideLoading()
      wx.showToast({ title: '发布成功' })
      
      // 1.5秒后返回上一页
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }).catch(err => {
      wx.hideLoading()
      console.error(err)
      wx.showToast({ title: '发布失败', icon: 'none' })
    })
  }
})