import express from 'express';
import db from '../config/db.js';

const router = express.Router();

router.get('/basic-codes/by-name', (req, res) => {
    const { groupNm } = req.query;
    const query = "SELECT CODE_CD, CODE_NM FROM TCM_BASIC WHERE CORP_CD = '25001' AND GROUP_NM = ? AND USE_YN = 'Y' ORDER BY SORT_SEQ, CODE_CD";
    db.query(query, [groupNm], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, codes: results });
    });
});

router.get('/basic-codes/groups', (req, res) => {
    const query = "SELECT GROUP_CD, MAX(GROUP_NM) AS GROUP_NM, COUNT(*) AS count FROM TCM_BASIC WHERE CORP_CD = '25001' GROUP BY GROUP_CD ORDER BY GROUP_CD";
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, groups: results });
    });
});

router.get('/basic-codes', (req, res) => {
    const { groupCd } = req.query;
    const query = "SELECT * FROM TCM_BASIC WHERE CORP_CD = '25001' AND GROUP_CD = ? ORDER BY SORT_SEQ, CODE_CD";
    db.query(query, [groupCd], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, codes: results });
    });
});

router.post('/basic-codes', (req, res) => {
    const code = req.body;
    const query = `
        INSERT INTO TCM_BASIC (CORP_CD, GROUP_CD, CODE_CD, GROUP_NM, CODE_NM, CODE_PROP1, CODE_PROP2, CODE_PROP3, DESCRIPTION_TX, DEFAULT_YN, USE_YN, SYSTEM_YN, RELATION_CD, SORT_SEQ, REMARK, REGISTUSER, REGISTDT)
        VALUES ('25001', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ADMIN', NOW())
    `;
    db.query(query, [code.GROUP_CD, code.CODE_CD, code.GROUP_NM, code.CODE_NM, code.CODE_PROP1, code.CODE_PROP2, code.CODE_PROP3, code.DESCRIPTION_TX, code.DEFAULT_YN || 'N', code.USE_YN || 'Y', code.SYSTEM_YN || 'N', code.RELATION_CD, code.SORT_SEQ || 0, code.REMARK], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: '등록되었습니다.' });
    });
});

router.put('/basic-codes', (req, res) => {
    const code = req.body;
    const query = `
        UPDATE TCM_BASIC SET CODE_NM = ?, CODE_PROP1 = ?, CODE_PROP2 = ?, CODE_PROP3 = ?, DESCRIPTION_TX = ?, DEFAULT_YN = ?, USE_YN = ?, SYSTEM_YN = ?, RELATION_CD = ?, SORT_SEQ = ?, REMARK = ?, MODIFYUSER = 'ADMIN', MODIFYDT = NOW()
        WHERE CORP_CD = '25001' AND GROUP_CD = ? AND CODE_CD = ?
    `;
    db.query(query, [code.CODE_NM, code.CODE_PROP1, code.CODE_PROP2, code.CODE_PROP3, code.DESCRIPTION_TX, code.DEFAULT_YN, code.USE_YN, code.SYSTEM_YN, code.RELATION_CD, code.SORT_SEQ, code.REMARK, code.GROUP_CD, code.CODE_CD], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: '수정되었습니다.' });
    });
});

router.delete('/basic-codes', (req, res) => {
    const { GROUP_CD, CODE_CD } = req.body;
    db.query("DELETE FROM TCM_BASIC WHERE CORP_CD = '25001' AND GROUP_CD = ? AND CODE_CD = ?", [GROUP_CD, CODE_CD], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: '삭제되었습니다.' });
    });
});

router.put('/basic-codes/reorder', (req, res) => {
    const { GROUP_CD, orders } = req.body;
    let completed = 0;
    orders.forEach(order => {
        db.query("UPDATE TCM_BASIC SET SORT_SEQ = ? WHERE CORP_CD = '25001' AND GROUP_CD = ? AND CODE_CD = ?", [order.SORT_SEQ, GROUP_CD, order.CODE_CD], () => {
            if (++completed === orders.length) res.json({ success: true });
        });
    });
});

router.get('/common/codes/:groupCd', (req, res) => {
    const { groupCd } = req.params;
    const query = "SELECT CORP_CD, CODE_CD, CODE_NM FROM TCM_BASIC WHERE GROUP_CD = ? AND USE_YN = 'Y' ORDER BY SORT_SEQ";
    db.query(query, [groupCd], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, codes: results });
    });
});

export default router;
