import express from 'express';
import db from '../config/db.js';

const router = express.Router();

// 장비 목록 조회 - TCM_DEVICEINFO 기반
router.get('/devices', (req, res) => {
    const { startDate, endDate, vendorNm } = req.query;
    let query = `
        SELECT d.*, v.VENDOR_NM AS USE_VENDOR_NM
        FROM TCM_DEVICEINFO d
        LEFT JOIN TCM_VENDOR v ON d.CORP_CD = v.CORP_CD AND d.USE_VENDOR = v.VENDOR_CD
        WHERE d.CORP_CD = '25001'
    `;
    const params = [];

    if (startDate) { query += " AND d.INPUT_DT >= ?"; params.push(startDate); }
    if (endDate) { query += " AND d.INPUT_DT <= ?"; params.push(endDate); }
    if (vendorNm) { query += ' AND v.VENDOR_NM LIKE ?'; params.push(`%${vendorNm}%`); }

    query += ' ORDER BY d.REGISTDT DESC';

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, devices: results });
    });
});

// 장비 저장/수정
router.post('/devices/save', (req, res) => {
    const devices = Array.isArray(req.body) ? req.body : req.body.devices;
    if (!Array.isArray(devices) || devices.length === 0)
        return res.status(400).json({ success: false, message: '저장할 데이터가 없습니다.' });

    let completed = 0;
    const errors = [];

    const finalize = () => {
        if (errors.length > 0) {
            res.status(500).json({ success: false, errors });
        } else {
            const currentIds = devices.map(d => d.DEVICE_ID).filter(id => id);
            if (currentIds.length > 0) {
                const placeholders = currentIds.map(() => '?').join(', ');
                const delSql = `DELETE FROM TCM_DEVICEINFO WHERE CORP_CD='25001' AND DEVICE_ID NOT IN (${placeholders})`;
                db.query(delSql, currentIds, (err) => {
                    if (err) res.status(500).json({ success: false, error: err.message });
                    else res.json({ success: true, message: '동기화되었습니다.' });
                });
            } else {
                res.json({ success: true, message: '저장되었습니다.' });
            }
        }
    };

    devices.forEach(d => {
        const checkSql = "SELECT DEVICE_ID FROM TCM_DEVICEINFO WHERE CORP_CD='25001' AND DEVICE_ID=?";
        db.query(checkSql, [d.DEVICE_ID], (err, results) => {
            if (err) {
                errors.push(err.message);
                if (++completed === devices.length) finalize();
                return;
            }

            if (results && results.length > 0) {
                const sql = `UPDATE TCM_DEVICEINFO SET INPUT_DT=?, OUTPUT_DT=?, DISPOSE_DT=?, USE_VENDOR=?, USE_YN=?, REMARK=?, MODIFYDT=NOW(), MODIFYUSER='ADMIN'
                             WHERE CORP_CD='25001' AND DEVICE_ID=?`;
                db.query(sql, [d.INPUT_DT || '', d.OUTPUT_DT || '', d.DISPOSE_DT || '', d.USE_VENDOR || '', d.USE_YN, d.REMARK || '', d.DEVICE_ID], (e) => {
                    if (e) errors.push(e.message);
                    if (++completed === devices.length) finalize();
                });
            } else {
                const sql = `INSERT INTO TCM_DEVICEINFO (CORP_CD, DEVICE_ID, INPUT_DT, OUTPUT_DT, DISPOSE_DT, USE_VENDOR, USE_YN, REMARK, REGISTDT, REGISTUSER)
                             VALUES ('25001', ?, ?, ?, ?, ?, ?, ?, NOW(), 'ADMIN')`;
                db.query(sql, [d.DEVICE_ID, d.INPUT_DT || '', d.OUTPUT_DT || '', d.DISPOSE_DT || '', d.USE_VENDOR || '', d.USE_YN || 'Y', d.REMARK || ''], (e) => {
                    if (e) errors.push(e.message);
                    if (++completed === devices.length) finalize();
                });
            }
        });
    });
});

// 장비 삭제
router.delete('/devices', (req, res) => {
    const { deviceKeys } = req.body;
    if (!deviceKeys || !Array.isArray(deviceKeys) || deviceKeys.length === 0)
        return res.status(400).json({ success: false, message: 'deviceKeys 배열이 필요합니다.' });
    const placeholders = deviceKeys.map(() => '?').join(', ');
    const sql = `DELETE FROM TCM_DEVICEINFO WHERE CORP_CD = '25001' AND DEVICE_ID IN (${placeholders})`;
    db.query(sql, deviceKeys, (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: '삭제되었습니다.' });
    });
});

export default router;
