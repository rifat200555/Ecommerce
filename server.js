require('dotenv').config();
const express = require('express');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const sellerRoutes = require('./routes/sellerRoutes');
const customerRoutes = require('./routes/customerRoutes'); 
const adminRoutes = require('./routes/adminRoutes');

const app = express();

app.use(express.json());                                  // reads JSON bodies -> req.body
app.use(express.static(path.join(__dirname, 'public')));  // serves login.html, seller.html

app.use('/api/auth', authRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/admin', adminRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/login.html`);
});