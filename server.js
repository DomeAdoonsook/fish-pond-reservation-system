require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

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
const lineRoutes = require('./routes/line');

app.use('/api', apiRoutes);
app.use('/admin', adminRoutes);
app.use('/webhook', lineRoutes);

// หน้าแรก - redirect ไป dashboard
app.get('/', (req, res) => {
  res.redirect('/admin');
});

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

// Start server
app.listen(PORT, () => {
  console.log(`🐟 Fish Pond Reservation System running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/admin`);
  console.log(`🔗 LINE Webhook: http://localhost:${PORT}/webhook`);
});
