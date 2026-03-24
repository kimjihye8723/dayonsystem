import express from 'express';
import db from '../config/db.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';

const router = express.Router();

router.get('/contents-files/dates', (req, res) => {
    const corpCd = '25001';
    const query = `SELECT REG_DT, COUNT(*) as count, GROUP_CONCAT(FILE_TITLE SEPARATOR ', ') as fileTitles FROM TCM_CONTENTS_FILE WHERE CORP_CD = ? GROUP BY REG_DT ORDER BY REG_DT DESC`;
    db.query(query, [corpCd], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, dates: results });
    });
});

router.get('/contents-files', (req, res) => {
    const { regDt, fileTitle } = req.query;
    const corpCd = '25001';
    let query = "SELECT * FROM TCM_CONTENTS_FILE WHERE CORP_CD = ?";
    const params = [corpCd];
    if (regDt && regDt !== 'ALL') { query += " AND REG_DT = ?"; params.push(regDt); }
    if (fileTitle) { query += " AND (FILE_TITLE LIKE ? OR FILE_NAME LIKE ?)"; params.push(`%${fileTitle}%`, `%${fileTitle}%`); }
    query += " ORDER BY REGISTDT DESC, FILE_KEY DESC";
    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, files: results });
    });
});

router.post('/contents-files/save', (req, res) => {
    const files = Array.isArray(req.body) ? req.body : [req.body];
    const corpCd = '25001';
    if (files.length === 0) return res.status(400).json({ success: false, message: '데이터가 없습니다.' });
    let completed = 0; let errors = [];
    const finalize = () => {
        if (errors.length > 0) res.status(500).json({ success: false, errors });
        else res.json({ success: true, message: '저장되었습니다.' });
    };
    files.forEach(f => {
        const checkSql = "SELECT FILE_KEY FROM TCM_CONTENTS_FILE WHERE CORP_CD = ? AND FILE_KEY = ?";
        db.query(checkSql, [corpCd, f.FILE_KEY], (err, results) => {
            if (err) { errors.push(err.message); if (++completed === files.length) finalize(); return; }
            if (results.length > 0) {
                const sql = `UPDATE TCM_CONTENTS_FILE SET REG_DT = ?, FILE_NAME = ?, FILE_TITLE = ?, FTP_FILENAME = ?, FILE_MD5 = ?, FILE_SIZE = ?, FILE_TYP = ?, USE_YN = ?, REMARK = ?, ASPECTRATIO_YN = ?, SCREEN_WIDTH = ?, SCREEN_HEIGHT = ?, TEMP_USEYN = ?, GENDER = ?, MODIFYDT = NOW(), MODIFYUSER = 'ADMIN' WHERE CORP_CD = ? AND FILE_KEY = ?`;
                const params = [f.REG_DT, f.FILE_NAME, f.FILE_TITLE, f.FTP_FILENAME, f.FILE_MD5, f.FILE_SIZE, f.FILE_TYP, f.USE_YN || 'Y', f.REMARK, f.ASPECTRATIO_YN || 'N', f.SCREEN_WIDTH, f.SCREEN_HEIGHT, f.TEMP_USEYN || 'N', f.GENDER || null, corpCd, f.FILE_KEY];
                db.query(sql, params, (e) => { if (e) errors.push(e.message); if (++completed === files.length) finalize(); });
            } else {
                const sql = `INSERT INTO TCM_CONTENTS_FILE (CORP_CD, REG_DT, FILE_KEY, FILE_NAME, FILE_TITLE, FTP_FILENAME, FILE_MD5, FILE_SIZE, FILE_TYP, USE_YN, REMARK, REGISTDT, REGISTUSER, ASPECTRATIO_YN, SCREEN_WIDTH, SCREEN_HEIGHT, TEMP_USEYN, GENDER) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'ADMIN', ?, ?, ?, ?, ?)`;
                const params = [corpCd, f.REG_DT, f.FILE_KEY, f.FILE_NAME, f.FILE_TITLE, f.FTP_FILENAME, f.FILE_MD5, f.FILE_SIZE, f.FILE_TYP, f.USE_YN || 'Y', f.REMARK, f.ASPECTRATIO_YN || 'N', f.SCREEN_WIDTH, f.SCREEN_HEIGHT, f.TEMP_USEYN || 'N', f.GENDER || null];
                db.query(sql, params, (e) => { if (e) errors.push(e.message); if (++completed === files.length) finalize(); });
            }
        });
    });
});

