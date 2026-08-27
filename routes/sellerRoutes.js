// =====================================================================
//  routes/sellerRoutes.js
//
//  Every route here passes through the same two gates first:
//    authMiddleware   - is the token real?      -> req.user.userId
//    sellerMiddleware - is this user a seller?
//
//  The two product-saving routes get a THIRD middleware,
//  uploadProductImages, which reads the uploaded files off the request
//  and fills req.files before the controller runs.
// =====================================================================

const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const sellerMiddleware = require('../middleware/sellerMiddleware');
const uploadProductImages = require('../middleware/uploadMiddleware');
const c = require('../controllers/sellerController');

const router = express.Router();

// Applies the two gates to EVERY route in this file, so we do not
// repeat them on all eleven lines.
router.use(authMiddleware, sellerMiddleware);

router.get('/me',        c.getMe);
router.get('/dashboard', c.getDashboard);
router.get('/meta',      c.getMeta);

// ORDER MATTERS: '/products/:id' would also match '/products/meta',
// so any fixed path must be written above the :id one.
router.get('/products',        c.getProducts);
router.get('/products/:id',    c.getProductById);
router.delete('/products/:id', c.deleteProduct);
router.patch('/products/:id/mode', c.updateProductMode);

// The upload middleware sits between the gates and the controller.
// By the time createProduct runs, the files are already on disk and
// described in req.files. The controller never touches multer itself.
router.post('/products',    uploadProductImages, c.createProduct);
router.put('/products/:id', uploadProductImages, c.updateProduct);

router.get('/orders', c.getOrders);
router.patch('/orders/:orderId/status', c.updateOrderStatus);

module.exports = router;