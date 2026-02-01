const db = wx.cloud.database()
const _ = db.command

Page({
  data: {
    // 赛事列表数据
    tourList: [],       // 存赛事完整对象
    tourNames: [],      // 存赛事标题(给Picker显示)
    tourIndex: null,    // 选中的赛事索引

    // 选手列表数据
    playerList: [],     // 存当前赛事的选手对象
    playerNames: [],    // 存选手名字(给Picker显示)
    playerIndex: null,  // 选中的冠军索引

    // 表单其他数据
    titleName: '',
    year: new Date().getFullYear().toString()
  },

  onLoad() {
    this.loadTournaments()
  },

  // 1. 加载所有赛事供选择
  async loadTournaments() {
    wx.showLoading({ title: '加载赛事...' })
    try {
      // 获取最近的20场赛事
      const res = await db.collection('tournaments')
        .orderBy('created_at', 'desc')
        .limit(20)
        .get()
      
      const tours = res.data
      this.setData({
        tourList: tours,
        tourNames: tours.map(t => t.title) // 提取标题
      })
      wx.hideLoading()
    } catch (err) {
      wx.hideLoading()
      console.error(err)
      wx.showToast({ title: '加载赛事失败', icon: 'none' })
    }
  },

  // 2. 选中赛事 -> 自动查找该赛事的选手
  async bindTourChange(e) {
    const idx = e.detail.value
    const selectedTour = this.data.tourList[idx]

    this.setData({ 
      tourIndex: idx,
      playerIndex: null, // 重置冠军选择
      playerList: [],
      playerNames: []
    })

    wx.showLoading({ title: '检索选手中...' })

    try {
      // 去报名表(registrations)查谁参加了这个比赛
      const regRes = await db.collection('registrations')
        .where({ tournament_id: selectedTour._id })
        .get()

      const registrations = regRes.data

      if (registrations.length === 0) {
        wx.hideLoading()
        return wx.showToast({ title: '该赛事无人报名', icon: 'none' })
      }

      // === 核心修复点在这里 ===
      // 根据你的截图，字段名是 player_name 和 player_id
      const players = registrations.map(r => ({
        name: r.player_name,  // <--- 之前是 r.name，改成 r.player_name
        player_id: r.player_id, 
        _id: r._id 
      }))

      // 去重 (防止一人报多项出现两次)
      const uniquePlayers = []
      const map = new Map()
      for (const item of players) {
        // 确保 player_id 存在才处理
        if (item.player_id && !map.has(item.player_id)) {
          map.set(item.player_id, true)
          uniquePlayers.push(item)
        }
      }

      this.setData({
        playerList: uniquePlayers,
        playerNames: uniquePlayers.map(p => p.name)
      })

      wx.hideLoading()

    } catch (err) {
      wx.hideLoading()
      console.error(err)
      wx.showToast({ title: '检索失败', icon: 'none' })
    }
  },

  // 3. 选中冠军
  bindPlayerChange(e) {
    this.setData({ playerIndex: e.detail.value })
  },

  // 4. 输入框绑定
  bindInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [field]: e.detail.value })
  },

  // 5. 提交
  submit() {
    const { tourIndex, playerIndex, tourList, playerList, titleName, year } = this.data

    if (tourIndex === null) return wx.showToast({ title: '请先选择赛事', icon: 'none' })
    if (playerIndex === null) return wx.showToast({ title: '请选择冠军', icon: 'none' })
    if (!titleName) return wx.showToast({ title: '请填写头衔', icon: 'none' })

    const selectedTour = tourList[tourIndex]
    const selectedPlayer = playerList[playerIndex]

    wx.showLoading({ title: '保存中...' })

    // 构造数据
    const record = {
      champion: selectedPlayer.player_id, // 冠军ID
      champion_name: selectedPlayer.name, // 冠军名字
      date: new Date(),                   // 录入时间
      title: titleName,                   // 头衔
      tournament: selectedTour.title,     // 赛事名
      tournament_id: selectedTour._id,    // 赛事ID
      year: year
    }

    db.collection('champions').add({
      data: record,
      success: res => {
        wx.hideLoading()
        wx.showToast({ title: '录入成功', icon: 'success' })
        setTimeout(() => { wx.navigateBack() }, 1500)
      },
      fail: err => {
        wx.hideLoading()
        console.error(err)
        wx.showModal({ title: '错误', content: '写入失败，请检查数据库权限' })
      }
    })
  }
})