router.delete('/contents-files', (req, res) => {
    const { fileKeys } = req.body;
    const corpCd = '25001';
    if (!fileKeys || !Array.isArray(fileKeys) || fileKeys.length === 0) return res.status(400).json({ success: false, message: 'fileKeys 필요' });
    const placeholders = fileKeys.map(() => '?').join(', ');
    const sql = `DELETE FROM TCM_CONTENTS_FILE WHERE CORP_CD = ? AND FILE_KEY IN (${placeholders})`;
    db.query(sql, [corpCd, ...fileKeys], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, message: '삭제되었습니다.' });
    });
});

router.get('/ad-contents', (req, res) => {
    const { startDate, endDate, advertiser } = req.query;
    const corpCd = '25001';
            let query = `SELECT C.REG_DT, V.VENDOR_NM AS ADVERTISER, C.VENDOR_CD, C.CONTENTS_NM AS TITLE, C.CONTENTS_KEY AS CONTENTS_ID, C.USE_YN, (SELECT COUNT(*) FROM TCM_CONTENTS_LIST WHERE CORP_CD = C.CORP_CD AND CONTENTS_KEY = C.CONTENTS_KEY) as FILE_COUNT FROM TCM_CONTENTS C LEFT JOIN TCM_VENDOR V ON C.CORP_CD = V.CORP_CD AND C.VENDOR_CD = V.VENDOR_CD WHERE C.CORP_CD = ?`;
    const params = [corpCd];
    if (startDate) { query += " AND C.REG_DT >= ?"; params.push(startDate.replace(/-/g, '')); }
    if (endDate) { query += " AND C.REG_DT <= ?"; params.push(endDate.replace(/-/g, '')); }
    if (advertiser) { query += " AND (V.VENDOR_NM LIKE ? OR C.CONTENTS_NM LIKE ?)"; params.push(`%${advertiser}%`, `%${advertiser}%`); }
    query += " ORDER BY C.REG_DT DESC, C.CONTENTS_KEY DESC";
    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, contents: results });
    });
});

router.get('/ad-contents/files', (req, res) => {
    const { contentsId } = req.query;
    const corpCd = '25001';
    if (!contentsId) return res.status(400).json({ success: false, message: 'contentsId 필요' });
    const query = `
        SELECT A.CONTENTS_KEY AS EDT_CONTENTS_KEY, A.CONTENTS_NM AS edt_Contents_NM, A.REG_DT AS dtp_Reg_DT, A.USE_YN AS chk_UseYn, FCM_GET_CORPNM(A.CORP_CD, 'F') AS edt_Company, FCM_GET_VENDORNM(A.CORP_CD, A.VENDOR_CD, 'F') AS edt_Vendor,
            CASE WHEN (ROUND((C.FILE_SIZE / 1024) * 0.1, 2) >= 1) THEN CONCAT(ROUND((C.FILE_SIZE / 1024) * 0.001, 2), 'MB') ELSE CONCAT(ROUND((C.FILE_SIZE / 1024), 2), 'KB') END AS FILE_SIZE_STR,
            C.FTP_FILENAME AS DB_FTP_FILENAME, C.FILE_NAME AS DB_FILE_NAME, C.FILE_KEY AS DB_FILE_KEY, C.FILE_MD5 AS DB_FILE_MD5, C.FILE_SIZE AS DB_FILE_SIZE, C.GENDER, B.DISP_SEQ AS PLAY_SEQ, B.IMAGE_DELAY AS DELAY_TIME, B.IN_EFFECT AS EFFECT_IN, B.OUT_EFFECT AS EFFECT_OUT, B.USE_YN, B.REMARK, C.FILE_KEY, C.FILE_NAME, C.FILE_TITLE, C.FILE_SIZE, C.FILE_MD5
        FROM TCM_CONTENTS A LEFT OUTER JOIN TCM_CONTENTS_LIST B ON A.CORP_CD = B.CORP_CD AND A.CONTENTS_KEY = B.CONTENTS_KEY JOIN TCM_CONTENTS_FILE C ON B.CORP_CD = C.CORP_CD AND B.FILE_KEY = C.FILE_KEY
        WHERE A.CORP_CD = ? AND A.CONTENTS_KEY = ? ORDER BY B.DISP_SEQ
    `;
    db.query(query, [corpCd, contentsId], (err, results) => {
        if (err) {
            const fallbackQuery = `SELECT L.FILE_KEY, F.FILE_NAME, F.FILE_TITLE, F.GENDER, L.USE_YN, L.DISP_SEQ AS PLAY_SEQ, L.IMAGE_DELAY AS DELAY_TIME, L.IN_EFFECT AS EFFECT_IN, L.OUT_EFFECT AS EFFECT_OUT, F.FILE_SIZE, F.FILE_MD5, L.REMARK FROM TCM_CONTENTS_LIST L JOIN TCM_CONTENTS_FILE F ON L.CORP_CD = F.CORP_CD AND L.FILE_KEY = F.FILE_KEY WHERE L.CORP_CD = ? AND L.CONTENTS_KEY = ? ORDER BY L.DISP_SEQ ASC`;
            db.query(fallbackQuery, [corpCd, contentsId], (err2, results2) => {
                if (err2) return res.status(500).json({ success: false, error: err2.message });
                res.json({ success: true, files: results2 });
            });
            return;
        }
        res.json({ success: true, files: results });
    });
});

