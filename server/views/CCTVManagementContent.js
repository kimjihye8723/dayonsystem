import express from 'express';
import db from '../config/db.js';

const router = express.Router();

// CCTV 목록 조회 - TCM_CCTV 기반
router.get('/cctvs', (req, res) => {
    const { cctvNm, vendorNm } = req.query;
    let query = `
        SELECT c.*, v.VENDOR_NM
        FROM TCM_CCTV c
        LEFT JOIN TCM_VENDOR v ON c.CORP_CD = v.CORP_CD AND c.USE_VENDOR = v.VENDOR_CD
        WHERE c.CORP_CD = '25001'
    `;
    const params = [];

    if (cctvNm) { query += ' AND c.CONNECT_INFO LIKE ?'; params.push(`%${cctvNm}%`); }
    if (vendorNm) { query += ' AND v.VENDOR_NM LIKE ?'; params.push(`%${vendorNm}%`); }

    query += ' ORDER BY c.idx DESC';

    db.query(query, params, (err, results) => {
        if (err) {
            console.error('[DEBUG] /api/cctvs query error:', err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, cctvs: results });
    });
});

// CCTV 저장/수정 (배열)
router.post('/cctvs/save', (req, res) => {
    const cctvs = Array.isArray(req.body) ? (req.body) : (req.body.cctvs || []);
    if (!Array.isArray(cctvs) || cctvs.length === 0)
        return res.status(400).json({ success: false, message: '저장할 데이터가 없습니다.' });

    let completed = 0;
    const errors = [];

    const finalize = () => {
        if (errors.length > 0) res.status(500).json({ success: false, errors });
        else res.json({ success: true, message: '저장되었습니다.' });
    };

    cctvs.forEach(c => {
        const checkSql = "SELECT idx FROM TCM_CCTV WHERE CORP_CD='25001' AND CONNECT_INFO=?";
        db.query(checkSql, [c.CONNECT_INFO], (err, results) => {
            if (err) {
                console.error('CCTV Check Error:', err.message);
                errors.push(err.message);
                if (++completed === cctvs.length) finalize();
                return;
            }

            if (results && results.length > 0) {
                // Update
                const sql = `UPDATE TCM_CCTV SET DEVICE_RTSP=?, SET_DT=?, USE_VENDOR=?, USE_YN=?, REMARK=?, MODIFYDT=NOW(), MODIFYUSER='ADMIN'
                             WHERE CORP_CD='25001' AND CONNECT_INFO=?`;
                db.query(sql, [c.DEVICE_RTSP, c.SET_DT, c.USE_VENDOR, c.USE_YN, c.REMARK, c.CONNECT_INFO], (e) => {
                    if (e) { console.error('CCTV Update Error:', e.message); errors.push(e.message); }
                    if (++completed === cctvs.length) finalize();
                });
            } else {
                // Insert
                const sql = `INSERT INTO TCM_CCTV (CORP_CD, CONNECT_INFO, DEVICE_RTSP, SET_DT, USE_VENDOR, USE_YN, REMARK, REGISTDT, REGISTUSER, idx)
                             VALUES ('25001', ?, ?, ?, ?, ?, ?, NOW(), 'ADMIN', (SELECT IFNULL(MAX(t2.idx), 0) + 1 FROM (SELECT idx FROM TCM_CCTV WHERE CORP_CD='25001') AS t2))`;
                db.query(sql, [c.CONNECT_INFO, c.DEVICE_RTSP, c.SET_DT, c.USE_VENDOR, c.USE_YN || 'Y', c.REMARK], (e) => {
                    if (e) {
                        console.error('CCTV Insert Error:', e.message); 
                        errors.push(e.message); 
                    }
                    if (++completed === cctvs.length) finalize();
                });
            }
        });
    });
});

// CCTV 삭제 - CONNECT_INFO 배열 기준
router.delete('/cctvs', (req, res) => {
    const { connectInfos } = req.body;
    if (!connectInfos || !Array.isArray(connectInfos) || connectInfos.length === 0)
        return res.status(400).json({ success: false, message: 'connectInfos 배열이 필요합니다.' });
    const placeholders = connectInfos.map(() => '?').join(', ');
    const sql = `DELETE FROM TCM_CCTV WHERE CORP_CD = '25001' AND CONNECT_INFO IN (${placeholders})`;
    db.query(sql, connectInfos, (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: '삭제되었습니다.' });
    });
});

export default router;
