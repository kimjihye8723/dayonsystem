import express from 'express';
import db from '../config/db.js';

const router = express.Router();

router.get('/content-agg', (req, res) => {
    const { startDate, endDate, area1, advertiser, content } = req.query;
    const corpCd = '25001';
    db.query("SELECT DISTINCT VENDOR_NM as BRAND FROM TCM_VENDOR WHERE CORP_CD = ? AND VENDOR_SEC = '1' ORDER BY BRAND", [corpCd], (err, brandsResults) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        const brands = brandsResults.map(b => b.BRAND).filter(b => b);
        let pivotCols = ""; brands.forEach(brand => { pivotCols += `, SUM(CASE WHEN V.VENDOR_NM LIKE CONCAT(${db.escape(brand)}, '%') THEN 1 ELSE 0 END) AS ${db.escape(brand)}`; });
        let query = `SELECT L.LOG_DT, L.CUR_PROGRAM AS CONTENTS_KEY, C.CONTENTS_NM, ADV.VENDOR_NM AS ADVERTISER_NM ${pivotCols} FROM TPR_DPLOG L JOIN TCM_CONTENTS C ON L.CORP_CD = C.CORP_CD AND L.CUR_PROGRAM = C.CONTENTS_KEY JOIN TCM_VENDOR V ON L.CORP_CD = V.CORP_CD AND L.VENDOR_CD = V.VENDOR_CD LEFT JOIN TCM_VENDOR ADV ON C.CORP_CD = ADV.CORP_CD AND C.VENDOR_CD = ADV.VENDOR_CD WHERE L.CORP_CD = ?`;
        const params = [corpCd];
        if (startDate && endDate) { query += " AND L.LOG_DT BETWEEN ? AND ?"; params.push(startDate.replace(/-/g, ''), endDate.replace(/-/g, '')); }
        if (advertiser) { query += " AND ADV.VENDOR_NM LIKE ?"; params.push(`%${advertiser}%`); }
        if (content) { query += " AND C.CONTENTS_NM LIKE ?"; params.push(`%${content}%`); }
        if (area1 && area1 !== 'ALL') { query += " AND V.ADDR_AREA1 = ?"; params.push(area1); }
        query += " GROUP BY L.LOG_DT, L.CUR_PROGRAM ORDER BY L.LOG_DT DESC, C.CONTENTS_NM ASC";
        db.query(query, params, (err2, results) => {
            if (err2) return res.status(500).json({ success: false, error: err2.message });
            res.json({ success: true, data: results, brands });
        });
    });
});

export default router;
