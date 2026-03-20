import express from 'express';
import db from '../config/db.js';

const router = express.Router();

router.get('/ad-play-logs', (req, res) => {
    const { startDate, endDate, vendorNm, area1, area2, area3, page = 1, pageSize = 100 } = req.query;
    const corpCd = '25001';
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const limit = parseInt(pageSize);
    let base = `FROM TPR_DPLOG L LEFT JOIN TCM_VENDOR V ON L.CORP_CD = V.CORP_CD AND L.VENDOR_CD = V.VENDOR_CD WHERE L.CORP_CD = ?`;
    let where = ""; const params = [corpCd];
    if (startDate && endDate) { where += " AND L.LOG_DT BETWEEN ? AND ?"; params.push(startDate.replace(/-/g, ''), endDate.replace(/-/g, '')); }
    else where += " AND L.LOG_DT >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 60 DAY), '%Y%m%d')";
    if (vendorNm) { where += " AND (V.VENDOR_NM LIKE ? OR V.VENDOR_CD LIKE ?)"; params.push(`%${vendorNm}%`, `%${vendorNm}%`); }
    if (area1 && area1 !== 'ALL') { where += " AND V.ADDR_AREA1 = ?"; params.push(area1); }
    if (area2 && area2 !== 'ALL') { where += " AND V.ADDR_AREA2 = ?"; params.push(area2); }
    if (area3 && area3 !== 'ALL') { where += " AND V.ADDR_AREA3 = ?"; params.push(area3); }
    db.query(`SELECT COUNT(*) as totalCount ` + base + where, params, (err, countRes) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        const total = countRes[0].totalCount;
        db.query(`SELECT V.VENDOR_NM, L.DEVICE_ID, L.DEVICE_NM, V.OPEN_TIME, V.CLOSE_TIME, L.LOG_DT, L.LOG_TIME, L.CT_TIME, L.CUR_PROGRAM, L.CUR_FILE ` + base + where + ` ORDER BY L.LOG_DT DESC, L.LOG_TIME DESC LIMIT ? OFFSET ?`, [...params, limit, offset], (err2, results) => {
            if (err2) return res.status(500).json({ success: false, error: err2.message });
            res.json({ success: true, logs: results, totalCount: total, totalPages: Math.ceil(total / limit), currentPage: parseInt(page) });
        });
    });
});

export default router;
