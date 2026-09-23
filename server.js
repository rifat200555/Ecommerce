require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db/connection');
const authMiddleware = require('./middleware/authMiddleware');

const authRoutes = require('./routes/authRoutes');
const sellerRoutes = require('./routes/sellerRoutes');
const customerRoutes = require('./routes/customerRoutes'); 
const adminRoutes = require('./routes/adminRoutes');

const app = express();

app.use(express.json());                                  // reads JSON bodies -> req.body

const protectedPages = [
  'addresses.html',
  'admin.html',
  'cart.html',
  'checkout.html',
  'customer.html',
  'order-details.html',
  'orders.html',
  'product-details.html',
  'products.html',
  'register_admin.html',
  'role-selection.html',
  'search-history.html',
  'seller.html',
  'seller-orders.html',
  'seller-product-form.html',
  'seller-products.html',
  'seller-product-view.html',
  'wallet.html',
  'wishlist.html'
];

for (const page of protectedPages) {
  app.get(`/${page}`, authMiddleware.page, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', page));
  });
}

app.use(express.static(path.join(__dirname, 'public')));  // serves login.html, seller.html

app.use('/api/auth', authRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/admin', adminRoutes);

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    console.error('Server startup failed: PORT must be a number between 1 and 65535.');
    process.exitCode = 1;
    return;
  }

  try {
    await db.query('SELECT 1');
    console.log('Database connection successful.');
  } catch (err) {
    console.error('Server startup failed: could not connect to MySQL.');
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  const server = app.listen(PORT);

  server.on('listening', () => {
    console.log(`Server running at http://localhost:${PORT}/`);
  });

  server.on('error', async err => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Server startup failed: port ${PORT} is already in use.`);
    } else {
      console.error('Server startup failed:', err);
    }

    await db.end();
    process.exitCode = 1;
  });
}

startServer();
