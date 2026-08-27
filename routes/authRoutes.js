const express = require('express');
const { login , register_customer, register_seller} = require('../controllers/authController');

const router = express.Router();

router.post('/login', login);   // full path: POST /api/auth/login
router.post('/register_customer', register_customer);  // POST /api/auth/register
router.post('/register_seller', register_seller);  // POST /api/auth/register

module.exports = router;