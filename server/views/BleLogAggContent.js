import express from 'express';
import db from '../config/db.js';

const router = express.Router();

router.get('/ble-logs', (req, res) => {
    const { startDate, endDate, vendorGroup, onlyUnknown } = req.query;
    const corpCd = '25001';
    let where = `WHERE L.CORP_CD = ? AND L.LOG_DT BETWEEN ? AND ?`;
    const params = [corpCd, startDate?.replace(/-/g, '') || '', endDate?.replace(/-/g, '') || ''];
    if (onlyUnknown === 'true') where += ` AND L.DEVICE_NM = 'Unknown'`;
    const query = `SELECT L.LOG_DT, V.VENDOR_NM, L.DEVICE_MAC, L.DEVICE_NM, ROUND(AVG(L.DEVICE_RSSI), 1) as DEVICE_RSSI, MIN(L.FIRST_SEEN) as FIRST_IN_TIME, MAX(L.LAST_SEEN) as LAST_IN_TIME, TIME_FORMAT(SEC_TO_TIME(SUM(TIME_TO_SEC(L.OBSERVED_TM))), '%H:%i:%s') as TOTAL_OBSERVED, L.VENDOR_CD FROM TPR_BLELOG L JOIN TCM_VENDOR V ON L.CORP_CD = V.CORP_CD AND L.VENDOR_CD = V.VENDOR_CD ${where} GROUP BY L.LOG_DT, V.VENDOR_NM, L.DEVICE_MAC, L.DEVICE_NM, L.VENDOR_CD ORDER BY L.LOG_DT DESC, L.FIRST_SEEN DESC`;
    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        let filtered = results; if (vendorGroup && vendorGroup !== 'ALL') filtered = results.filter(r => r.VENDOR_NM.startsWith(vendorGroup));
        res.json({ success: true, data: filtered });
    });
});

router.get('/ble-logs/details', (req, res) => {
    const { date, mac, vendorCd } = req.query;
    const corpCd = '25001';
    const query = `SELECT * FROM TPR_BLELOG WHERE CORP_CD = ? AND LOG_DT = ? AND DEVICE_MAC = ? AND VENDOR_CD = ? ORDER BY LOG_TIME ASC`;
    db.query(query, [corpCd, date, mac, vendorCd], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, data: results });
    });
});

export default router;