router.get('/ad-contents/active-files', (req, res) => {
    const corpCd = '25001';
    db.query("SELECT FILE_KEY, FILE_NAME, FILE_TITLE, FILE_SIZE, FILE_MD5, FILE_TYP, USE_YN, REMARK, GENDER FROM TCM_CONTENTS_FILE WHERE CORP_CD = ? AND USE_YN = 'Y' ORDER BY REGISTDT DESC, FILE_KEY DESC", [corpCd], (err, results) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true, files: results });
    });
});

router.post('/ad-contents/save', (req, res) => {
    const { content, files } = req.body;
    const corpCd = '25001';
    if (!content || !content.CONTENTS_ID) return res.status(400).json({ success: false, message: 'CONTENTS_ID 필요' });

    const processFiles = () => {
        if (!files || !Array.isArray(files) || files.length === 0) {
            db.query("DELETE FROM TCM_CONTENTS_LIST WHERE CORP_CD = ? AND CONTENTS_KEY = ?", [corpCd, content.CONTENTS_ID], () => {
                return res.json({ success: true });
            });
            return;
        }
        db.query("DELETE FROM TCM_CONTENTS_LIST WHERE CORP_CD = ? AND CONTENTS_KEY = ?", [corpCd, content.CONTENTS_ID], (err) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            
            let completed = 0; let errors = [];
            files.forEach((f, idx) => {
                const sql = `INSERT INTO TCM_CONTENTS_LIST (CORP_CD, CONTENTS_KEY, FILE_KEY, DISP_SEQ, IMAGE_DELAY, IN_EFFECT, OUT_EFFECT, USE_YN, REMARK, REGISTDT, REGISTUSER) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'ADMIN')`;
                const playSeq = (f.PLAY_SEQ !== undefined && f.PLAY_SEQ !== null) ? f.PLAY_SEQ : (idx + 1);
                const params = [corpCd, content.CONTENTS_ID, f.FILE_KEY, playSeq, f.DELAY_TIME || 0, f.EFFECT_IN || '', f.EFFECT_OUT || '', f.USE_YN || 'Y', f.REMARK || ''];
                db.query(sql, params, (err1) => {
                    const updateFileSql = `UPDATE TCM_CONTENTS_FILE SET GENDER = ? WHERE CORP_CD = ? AND FILE_KEY = ?`;
                    db.query(updateFileSql, [f.GENDER || null, corpCd, f.FILE_KEY], (errUpdate) => {
                        if (err1 || errUpdate) errors.push(err1?.message || errUpdate?.message);
                        if (++completed === files.length) {
                            if (errors.length > 0) res.status(500).json({ success: false, errors });
                            else res.json({ success: true });
                        }
                    });
                });
            });
        });
    };

    if (content.CONTENTS_ID.startsWith('TEMP_')) {
        db.query("SELECT MAX(CAST(CONTENTS_KEY AS UNSIGNED)) as maxKey FROM TCM_CONTENTS WHERE CORP_CD = ?", [corpCd], (err, results) => {
            let nextKey = 1;
            if (!err && results.length > 0 && results[0].maxKey) nextKey = parseInt(results[0].maxKey) + 1;
            content.CONTENTS_ID = nextKey.toString();
            
            const sql = `INSERT INTO TCM_CONTENTS (CORP_CD, REG_DT, CONTENTS_KEY, VENDOR_CD, CONTENTS_NM, USE_YN, REGISTDT, REGISTUSER) VALUES (?, ?, ?, ?, ?, ?, NOW(), 'ADMIN')`;
            const regDt = content.REG_DT || new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const params = [corpCd, regDt, content.CONTENTS_ID, (content.VENDOR_CD || ''), content.TITLE, content.USE_YN || 'Y'];
            
            db.query(sql, params, (errInsert) => {
                if (errInsert) return res.status(500).json({ success: false, error: errInsert.message });
                processFiles();
            });
        });
    } else {
        db.query("UPDATE TCM_CONTENTS SET CONTENTS_NM = ?, VENDOR_CD = ?, USE_YN = ?, MODIFYDT = NOW(), MODIFYUSER = 'ADMIN' WHERE CORP_CD = ? AND CONTENTS_KEY = ?", [content.TITLE, content.VENDOR_CD || '', content.USE_YN, corpCd, content.CONTENTS_ID], (err) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            processFiles();
        });
    }
});

