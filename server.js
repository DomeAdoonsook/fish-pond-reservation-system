require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// LINE Webhook route - ต้องอยู่ก่อน express.json() เพื่อให้รับ raw body ได้
const lineRoutes = require('./routes/line');
app.use('/webhook', lineRoutes);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'fish-pond-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // ตั้งเป็น true เมื่อใช้ HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 ชั่วโมง
  }
}));

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const publicRoutes = require('./routes/public');
const equipmentRoutes = require('./routes/equipment');
const equipmentPublicRoutes = require('./routes/equipment-public');
const stockRoutes = require('./routes/stock');
const adminStockRoutes = require('./routes/admin-stock');

app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);
app.use('/admin/equipment', equipmentRoutes);
app.use('/admin/stock', adminStockRoutes);
app.use('/equipment', equipmentPublicRoutes);
app.use('/stock', stockRoutes);
// LINE webhook ถูกตั้งค่าไว้ด้านบนแล้ว (ก่อน express.json)
app.use('/', publicRoutes);

// Cron Job - ตรวจสอบการจองที่หมดอายุ ทุกวันเที่ยงคืน
const { checkExpiredReservations } = require('./utils/scheduler');
cron.schedule('0 0 * * *', () => {
  console.log('🕐 Running daily reservation check...');
  checkExpiredReservations();
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database (create tables if not exist)
    const { initDatabase } = require('./config/database');
    await initDatabase();
    console.log('✅ Database initialized');

    // Start server
    app.listen(PORT, () => {
      console.log(`🐟 Fish Pond Reservation System running on port ${PORT}`);
      console.log(`📊 Dashboard: http://localhost:${PORT}/admin`);
      console.log(`🔗 LINE Webhook: http://localhost:${PORT}/webhook`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
