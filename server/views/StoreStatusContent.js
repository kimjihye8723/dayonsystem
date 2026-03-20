import express from 'express';
import db from '../config/db.js';

const router = express.Router();

router.get('/store-status', (req, res) => {
    const { vendorNm, area1, area2, area3, status } = req.query;
    const corpCd = '25001';
    let query = `
        SELECT V.VENDOR_CD, V.VENDOR_NM, V.OPEN_TIME, V.CLOSE_TIME, V.ADDR_AREA1, V.ADDR_AREA2, V.ADDR_AREA3,
               VD.DEVICE_ID, VD.USE_YN AS DEVICE_USE_YN,
               CASE WHEN L.REGISTDT >= DATE_SUB(NOW(), INTERVAL 30 MINUTE) THEN 'ON' ELSE 'OFF' END AS STATUS,
               L.REGISTDT AS LAST_CONN_DT, L.CUR_PROGRAM AS PGM_NM, L.CUR_FILE AS FILE_NM
        FROM TCM_VENDOR V
        LEFT JOIN TCM_VENDOR_DEVICE VD ON V.CORP_CD = VD.CORP_CD AND V.VENDOR_CD = VD.VENDOR_CD
        LEFT JOIN (
            SELECT t.* FROM TPR_DPLOG t
            INNER JOIN (
                SELECT CORP_CD, VENDOR_CD, DEVICE_ID, MAX(REGISTDT) as MAX_REGISTDT
                FROM TPR_DPLOG GROUP BY CORP_CD, VENDOR_CD, DEVICE_ID
            ) m ON t.CORP_CD = m.CORP_CD AND t.VENDOR_CD = m.VENDOR_CD AND t.DEVICE_ID = m.DEVICE_ID AND t.REGISTDT = m.MAX_REGISTDT
        ) L ON V.CORP_CD = L.CORP_CD AND V.VENDOR_CD = L.VENDOR_CD AND VD.DEVICE_ID = L.DEVICE_ID
        WHERE V.CORP_CD = ? AND V.VENDOR_SEC = '2'
    `;
    const params = [corpCd];
    if (vendorNm) { query += " AND (V.VENDOR_NM LIKE ? OR V.VENDOR_CD LIKE ?)"; params.push(`%${vendorNm}%`, `%${vendorNm}%`); }
    if (area1 && area1 !== 'ALL') { query += " AND V.ADDR_AREA1 = ?"; params.push(area1); }
    if (area2 && area2 !== 'ALL') { query += " AND V.ADDR_AREA2 = ?"; params.push(area2); }
    if (area3 && area3 !== 'ALL') { query += " AND V.ADDR_AREA3 = ?"; params.push(area3); }
    query += " ORDER BY V.VENDOR_NM ASC, VD.DEVICE_ID ASC";
    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        let filtered = results; if (status && status !== 'ALL') filtered = results.filter(r => r.STATUS === status);
        res.json({ success: true, statusList: filtered });
    });
});

export default router;
