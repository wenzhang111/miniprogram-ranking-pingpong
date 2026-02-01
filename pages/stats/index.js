// pages/stats/index.js
const app = getApp()

Page({
  data: {
    yanfuList: [],
    fuxingList: [],
    juanwangList: [],
    lianshengList: [],
    haiwangList: [],
    zhenaiList: [],
    loading: true
  },

  onShow() {
    this.loadStats()
  },

  onPullDownRefresh() {
    this.loadStats(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 这里的逻辑非常简单：呼叫云函数 -> 拿数据 -> 显示
  loadStats(callback) {
    wx.showLoading({ title: '加载中...' })
    
    wx.cloud.callFunction({
      name: 'getFunStats', // 呼叫刚才写的云函数
      success: res => {
        wx.hideLoading()
        
        if (res.result && res.result.success) {
          const stats = res.result.data
          // 直接把云函数算好的数据放到页面上
          this.setData({
            juanwangList: stats.juanwangList,
            haiwangList: stats.haiwangList,
            lianshengList: stats.lianshengList,
            zhenaiList: stats.zhenaiList,
            yanfuList: stats.yanfuList,
            fuxingList: stats.fuxingList,
            loading: false
          })
        } else {
          console.error('云函数报错:', res)
          wx.showToast({ title: '加载失败', icon: 'none' })
        }
        
        if(callback) callback()
      },
      fail: err => {
        wx.hideLoading()
        console.error('调用失败:', err)
        wx.showToast({ title: '网络错误', icon: 'none' })
        if(callback) callback()
      }
    })
  }
})