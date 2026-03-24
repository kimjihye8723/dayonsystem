import express from 'express';
import db from '../config/db.js';

const router = express.Router();

/**
 * GET /api/realtimestatus/vendors
 * Retrieve a list of vendors to populate the dropdown.
 */
router.get('/realtimestatus/vendors', (req, res) => {
    // Assuming CORP_CD is fixed or retrieved from session, using '25001' as standard for this CMS
    const corpCd = '25001'; 
    const query = `
        SELECT VENDOR_CD, VENDOR_NM 
        FROM TCM_VENDOR 
        WHERE CORP_CD = ? 
          AND CLOSE_YN = 'N'
        ORDER BY VENDOR_NM
    `;
    
    db.query(query, [corpCd], (err, results) => {
        if (err) {
            console.error('[API] /realtimestatus/vendors error:', err);
            return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
        }
        res.json({ success: true, vendors: results });
    });
});

/**
 * GET /api/realtimestatus/data
 * Query Parameters: vendorCd
 * Retrieves real-time data from TCM_CCTV and hourly statistics from TCM_CCTV_STATISTICS
 */
router.get('/realtimestatus/data', (req, res) => {
    const { vendorCd, date } = req.query;
    const corpCd = '25001';
    const targetDate = date || null; // If null, use CURDATE() in SQL

    // 1. Fetch real-time total counters & connection status
    // If vendorCd is missing or 'ALL', we sum all active vendors
    let realtimeQuery = `
        SELECT 
            MAX(CONNECT_YN) as CONNECT_YN,
            SUM(NOW_TOTAL_IN) as TOTAL_IN,
            SUM(NOW_TOTAL_OUT) as TOTAL_OUT,
            SUM(NOW_MALE_IN) as MALE_IN,
            SUM(NOW_MALE_OUT) as MALE_OUT,
            SUM(NOW_FEMALE_IN) as FEMALE_IN,
            SUM(NOW_FEMALE_OUT) as FEMALE_OUT,
            MAX(CONNECT_DT) as LAST_UPDATE
        FROM TCM_CCTV 
        WHERE CORP_CD = ? AND USE_YN = 'Y'
    `;
    const realtimeParams = [corpCd];
    if (vendorCd && vendorCd !== 'ALL' && vendorCd !== '(전체조회)') {
        realtimeQuery += " AND USE_VENDOR = ?";
        realtimeParams.push(vendorCd);
    }

    // 2. Fetch hourly statistics
    let hourlyQuery = `
        SELECT 
            DATE_FORMAT(S.INSERT_DT, '%H') as hour,
            SUM(S.TOTAL_IN) as totalIn,
            SUM(S.TOTAL_OUT) as totalOut,
            SUM(S.MALE_IN) as maleIn,
            SUM(S.MALE_OUT) as maleOut,
            SUM(S.FEMALE_IN) as femaleIn,
            SUM(S.FEMALE_OUT) as femaleOut
        FROM TCM_CCTV_STATISTICS S
        JOIN TCM_CCTV C ON S.CONNECT_INFO = C.CONNECT_INFO
        WHERE C.CORP_CD = ? AND DATE(S.INSERT_DT) = ${targetDate ? '?' : 'CURDATE()'}
    `;
    const hourlyParams = [corpCd];
    if (targetDate) hourlyParams.push(targetDate);

    if (vendorCd && vendorCd !== 'ALL' && vendorCd !== '(전체조회)') {
        hourlyQuery += " AND C.USE_VENDOR = ?";
        hourlyParams.push(vendorCd);
    }

    hourlyQuery += `
        GROUP BY DATE_FORMAT(S.INSERT_DT, '%H')
        ORDER BY hour ASC
    `;

    // 3. Daily totals query (SUM of the LATEST record for each device to avoid double-counting accumulated values)
    let dailyTotalsQuery = `
        SELECT 
            SUM(totalIn) as totalIn,
            SUM(totalOut) as totalOut,
            SUM(maleIn) as maleIn,
            SUM(maleOut) as maleOut,
            SUM(femaleIn) as femaleIn,
            SUM(femaleOut) as femaleOut
        FROM (
            SELECT 
                S.TOTAL_IN as totalIn,
                S.TOTAL_OUT as totalOut,
                S.MALE_IN as maleIn,
                S.MALE_OUT as maleOut,
                S.FEMALE_IN as femaleIn,
                S.FEMALE_OUT as femaleOut,
                ROW_NUMBER() OVER (PARTITION BY S.CONNECT_INFO ORDER BY S.INSERT_DT DESC) as rn
            FROM TCM_CCTV_STATISTICS S
            JOIN TCM_CCTV C ON S.CONNECT_INFO = C.CONNECT_INFO
            WHERE C.CORP_CD = ? AND DATE(S.INSERT_DT) = ${targetDate ? '?' : 'CURDATE()'}
            ${vendorCd && vendorCd !== 'ALL' && vendorCd !== '(전체조회)' ? 'AND C.USE_VENDOR = ?' : ''}
        ) t
        WHERE rn = 1
    `;
    const dailyParams = [corpCd];
    if (targetDate) dailyParams.push(targetDate);
    if (vendorCd && vendorCd !== 'ALL' && vendorCd !== '(전체조회)') {
        dailyParams.push(vendorCd);
    }

    db.query(realtimeQuery, realtimeParams, (err, realtimeResults) => {
        if (err) {
            console.error('[API] /realtimestatus/data realtime error:', err);
            return res.status(500).json({ success: false, message: '실시간 데이터 조회 오류' });
        }

        db.query(hourlyQuery, hourlyParams, (err, hourlyResults) => {
            if (err) {
                console.error('[API] /realtimestatus/data hourly error:', err);
                return res.status(500).json({ success: false, message: '시간대별 데이터 조회 오류' });
            }

            db.query(dailyTotalsQuery, dailyParams, (err, dailyResults) => {
                if (err) {
                    console.error('[API] /realtimestatus/data dailyTotals error:', err);
                    return res.status(500).json({ success: false, message: '일일 합계 조회 오류' });
                }

                const realtime = realtimeResults[0] || {};
                const statsSum = dailyResults[0] || {};

                // dailyTotals = 통계 테이블(TCM_CCTV_STATISTICS) 합산만 사용 (실시간 값 미포함)
                const dailyTotals = {
                    totalIn:    Number(statsSum.totalIn),
                    totalOut:   Number(statsSum.totalOut),
                    maleIn:     Number(statsSum.maleIn),
                    maleOut:    Number(statsSum.maleOut),
                    femaleIn:   Number(statsSum.femaleIn),
                    femaleOut:  Number(statsSum.femaleOut),
                };

                res.json({
                    success: true,
                    realtime: {
                        connect_yn: realtime.CONNECT_YN || 'N',
                        total_in: realtime.TOTAL_IN || 0,
                        total_out: realtime.TOTAL_OUT || 0,
                        male_in: realtime.MALE_IN || 0,
                        male_out: realtime.MALE_OUT || 0,
                        female_in: realtime.FEMALE_IN || 0,
                        female_out: realtime.FEMALE_OUT || 0,
                        last_update: realtime.LAST_UPDATE
                    },
                    dailyTotals,
                    hourly: hourlyResults || []
                });
            });
        });
    });
});

export default router;
