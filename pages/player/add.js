const db = wx.cloud.database()

Page({
  data: {
    id: '',
    name: '',
    score: 1450
  },

  bindIdInput(e) { this.setData({ id: e.detail.value }) },
  bindNameInput(e) { this.setData({ name: e.detail.value }) },
  bindScoreInput(e) { this.setData({ score: e.detail.value }) },

  savePlayer() {
    // 1. 简单的校验
    if (!this.data.id || !this.data.name) {
      return wx.showToast({ title: '请填写完整', icon: 'none' })
    }

    // 2. 关键步骤：强制转换为数字 (parseInt)
    // 即使你输的是字符串，这里也会变成数字，防止报错！
    const finalId = parseInt(this.data.id)
    const finalScore = parseInt(this.data.score)

    if (isNaN(finalId)) {
      return wx.showToast({ title: 'ID必须是数字', icon: 'none' })
    }

    wx.showLoading({ title: '保存中...' })

    // 3. 查重：看看ID是不是被用过了
    db.collection('players').where({
      player_id: finalId
    }).get().then(res => {
      if (res.data.length > 0) {
        wx.hideLoading()
        wx.showToast({ title: 'ID已存在，换一个', icon: 'none' })
      } else {
        // 4. 没重复，直接添加
        db.collection('players').add({
          data: {
            player_id: finalId,
            name: this.data.name,
            score: finalScore
          }
        }).then(res => {
          wx.hideLoading()
          wx.showToast({ title: '添加成功' })
          // 延迟返回上一页
          setTimeout(() => {
            wx.navigateBack()
          }, 1000)
        })
      }
    })
  }
})