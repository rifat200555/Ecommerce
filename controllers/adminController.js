// =====================================================================
//  controllers/adminController.js
//
//  The admin's job in this milestone is small: look at products that
//  sellers submitted, and approve or reject them.
// =====================================================================

const db = require('../db/connection');

// ---------------------------------------------------------------------
//  GET /api/admin/me
// ---------------------------------------------------------------------
async function getMe(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT u.UserID, u.FullName, u.Email,
              a.AccessLevel, a.LastActionTime
       FROM ADMIN a
       JOIN \`USER\` u ON u.UserID = a.UserID
       WHERE a.UserID = ?`,
      [req.user.userId]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Admin not found' });
    res.json({ success: true, admin: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

// ---------------------------------------------------------------------
//  GET /api/admin/products?status=pending
//
//  Note what is NOT here: no "AND SellerID = ?". The seller queries all
//  carry that filter so a seller only sees their own things. The admin
//  is the one role that sees everything, so the filter is absent on
//  purpose - not by accident.
// ---------------------------------------------------------------------
async function getProducts(req, res) {
  try {
    const status = req.query.status || 'Pending';

    let where = '';
    const params = [];
    if (status !== 'all') {
      where = 'WHERE p.Status = ?';
      params.push(status);
    }

    const [rows] = await db.query(
      `SELECT p.ProductID, p.ProductName, p.UnitPrice, p.Discount,
              p.StockQuantity, p.Status, p.CreatedAt,
              s.StoreName, s.UserID AS SellerID,
              c.CategoryName, b.BrandName
       FROM PRODUCT p
       JOIN SELLER s        ON s.UserID = p.SellerID
       LEFT JOIN CATEGORY c ON c.CategoryID = p.CategoryID
       LEFT JOIN BRAND b    ON b.BrandID = p.BrandID
       ${where}
       ORDER BY p.CreatedAt DESC`,
      params
    );

    // the counts that sit on the tab buttons
    const [counts] = await db.query(
      `SELECT Status, COUNT(*) AS total FROM PRODUCT GROUP BY Status`);

    res.json({ success: true, status, products: rows, counts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

// ---------------------------------------------------------------------
//  PATCH /api/admin/products/:id/status
//  Approve  -> 'Active'
//  Reject   -> 'Rejected'
// ---------------------------------------------------------------------
async function updateProductStatus(req, res) {
  try {
    const productId = req.params.id;
    const { newStatus } = req.body;

    // Only these three are things an admin may set. Anything else is
    // refused, so a hand-crafted request cannot invent a status.
    const allowed = ['Active', 'Rejected', 'Pending'];
    if (!allowed.includes(newStatus)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const [result] = await db.query(
      'UPDATE PRODUCT SET Status = ? WHERE ProductID = ?',
      [newStatus, productId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json({ success: true, message: `Product #${productId} set to ${newStatus}.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { getMe, getProducts, updateProductStatus };