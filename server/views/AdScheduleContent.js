import express from 'express';
import db from '../config/db.js';

const router = express.Router();

router.get('/ad-schedules', (req, res) => {
    const { startDate, endDate, vendorCd } = req.query;
    const corpCd = '25001';
    let query = `SELECT A.REG_DT, FCM_GET_CODENM(A.CORP_CD, 'PR010', A.SCHEDULE_SEC, 'N') AS SCH_TYPE_NM, (SELECT COUNT(DISTINCT VENDOR_CD) FROM TCM_VENDOR_SCH WHERE CORP_CD = A.CORP_CD AND SCHEDULE_KEY = A.SCHEDULE_KEY) AS VENDOR_COUNT, A.SCHEDULE_KEY FROM TCM_VENDOR_SCH A WHERE A.CORP_CD = ?`;
    const params = [corpCd];
    if (startDate && endDate) { query += " AND A.REG_DT BETWEEN ? AND ?"; params.push(startDate.replace(/-/g, ''), endDate.replace(/-/g, '')); }
    if (vendorCd) { query += " AND A.VENDOR_CD = ?"; params.push(vendorCd); }
    query += " GROUP BY A.SCHEDULE_KEY, A.REG_DT, A.SCHEDULE_SEC, A.CORP_CD ORDER BY A.REG_DT, A.SCHEDULE_KEY";
    db.query(query, params, (err, results) => {
        if (err) {
            let fallbackQuery = `SELECT A.REG_DT, CASE WHEN A.SCHEDULE_SEC = '01' THEN '개별매장' ELSE A.SCHEDULE_SEC END AS SCH_TYPE_NM, (SELECT COUNT(DISTINCT VENDOR_CD) FROM TCM_VENDOR_SCH WHERE CORP_CD = A.CORP_CD AND SCHEDULE_KEY = A.SCHEDULE_KEY) AS VENDOR_COUNT, A.SCHEDULE_KEY FROM TCM_VENDOR_SCH A WHERE A.CORP_CD = ?`;
            const fbParams = [corpCd];
            if (startDate && endDate) { fallbackQuery += " AND A.REG_DT BETWEEN ? AND ?"; fbParams.push(startDate.replace(/-/g, ''), endDate.replace(/-/g, '')); }
            if (vendorCd) { fallbackQuery += " AND A.VENDOR_CD = ?"; fbParams.push(vendorCd); }
            fallbackQuery += " GROUP BY A.SCHEDULE_KEY, A.REG_DT, A.SCHEDULE_SEC, A.CORP_CD ORDER BY A.REG_DT, A.SCHEDULE_KEY";
            db.query(fallbackQuery, fbParams, (err2, results2) => {
                if (err2) return res.status(500).json({ success: false, error: err2.message });
                res.json({ success: true, schedules: results2 });
            });
        } else res.json({ success: true, schedules: results });
    });
});

router.get('/ad-schedules/detail', (req, res) => {
    const { scheduleKey } = req.query;
    const corpCd = '25001';
    if (!scheduleKey) return res.status(400).json({ success: false, message: 'scheduleKey 필요' });
    const query = `SELECT S.*, V.VENDOR_NM FROM TCM_VENDOR_SCH S LEFT JOIN TCM_VENDOR V ON S.CORP_CD = V.CORP_CD AND S.VENDOR_CD = V.VENDOR_CD WHERE S.CORP_CD = ? AND S.SCHEDULE_KEY = ?`;
    db.query(query, [corpCd, scheduleKey], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, details: results });
    });
});

