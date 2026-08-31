const db = require('../db/connection');

async function getWishlist(req, res) {
  try {
    const customerId = req.user.userId;
    const [products] = await db.query(
      `SELECT p.ProductID, p.ProductName, p.UnitPrice, p.Discount,
              p.AverageRating, p.StockQuantity, p.Status,
              wi.SavedAt,
              (SELECT pi.ImageURL
               FROM PRODUCT_IMAGE pi
               WHERE pi.ProductID = p.ProductID
               ORDER BY pi.IsPrimary DESC, pi.DisplayOrder ASC, pi.ImageNumber ASC
               LIMIT 1) AS ImageURL
       FROM WISHLIST_ITEM wi
       JOIN PRODUCT p ON p.ProductID = wi.ProductID
       WHERE wi.CustomerID = ?
       ORDER BY wi.SavedAt DESC`,
      [customerId]
    );

    res.json({ success: true, products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function updateWishlist(req, res) {
  try {
    const customerId = req.user.userId;
    const productId = Number(req.params.productId);
    const { wished } = req.body;

    if (!Number.isInteger(productId) || productId <= 0 || typeof wished !== 'boolean') {
      return res.status(400).json({ message: 'Invalid wishlist request' });
    }

    if (wished) {
      const [products] = await db.query(
        `SELECT ProductID FROM PRODUCT
         WHERE ProductID = ? AND Status = 'Active'`,
        [productId]
      );
      if (products.length === 0) {
        return res.status(404).json({ message: 'Product is not available' });
      }

      await db.query(
        `INSERT IGNORE INTO WISHLIST_ITEM (CustomerID, ProductID)
         VALUES (?, ?)`,
        [customerId, productId]
      );
      return res.json({ success: true, wished: true, message: 'Added to wishlist.' });
    }

    await db.query(
      'DELETE FROM WISHLIST_ITEM WHERE CustomerID = ? AND ProductID = ?',
      [customerId, productId]
    );
    res.json({ success: true, wished: false, message: 'Removed from wishlist.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { getWishlist, updateWishlist };
