const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const {
  login, register_customer, register_seller, getMyRoles, selectRole, logout
} = require('../controllers/authController');

const router = express.Router();

router.post('/login', login);   // full path: POST /api/auth/login
router.post('/register_customer', register_customer);  // POST /api/auth/register
router.post('/register_seller', register_seller);  // POST /api/auth/register
router.post('/logout', logout);
router.get('/roles', authMiddleware, getMyRoles);
router.post('/select-role', authMiddleware, selectRole);

module.exports = router;
