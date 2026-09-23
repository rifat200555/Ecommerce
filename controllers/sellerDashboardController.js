const db = require('../db/connection');

async function countRows(sql, params) {
  const [rows] = await db.query(sql, params);
  return rows[0].total;
}

async function getMe(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT s.UserID, s.StoreName, s.BusinessEmail, s.BusinessPhone,
              s.VerificationStatus, s.JoinedDate,
              u.FullName, u.Email, u.ProfilePicture
       FROM SELLER s
       JOIN \`USER\` u ON u.UserID = s.UserID
       WHERE s.UserID = ?`,
      [req.user.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Seller not found' });
    }
    res.json({ success: true, seller: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function getDashboard(req, res) {
  try {
    const sellerId = req.user.userId;

    const totalProducts = await countRows(
      'SELECT COUNT(*) AS total FROM PRODUCT WHERE SellerID = ?', [sellerId]);

    const activeProducts = await countRows(
      `SELECT COUNT(*) AS total FROM PRODUCT
       WHERE SellerID = ? AND Status = 'Active' AND StockQuantity > 0`, [sellerId]);

    const pendingProducts = await countRows(
      `SELECT COUNT(*) AS total FROM PRODUCT
       WHERE SellerID = ? AND Status = 'Pending'`, [sellerId]);

    const outOfStock = await countRows(
      `SELECT COUNT(*) AS total FROM PRODUCT
       WHERE SellerID = ? AND Status = 'Active' AND StockQuantity = 0`, [sellerId]);

    const pendingOrders = await countRows(
      `SELECT COUNT(DISTINCT o.OrderID) AS total
       FROM \`ORDER\` o
       JOIN ORDER_ITEM oi ON oi.OrderID = o.OrderID
       JOIN PRODUCT p     ON p.ProductID = oi.ProductID
       WHERE p.SellerID = ? AND o.OrderStatus = 'Pending'`, [sellerId]);

    const [salesRows] = await db.query(
      'SELECT fn_seller_delivered_sales(?) AS total', [sellerId]);

    // --- orders still to deliver -------------------------------------
    //
    // GROUP BY squashes several ORDER_ITEM rows of the same order into
    // ONE row, so an order with two products shows up once - which
    // matters here because the buttons act on the whole order.
    //
    // GROUP_CONCAT glues the squashed values into one string:
    //   "iPhone 15 x1, Galaxy Buds x1"
    //
    // Every non-aggregated column has to be listed in GROUP BY, which
    // is why that line is long.
    const [toDeliver] = await db.query(
      `SELECT o.OrderID, o.OrderStatus, o.PaymentStatus, o.OrderDate,
              EXISTS(
                SELECT 1
                FROM ORDER_ITEM oi2
                JOIN PRODUCT p2 ON p2.ProductID = oi2.ProductID
                WHERE oi2.OrderID = o.OrderID AND p2.SellerID <> ?
              ) AS IsMultiSeller,
              GROUP_CONCAT(CONCAT(p.ProductName, ' x', oi.Quantity)
                           SEPARATOR ', ') AS Items,
              SUM(oi.Quantity) AS TotalQty,
              a.ReceiverName, a.PhoneNumber,
              a.StreetAddress, a.City, a.District
       FROM \`ORDER\` o
       JOIN ORDER_ITEM oi  ON oi.OrderID = o.OrderID
       JOIN PRODUCT p      ON p.ProductID = oi.ProductID
       LEFT JOIN ADDRESS a ON a.AddressID = o.AddressID
       WHERE p.SellerID = ?
         AND o.OrderStatus IN ('Pending', 'Processing', 'Shipped')
       GROUP BY o.OrderID, o.OrderStatus, o.PaymentStatus, o.OrderDate,
                a.ReceiverName, a.PhoneNumber,
                a.StreetAddress, a.City, a.District
       ORDER BY o.OrderDate DESC
       LIMIT 5`,
      [sellerId, sellerId]
    );

    const [waitingApproval] = await db.query(
      `SELECT ProductID, ProductName, UnitPrice, StockQuantity, CreatedAt
       FROM PRODUCT
       WHERE SellerID = ? AND Status = 'Pending'
       ORDER BY CreatedAt DESC
       LIMIT 5`,
      [sellerId]
    );

    res.json({
      success: true,
      stats: {
        totalProducts, activeProducts, pendingProducts,
        outOfStock, pendingOrders, totalSales: salesRows[0].total
      },
      toDeliver,
      waitingApproval
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { getMe, getDashboard };
