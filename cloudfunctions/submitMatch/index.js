const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 积分计算算法
function calcScoreChange(scoreA, scoreB, winner) {
  const scoreTable = [
    { min: 0, max: 12, high_win: 12, high_lose: 12, low_win: 12, low_lose: 12 },
    { min: 13, max: 37, high_win: 11, high_lose: 10, low_win: 13, low_lose: 7 },
    { min: 38, max: 62, high_win: 9, high_lose: 10, low_win: 13, low_lose: 6 },
    { min: 63, max: 87, high_win: 7, high_lose: 12, low_win: 16, low_lose: 5 },
    { min: 88, max: 112, high_win: 6, high_lose: 18, low_win: 20, low_lose: 4 },
    { min: 113, max: 137, high_win: 5, high_lose: 23, low_win: 25, low_lose: 3 },
    { min: 138, max: 162, high_win: 4, high_lose: 27, low_win: 30, low_lose: 2 },
    { min: 163, max: 187, high_win: 2, high_lose: 32, low_win: 33, low_lose: 2 },
    { min: 188, max: 212, high_win: 2, high_lose: 34, low_win: 35, low_lose: 1 },
    { min: 213, max: 237, high_win: 1, high_lose: 35, low_win: 38, low_lose: 1 },
    { min: 238, max: 99999, high_win: 1, high_lose: 40, low_win: 40, low_lose: 0 }
  ];

  const diff = Math.abs(scoreA - scoreB);
  let res = { deltaA: 0, deltaB: 0 };

  for (let row of scoreTable) {
    if (diff >= row.min && diff <= row.max) {
      let high = scoreA > scoreB ? 'A' : 'B';
      if (winner === high) { 
        if (high === 'A') { res.deltaA = row.high_win; res.deltaB = -row.low_lose; }
        else { res.deltaA = -row.low_lose; res.deltaB = row.high_win; }
      } else { 
        if (high === 'A') {
          res.deltaA = -(row.high_lose - Math.floor(0.05 * diff));
          res.deltaB = (row.low_win + Math.floor(0.1 * diff));
        } else {
          res.deltaA = (row.low_win - Math.floor(0.04 * diff));
          res.deltaB = -(row.high_lose + Math.floor(0.05 * diff));
        }
      }
      break;
    }
  }
  return res;
}

exports.main = async (event, context) => {
  // 增加 action 参数，用于区分是“录入”还是“撤销”
  const { match_id, p1_id, p2_id, winner_code, action } = event 

  if (!match_id) return { success: false, error: '缺少 match_id' }

  try {
    // ==========================================
    // 🔴 撤销逻辑 (Revoke)
    // ==========================================
    if (action === 'revoke') {
      // 1. 查出原来的变动分
      const matchRes = await db.collection('matches').doc(match_id).get()
      const match = matchRes.data

      if (match.status !== 1) return { success: false, error: '比赛未结束，无法撤销' }

      await db.runTransaction(async transaction => {
        // A. 回滚 P1 分数 (减去 delta1)
        await transaction.collection('players').where({ player_id: match.player1 }).update({
          data: { score: _.inc(-match.delta1) }
        })
        // B. 回滚 P2 分数
        await transaction.collection('players').where({ player_id: match.player2 }).update({
          data: { score: _.inc(-match.delta2) }
        })
        // C. 重置比赛状态
        await transaction.collection('matches').doc(match_id).update({
          data: {
            status: 0,
            winner: _.remove(),
            delta1: _.remove(),
            delta2: _.remove(),
            date: _.remove()
          }
        })
      })
      return { success: true, type: 'revoke' }
    }

    // ==========================================
    // 🟢 正常录入逻辑
    // ==========================================
    else {
      const p1_res = await db.collection('players').where({ player_id: p1_id }).get()
      const p2_res = await db.collection('players').where({ player_id: p2_id }).get()
      
      if (p1_res.data.length === 0 || p2_res.data.length === 0) return { error: '找不到球员' }
      
      const p1 = p1_res.data[0]
      const p2 = p2_res.data[0]
      
      const changes = calcScoreChange(p1.score, p2.score, winner_code)
      
      await db.runTransaction(async transaction => {
        await transaction.collection('players').doc(p1._id).update({ data: { score: _.inc(changes.deltaA) } })
        await transaction.collection('players').doc(p2._id).update({ data: { score: _.inc(changes.deltaB) } })
        
        await transaction.collection('matches').doc(match_id).update({
          data: {
            status: 1,
            winner: winner_code === 'A' ? p1_id : p2_id,
            delta1: changes.deltaA,
            delta2: changes.deltaB,
            date: new Date(),
            score1_old: p1.score,
            score2_old: p2.score
          }
        })
      })
      return { success: true, changes: changes }
    }

  } catch (e) {
    return { success: false, error: e }
  }
}