router.post('/ad-schedules/save', (req, res) => {
    const { schedule, vendorCodes, gridData } = req.body;
    const corpCd = '25001';
    if (!vendorCodes || vendorCodes.length === 0) return res.status(400).json({ success: false, message: '점포 선택 필요' });
    const scheduleKey = schedule.SCHEDULE_KEY || `SC${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(2, 16)}`;
    const regDt = schedule.REG_DT?.replace(/-/g, '') || new Date().toISOString().split('T')[0].replace(/-/g, '');
    const startDt = schedule.START_DT?.replace(/-/g, '') || regDt;
    const endDt = schedule.END_DT?.replace(/-/g, '') || '20301231';
    let total = vendorCodes.length * gridData.length, completed = 0, errors = [];
    vendorCodes.forEach(vCd => {
        gridData.forEach(day => {
            const sql = `INSERT INTO TCM_VENDOR_SCH (CORP_CD, SCHEDULE_KEY, REG_DT, SCHEDULE_SEC, VENDOR_CD, START_DT, END_DT, DAY_SEC, USE_YN, SCH_00, SCH_01, SCH_02, SCH_03, SCH_04, SCH_05, SCH_06, SCH_07, SCH_08, SCH_09, SCH_10, SCH_11, SCH_12, SCH_13, SCH_14, SCH_15, SCH_16, SCH_17, SCH_18, SCH_19, SCH_20, SCH_21, SCH_22, SCH_23, REGISTDT, REGISTUSER) VALUES (?, ?, ?, '01', ?, ?, ?, ?, 'Y', ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, NOW(), 'ADMIN') ON DUPLICATE KEY UPDATE SCH_00=VALUES(SCH_00), SCH_01=VALUES(SCH_01), SCH_02=VALUES(SCH_02), SCH_03=VALUES(SCH_03), SCH_04=VALUES(SCH_04), SCH_05=VALUES(SCH_05), SCH_06=VALUES(SCH_06), SCH_07=VALUES(SCH_07), SCH_08=VALUES(SCH_08), SCH_09=VALUES(SCH_09), SCH_10=VALUES(SCH_10), SCH_11=VALUES(SCH_11), SCH_12=VALUES(SCH_12), SCH_13=VALUES(SCH_13), SCH_14=VALUES(SCH_14), SCH_15=VALUES(SCH_15), SCH_16=VALUES(SCH_16), SCH_17=VALUES(SCH_17), SCH_18=VALUES(SCH_18), SCH_19=VALUES(SCH_19), SCH_20=VALUES(SCH_20), SCH_21=VALUES(SCH_21), SCH_22=VALUES(SCH_22), SCH_23=VALUES(SCH_23), MODIFYDT=NOW(), MODIFYUSER='ADMIN'`;
            const params = [corpCd, scheduleKey, regDt, vCd, startDt, endDt, day.DAY_SEC, day.SCH_00||'', day.SCH_01||'', day.SCH_02||'', day.SCH_03||'', day.SCH_04||'', day.SCH_05||'', day.SCH_06||'', day.SCH_07||'', day.SCH_08||'', day.SCH_09||'', day.SCH_10||'', day.SCH_11||'', day.SCH_12||'', day.SCH_13||'', day.SCH_14||'', day.SCH_15||'', day.SCH_16||'', day.SCH_17||'', day.SCH_18||'', day.SCH_19||'', day.SCH_20||'', day.SCH_21||'', day.SCH_22||'', day.SCH_23||''];
            db.query(sql, params, (err) => { if (err) errors.push(err.message); if (++completed === total) res.json({ success: true, scheduleKey }); });
        });
    });
});

router.get('/today-applied-schedules', (req, res) => {
    const { vendorNm } = req.query;
    const corpCd = '25001';
    const daySec = new Date().getDay().toString();
    let sql = `SELECT V.VENDOR_CD, V.VENDOR_NM, V.OPEN_TIME, V.CLOSE_TIME, S.SCH_00, S.SCH_01, S.SCH_02, S.SCH_03, S.SCH_04, S.SCH_05, S.SCH_06, S.SCH_07, S.SCH_08, S.SCH_09, S.SCH_10, S.SCH_11, S.SCH_12, S.SCH_13, S.SCH_14, S.SCH_15, S.SCH_16, S.SCH_17, S.SCH_18, S.SCH_19, S.SCH_20, S.SCH_21, S.SCH_22, S.SCH_23 FROM TCM_VENDOR V LEFT JOIN TCM_VENDOR_SCH S ON V.CORP_CD = S.CORP_CD AND V.VENDOR_CD = S.VENDOR_CD AND S.DAY_SEC = ? AND S.USE_YN = 'Y' AND DATE_FORMAT(NOW(), '%Y%m%d') BETWEEN S.START_DT AND S.END_DT WHERE V.CORP_CD = ? AND V.VENDOR_SEC = '2'`;
    const params = [daySec, corpCd]; if (vendorNm) { sql += " AND V.VENDOR_NM LIKE ?"; params.push(`%${vendorNm}%`); }
    sql += " ORDER BY V.VENDOR_NM ASC";
    db.query(sql, params, (err, results) => { if (err) return res.status(500).json({ success: false, error: err.message }); res.json({ success: true, schedules: results }); });
});

export default router;
