const app = getApp()
const db = wx.cloud.database()

Page({
  data: {
    isAdmin: false,
    banners: [],
    tournaments: [],
    myPlayerId: null
  },

  onShow() {
    this.checkAdmin()
    this.loadBanners()
    this.loadTournaments()
    this.checkMyIdentity()
  },

  checkAdmin() {
    const isAdmin = app.globalData.isAdmin || false
    this.setData({ isAdmin })
  },

  // 1. 加载轮播图
  loadBanners() {
    db.collection('swiper_images').get().then(res => {
      this.setData({ banners: res.data })
    }).catch(err => {
      console.error(err)
    })
  },

  // 2. 加载赛事列表
  async loadTournaments() {
    // 拉取所有赛事 (包括暂停的)
    const tourRes = await db.collection('tournaments')
                            .orderBy('created_at', 'desc')
                            .limit(20)
                            .get()
    let list = tourRes.data
    
    // 检查报名状态
    if (this.data.myPlayerId) {
       const regRes = await db.collection('registrations').where({ player_id: this.data.myPlayerId }).get()
       const myRegs = regRes.data.map(r => r.tournament_id)
       
       list = list.map(item => {
         return { ...item, isSigned: myRegs.includes(item._id) }
       })
    }
    this.setData({ tournaments: list })
  },

  // 3. 检查我的身份
  async checkMyIdentity() {
    const { result } = await wx.cloud.callFunction({ name: 'login' })
    const res = await db.collection('players').where({ openid: result.openid }).get()
    if (res.data.length > 0) {
      this.setData({ myPlayerId: res.data[0].player_id })
      this.loadTournaments() 
    }
  },

  // === 管理员：上传图片 ===
  uploadBanner() {
    wx.chooseImage({
      count: 1,
      success: res => {
        const filePath = res.tempFilePaths[0]
        const cloudPath = 'banner/' + Date.now() + '.jpg'
        wx.showLoading({ title: '上传中' })
        
        wx.cloud.uploadFile({
          cloudPath,
          filePath,
          success: uploadRes => {
            db.collection('swiper_images').add({
              data: { url: uploadRes.fileID, created_at: new Date() }
            }).then(() => {
              wx.hideLoading()
              this.loadBanners()
            })
          }
        })
      }
    })
  },

  // === 管理员：删除图片 ===
  deleteImage(e) {
    const id = e.currentTarget.dataset.id
    const fileID = e.currentTarget.dataset.fileid
    
    wx.showModal({
      title: '删除',
      content: '确定删除这张轮播图吗？',
      success: res => {
        if (res.confirm) {
          db.collection('swiper_images').doc(id).remove().then(() => {
            wx.cloud.deleteFile({ fileList: [fileID] })
            this.loadBanners()
          })
        }
      }
    })
  },

  // === 管理员：去发布新赛事 ===
  goToCreateTour() {
    wx.navigateTo({ url: '/pages/admin/tournament_create' })
  },

  // === 管理员：去管理名单 ===
  manageTour(e) {
    const { id, title } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/admin/registration_list?id=${id}&title=${title}` })
  },

  // === 管理员：切换暂停/开启 ===
  toggleStatus(e) {
    const { id, status } = e.currentTarget.dataset
    const newStatus = status === 1 ? 2 : 1 
    const tip = newStatus === 1 ? '已开启报名' : '已暂停报名'

    wx.showLoading({ title: '切换中...' })
    
    db.collection('tournaments').doc(id).update({
      data: { status: newStatus }
    }).then(() => {
      wx.hideLoading()
      wx.showToast({ title: tip })
      this.loadTournaments()
    }).catch(err => {
      wx.hideLoading()
      console.error(err)
      wx.showToast({ title: '操作失败', icon: 'none' })
    })
  },

  // === 【重点修复】管理员：进入赛事总控台 ===
  goToControl(e) {
    const id = e.currentTarget.dataset.id
    // 跳转到 tour_control 页面，并带上赛事ID
    wx.navigateTo({ url: `/pages/admin/tour_control?id=${id}` })
  },
  // 查看比赛详情
  viewTourDetail(e) {
    const { id, title, status } = e.currentTarget.dataset
    
    // 阶段0：报名中 -> 提示
    if (status == 0 || !status) {
      return wx.showToast({ title: '等待开赛...', icon: 'none' })
    }
    
    // 阶段1：小组赛 -> 去积分录入页的“排名”Tab
    if (status == 1) {
      // 传递参数：tab=1 (排名页), tourId=...
      wx.navigateTo({
        url: `/pages/add/add?tab=1&tourId=${id}&title=${title}`
      })
    }
    
    // 阶段2：淘汰赛 -> 去对阵图
    if (status == 2) {
      wx.navigateTo({
        url: `/pages/bracket/index?id=${id}`
      })
    }
  },

  // === 用户：报名 ===
  async signUp(e) {
    if (!this.data.myPlayerId) {
      return wx.showModal({
        title: '提示',
        content: '请先去“我的”页面注册球员身份',
        showCancel: false,
        success: () => wx.switchTab({ url: '/pages/profile/index' })
      })
    }
    
    const idx = e.currentTarget.dataset.idx
    const tour = this.data.tournaments[idx]

    wx.showLoading({ title: '报名中...' })
    
    try {
      const pRes = await db.collection('players').where({player_id: this.data.myPlayerId}).get()
      const myName = pRes.data[0].name

      wx.cloud.callFunction({
        name: 'manageRegistration',
        data: {
          action: 'join',
          tournament_id: tour._id,
          tournament_title: tour.title,
          player_id: this.data.myPlayerId,
          player_name: myName
        },
        success: res => {
          wx.hideLoading()
          if (res.result.success) {
            wx.showToast({ title: '报名成功', icon: 'success' })
            this.loadTournaments()
          } else {
            wx.showToast({ title: res.result.msg, icon: 'none' })
          }
        },
        fail: err => {
          wx.hideLoading()
          console.error(err)
        }
      })
    } catch (err) {
      wx.hideLoading()
      console.error(err)
    }
  }
})