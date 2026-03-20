import express from 'express';
import db from '../config/db.js';

const router = express.Router();

// 게시판 목록 조회
router.get('/boards', (req, res) => {
    const { startDate, endDate, title, boardSec } = req.query;
    let query = "SELECT * FROM TCM_BOARD WHERE CORP_CD = '22002' AND USE_YN = 'Y'";
    const params = [];
    if (startDate) { query += " AND REG_DT >= ?"; params.push(startDate); }
    if (endDate) { query += " AND REG_DT <= ?"; params.push(endDate); }
    if (title) { query += " AND TX_TITLE LIKE ?"; params.push(`%${title}%`); }
    if (boardSec) { query += " AND BOARD_SEC = ?"; params.push(boardSec); }

    query += " ORDER BY REG_DT DESC, BOARD_NO DESC";

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        const formattedBoards = results.map(b => ({
            ...b,
            TX_CONTENTS: b.TX_CONTENTS ? b.TX_CONTENTS.toString() : ''
        }));
        res.json({ success: true, boards: formattedBoards });
    });
});

// 게시글 상세 조회
router.get('/boards/:boardNo', (req, res) => {
    const { boardNo } = req.params;
    const query = "SELECT * FROM TCM_BOARD WHERE CORP_CD = '22002' AND BOARD_NO = ?";
    db.query(query, [boardNo], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (!results || results.length === 0) return res.status(404).json({ success: false, message: '게시글을 찾을 수 없습니다.' });

        const board = results[0];
        if (board.TX_CONTENTS) board.TX_CONTENTS = board.TX_CONTENTS.toString();
        res.json({ success: true, board });
    });
});

// 게시글 신규 등록
router.post('/boards', (req, res) => {
    const b = req.body;
    const maxQuery = "SELECT IFNULL(MAX(CAST(BOARD_NO AS UNSIGNED)), 0) + 1 AS NEXT_NO FROM TCM_BOARD WHERE CORP_CD = '22002'";
    db.query(maxQuery, (err, maxResult) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        const nextNo = maxResult[0].NEXT_NO;
        const query = `
            INSERT INTO TCM_BOARD (
                CORP_CD, BOARD_NO, REG_DT, REG_USER, BOARD_SEC,
                TARGET_USERSEC, TARGET_YN, TOP_YN, START_DT, END_DT,
                TX_TITLE, TX_CONTENTS, POPUP_YN, USE_YN, REMARK,
                REGISTDT, REGISTUSER
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
        `;
        const params = [
            '22002', nextNo, b.REG_DT || new Date().toISOString().slice(0, 10).replace(/-/g, ''),
            b.REG_USER || 'ADMIN', b.BOARD_SEC || '01', b.TARGET_USERSEC || 'ALL', b.TARGET_YN || 'N',
            b.TOP_YN || 'N', b.START_DT, b.END_DT, b.TX_TITLE, b.TX_CONTENTS || '', b.POPUP_YN || 'N',
            b.USE_YN || 'Y', b.REMARK || '', 'ADMIN'
        ];
        db.query(query, params, (e) => {
            if (e) return res.status(500).json({ success: false, message: e.message });
            res.json({ success: true, message: '등록되었습니다.', boardNo: nextNo });
        });
    });
});

// 게시글 수정
router.put('/boards', (req, res) => {
    const b = req.body;
    const query = `
        UPDATE TCM_BOARD SET
            BOARD_SEC = ?, TARGET_USERSEC = ?, TARGET_YN = ?, TOP_YN = ?,
            START_DT = ?, END_DT = ?, TX_TITLE = ?, TX_CONTENTS = ?,
            POPUP_YN = ?, USE_YN = ?, REMARK = ?,
            MODIFYDT = NOW(), MODIFYUSER = 'ADMIN'
        WHERE CORP_CD = '22002' AND BOARD_NO = ?
    `;
    const params = [
        b.BOARD_SEC || '01', b.TARGET_USERSEC || 'ALL', b.TARGET_YN || 'N', b.TOP_YN || 'N',
        b.START_DT, b.END_DT, b.TX_TITLE, b.TX_CONTENTS || '', b.POPUP_YN || 'N', b.USE_YN || 'Y',
        b.REMARK || '', b.BOARD_NO
    ];
    db.query(query, params, (err) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, message: '수정되었습니다.' });
    });
});

// 게시글 삭제
router.delete('/boards', (req, res) => {
    const { boardNos } = req.body;
    const placeholders = boardNos.map(() => '?').join(', ');
    const query = `UPDATE TCM_BOARD SET USE_YN = 'N', MODIFYDT = NOW(), MODIFYUSER = 'ADMIN' WHERE CORP_CD = '22002' AND BOARD_NO IN (${placeholders})`;
    db.query(query, boardNos, (err) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, message: '삭제되었습니다.' });
    });
});

export default router;
