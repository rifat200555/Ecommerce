const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const customerMiddleware = require('../middleware/customerMiddleware');
const { getMe } = require('../controllers/customerController');

const router = express.Router();

router.get('/me', authMiddleware, customerMiddleware, getMe);

module.exports = router;