router.delete('/ad-contents', (req, res) => {
    const { contentIds } = req.body;
    const corpCd = '25001';
    if (!contentIds || !Array.isArray(contentIds) || contentIds.length === 0) return res.status(400).json({ success: false, message: 'contentIds 필요' });
    const placeholders = contentIds.map(() => '?').join(', ');
    
    db.query(`DELETE FROM TCM_CONTENTS_LIST WHERE CORP_CD = ? AND CONTENTS_KEY IN (${placeholders})`, [corpCd, ...contentIds], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        db.query(`DELETE FROM TCM_CONTENTS WHERE CORP_CD = ? AND CONTENTS_KEY IN (${placeholders})`, [corpCd, ...contentIds], (err2) => {
            if (err2) return res.status(500).json({ success: false, error: err2.message });
            res.json({ success: true, message: '삭제되었습니다.' });
        });
    });
});

// 파일업로드 작업 - 웹게시 환경 확정: D:\dayon_file (상설 대기)
// const uploadDir = 'D:\\dayon_file'; 
const uploadDir = 'D:\\PROJECT\\안티그래비티\\대연시스템 - 테스트 파일 경로';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        // multer 1.4.5 utf-8 name bug workaround or standard handling
        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

router.post('/contents-files/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: '파일이 없습니다.' });
    
    try {
        const fileBuffer = fs.readFileSync(req.file.path);
        const hashSum = crypto.createHash('md5');
        hashSum.update(fileBuffer);
        const hex = hashSum.digest('hex').toUpperCase();
    
        res.json({ success: true, message: '업로드 완료', md5: hex, filename: req.file.filename, size: req.file.size });
    } catch (e) {
        console.error('File Upload Error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/contents-files/download', (req, res) => {
    const { filename } = req.query;
    if (!filename) return res.status(400).send('파일명이 필요합니다.');

    // const uploadDir = 'D:\\dayon_file'; 
    const uploadDir = 'D:\\PROJECT\\안티그래비티\\대연시스템 - 테스트 파일 경로';
    const filePath = path.join(uploadDir, filename);

    if (fs.existsSync(filePath)) {
        res.download(filePath, filename);
    } else {
        res.status(404).json({ success: false, message: '파일을 찾을 수 없습니다.' });
    }
});

export default router;
