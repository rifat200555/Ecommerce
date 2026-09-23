// =====================================================================
//  routes/adminRoutes.js
// =====================================================================

const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const c = require('../controllers/adminController');

const router = express.Router();

router.use(authMiddleware, adminMiddleware);

router.get('/me',       c.getMe);
router.post('/register', c.registerAdmin);
router.get('/dashboard', c.getDashboard);
router.get('/users', c.getUsers);
router.get('/customers', c.getCustomers);
router.post('/customers/:customerId/reward-points', c.addRewardPoints);
router.get('/sellers', c.getSellers);
router.patch('/sellers/:sellerId/status', c.updateSellerStatus);
router.get('/products', c.getProducts);
router.patch('/products/:id/status', c.updateProductStatus);
router.get('/orders', c.getOrders);
router.get('/reports/sales', c.getSalesReport);

module.exports = router;
