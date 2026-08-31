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
router.get('/customers', c.getCustomers);
router.post('/customers/:customerId/reward-points', c.addRewardPoints);
router.get('/products', c.getProducts);
router.patch('/products/:id/status', c.updateProductStatus);

module.exports = router;
