const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const customerMiddleware = require('../middleware/customerMiddleware');
const c = require('../controllers/customerController');

const router = express.Router();

router.get('/public/products', c.getProducts);
router.get('/me', authMiddleware, customerMiddleware, c.getMe);
router.get('/products', authMiddleware, customerMiddleware, c.getProducts);
router.get('/products/:productId', authMiddleware, customerMiddleware, c.getProductById);
router.post('/products/:productId/reviews', authMiddleware, customerMiddleware, c.createReview);
router.get('/search-history', authMiddleware, customerMiddleware, c.getSearchHistory);
router.delete('/search-history', authMiddleware, customerMiddleware, c.clearSearchHistory);
router.delete('/search-history/:searchId', authMiddleware, customerMiddleware, c.deleteSearchHistory);
router.get('/cart', authMiddleware, customerMiddleware, c.getCart);
router.post('/cart', authMiddleware, customerMiddleware, c.addToCart);
router.patch('/cart/:productId', authMiddleware, customerMiddleware, c.updateCartItem);
router.delete('/cart/:productId', authMiddleware, customerMiddleware, c.removeCartItem);
router.get('/wishlist', authMiddleware, customerMiddleware, c.getWishlist);
router.patch('/wishlist/:productId', authMiddleware, customerMiddleware, c.updateWishlist);
router.get('/addresses', authMiddleware, customerMiddleware, c.getAddresses);
router.post('/addresses', authMiddleware, customerMiddleware, c.createAddress);
router.put('/addresses/:addressId', authMiddleware, customerMiddleware, c.updateAddress);
router.delete('/addresses/:addressId', authMiddleware, customerMiddleware, c.deleteAddress);
router.patch('/addresses/:addressId/default', authMiddleware, customerMiddleware, c.setDefaultAddress);
router.get('/wallet', authMiddleware, customerMiddleware, c.getWallet);
router.get('/orders', authMiddleware, customerMiddleware, c.getOrders);
router.get('/orders/:orderId', authMiddleware, customerMiddleware, c.getOrderDetails);
router.get('/checkout/options', authMiddleware, customerMiddleware, c.getCheckoutOptions);
router.post('/checkout', authMiddleware, customerMiddleware, c.placeOrder);
router.patch('/reviews/:reviewId/helpful', authMiddleware, customerMiddleware, c.markReviewHelpful);

module.exports = router;
