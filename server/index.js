import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

// Trigger Vite reload on backend restart
try {
    const refreshPath = path.join(process.cwd(), 'src', 'refresh-trigger.ts');
    fs.writeFileSync(refreshPath, `export const lastRestart = "${new Date().toISOString()}";`);
} catch (e) {
    console.error('Failed to update refresh-trigger.ts', e.message);
}

// Import view-based routers
import authRouter from './views/Auth.js';
import userMgmtRouter from './views/UserManagementContent.js';
import userPermRouter from './views/UserPermissionManagementContent.js';
import deviceMgmtRouter from './views/DeviceManagementContent.js';
import boardMgmtRouter from './views/BoardManagementContent.js';
import basicCodeRouter from './views/BasicCodeManagementContent.js';
import vendorMgmtRouter from './views/VendorManagementContent.js';
import adContentsRouter from './views/AdContentsContent.js';
import adScheduleRouter from './views/AdScheduleContent.js';
import storeStatusRouter from './views/StoreStatusContent.js';
import adPlayLogRouter from './views/AdPlayLogContent.js';
import contentAggRouter from './views/ContentAggContent.js';
import bleLogAggRouter from './views/BleLogAggContent.js';
import realTimeStatusRouter from './views/RealTimeStatusContent.js';
import cctvMgmtRouter from './views/CCTVManagementContent.js';

const app = express();
const PORT = process.env.PORT || 9100;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Request Logging Middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Register View-based Routers
app.use('/api', authRouter);
app.use('/api', userMgmtRouter);
app.use('/api', userPermRouter);
app.use('/api', deviceMgmtRouter);
app.use('/api', boardMgmtRouter);
app.use('/api', basicCodeRouter);
app.use('/api', vendorMgmtRouter);
app.use('/api', adContentsRouter);
app.use('/api', adScheduleRouter);
app.use('/api', storeStatusRouter);
app.use('/api', adPlayLogRouter);
app.use('/api', contentAggRouter);
app.use('/api', bleLogAggRouter);
app.use('/api', realTimeStatusRouter);
app.use('/api', cctvMgmtRouter);

// Root route for health check
app.get('/', (req, res) => {
    res.json({ success: true, message: 'Dayonsystem API Server is running.' });
});

app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`  Dayonsystem API Server - MVC Refactored `);
    console.log(`  Port: ${PORT}`);
    console.log(`  Status: Running`);
    console.log(`========================================`);
});
