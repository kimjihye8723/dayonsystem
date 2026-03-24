import db from './server/config/db.js';

db.query('DESCRIBE TCM_VENDOR_DEVICE', (e, r1) => {
    if (!e) console.log('TCM_VENDOR_DEVICE:', r1.map(c => c.Field));
    db.query('DESCRIBE TCM_CCTV', (e, r2) => {
        if (!e) console.log('TCM_CCTV:', r2.map(c => c.Field));
        process.exit(0);
    });
});
