// =====================================================================
//  controllers/sellerController.js
//
//  Everything the seller panel asks the server to do.
//  Every function here already knows WHO is asking, because
//  authMiddleware put the id in req.user.userId before we ran.
// =====================================================================

const db = require('../db/connection');

// Runs a COUNT query and hands back just the number.
async function countRows(sql, params) {
  const [rows] = await db.query(sql, params);
  return rows[0].total;
}

// The legal moves for an order. Read it as:
//   "if the order is Pending, the only things it can become are
//    Processing or Cancelled".
// Delivered and Cancelled have empty lists, so they are frozen forever.
const NEXT_STATUS = {
  Pending:    ['Processing', 'Cancelled'],
  Processing: ['Shipped', 'Cancelled'],
  Shipped:    ['Delivered', 'Cancelled'],
  Delivered:  [],
  Cancelled:  []
};

// ---------------------------------------------------------------------
//  GET /api/seller/me
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
//  GET /api/seller/dashboard
// ---------------------------------------------------------------------
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
      `SELECT COALESCE(SUM(oi.SubTotal), 0) AS total
       FROM ORDER_ITEM oi
       JOIN PRODUCT p    ON p.ProductID = oi.ProductID
       JOIN \`ORDER\` o  ON o.OrderID = oi.OrderID
       WHERE p.SellerID = ? AND o.OrderStatus = 'Delivered'`, [sellerId]);

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
      [sellerId]
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

// ---------------------------------------------------------------------
//  GET /api/seller/products?tab=active
//  The list only carries what the table shows. Everything else waits
//  until the seller opens View.
// ---------------------------------------------------------------------
async function getProducts(req, res) {
  try {
    const sellerId = req.user.userId;
    const tab = req.query.tab || 'all';

    let where = 'WHERE SellerID = ?';
    if (tab === 'active')          where += " AND Status = 'Active' AND StockQuantity > 0";
    else if (tab === 'pending')    where += " AND Status = 'Pending'";
    else if (tab === 'inactive')   where += " AND Status = 'Inactive'";
    else if (tab === 'outofstock') where += " AND Status = 'Active' AND StockQuantity = 0";

    const [rows] = await db.query(
      `SELECT ProductID, ProductName, StockQuantity, Status, CreatedAt
       FROM PRODUCT
       ${where}
       ORDER BY CreatedAt DESC`,
      [sellerId]
    );

    res.json({ success: true, tab, products: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

// ---------------------------------------------------------------------
//  GET /api/seller/products/:id
//  One product, everything about it, plus its images and reviews.
//  Used by BOTH the view page and the edit form.
// ---------------------------------------------------------------------
async function getProductById(req, res) {
  try {
    const sellerId = req.user.userId;
    const productId = req.params.id;

    const [rows] = await db.query(
      `SELECT p.*, c.CategoryName, b.BrandName
       FROM PRODUCT p
       LEFT JOIN CATEGORY c ON c.CategoryID = p.CategoryID
       LEFT JOIN BRAND b    ON b.BrandID    = p.BrandID
       WHERE p.ProductID = ? AND p.SellerID = ?`,
      [productId, sellerId]
    );

    // "AND p.SellerID = ?" is the important half of that query.
    // Without it, typing someone else's product id in the URL would
    // show you their product.
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // IsPrimary DESC puts the main photo first, so the carousel opens
    // on the right one.
    const [images] = await db.query(
      `SELECT ImageNumber, ImageURL, Caption, IsPrimary
       FROM PRODUCT_IMAGE
       WHERE ProductID = ?
       ORDER BY IsPrimary DESC, DisplayOrder ASC, ImageNumber ASC`,
      [productId]
    );

    const [reviews] = await db.query(
      `SELECT r.Rating, r.ReviewText, r.ReviewDate, r.HelpfulVotes,
              u.FullName
       FROM REVIEW r
       JOIN \`USER\` u ON u.UserID = r.CustomerID
       WHERE r.ProductID = ?
       ORDER BY r.ReviewDate DESC`,
      [productId]
    );

    res.json({ success: true, product: rows[0], images, reviews });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

// ---------------------------------------------------------------------
//  GET /api/seller/meta
//  Categories and brands, for the dropdowns on the add/edit form.
// ---------------------------------------------------------------------
async function getMeta(req, res) {
  try {
    const [categories] = await db.query(
      'SELECT CategoryID, CategoryName FROM CATEGORY ORDER BY CategoryName');
    const [brands] = await db.query(
      'SELECT BrandID, BrandName FROM BRAND ORDER BY BrandName');
    res.json({ success: true, categories, brands });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

// ---------------------------------------------------------------------
//  TWO SMALL HELPERS FOR IMAGE UPLOADS
// ---------------------------------------------------------------------

// Multer has already saved the files to disk by the time we run.
// req.files is an array; each item has .filename, the name multer
// invented. All we do is turn that into the PATH we store.
//
// Remember: the FILE lives on disk, the DATABASE only ever holds this
// short string. That split does not change just because uploading works.
function filesToPaths(req) {
  if (!req.files) return [];
  return req.files.map(f => '/uploads/products/' + f.filename);
}

// A form field sent once arrives as a string; sent twice it arrives as
// an array. This flattens both cases into an array so the rest of the
// code does not have to care.
function toArray(value) {
  if (value === undefined || value === null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

// Writes the PRODUCT_IMAGE rows. The first path in the list becomes
// the primary image, which is the one the carousel opens on.
async function writeImages(conn, productId, paths) {
  let n = 1;
  for (const p of paths) {
    if (!p || !String(p).trim()) continue;
    await conn.query(
      `INSERT INTO PRODUCT_IMAGE
         (ProductID, ImageNumber, ImageURL, IsPrimary, DisplayOrder)
       VALUES (?, ?, ?, ?, ?)`,
      [productId, n, String(p).trim(), n === 1 ? 1 : 0, n]
    );
    n++;
  }
}

// ---------------------------------------------------------------------
//  POST /api/seller/products      (add a new product)
//
//  A brand new product is always born 'Pending'. The seller cannot
//  choose to be Active - only the admin grants that.
//
//  NOTE: this request arrives as multipart/form-data, not JSON, so
//  every text field in req.body is a STRING. "20" not 20. MySQL
//  converts them happily through the ? placeholders, so nothing breaks,
//  but it is worth knowing when you console.log req.body.
// ---------------------------------------------------------------------
async function createProduct(req, res) {
  const sellerId = req.user.userId;
  const {
    productName, description, unitPrice, discount, stockQuantity,
    categoryId, brandId, warranty, weight
  } = req.body;

  if (!productName || unitPrice === undefined || unitPrice === '') {
    return res.status(400).json({ message: 'Product name and price are required' });
  }
  if (Number(unitPrice) < 0 || Number(stockQuantity) < 0) {
    return res.status(400).json({ message: 'Price and stock cannot be negative' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO PRODUCT
         (SellerID, CategoryID, BrandID, ProductName, Description,
          UnitPrice, Discount, StockQuantity, Status, Warranty, Weight)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)`,
      [sellerId, categoryId || null, brandId || null, productName,
       description || null, unitPrice, discount || 0, stockQuantity || 0,
       warranty || null, weight || null]
    );

    const productId = result.insertId;

    await writeImages(conn, productId, filesToPaths(req));

    await conn.commit();
    res.status(201).json({ success: true, productId, message: 'Product added, waiting for admin approval.' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------
//  PUT /api/seller/products/:id   (edit an existing product)
//
//  Status is deliberately NOT touched here. Editing an approved
//  product does not send it back for approval - that was your rule.
// ---------------------------------------------------------------------
async function updateProduct(req, res) {
  const sellerId = req.user.userId;
  const productId = req.params.id;
  const {
    productName, description, unitPrice, discount, stockQuantity,
    categoryId, brandId, warranty, weight
  } = req.body;

  if (!productName || unitPrice === undefined || unitPrice === '') {
    return res.status(400).json({ message: 'Product name and price are required' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `UPDATE PRODUCT SET
         CategoryID = ?, BrandID = ?, ProductName = ?, Description = ?,
         UnitPrice = ?, Discount = ?, StockQuantity = ?,
         Warranty = ?, Weight = ?
       WHERE ProductID = ? AND SellerID = ?`,
      [categoryId || null, brandId || null, productName, description || null,
       unitPrice, discount || 0, stockQuantity || 0,
       warranty || null, weight || null, productId, sellerId]
    );

    // affectedRows is 0 when the WHERE matched nothing, i.e. the id
    // does not exist OR belongs to a different seller.
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Product not found' });
    }

    // ---- images -------------------------------------------------
    // The page sends back keepImages: the paths of the existing photos
    // the seller did NOT remove. Anything missing from that list was
    // removed on screen. Add the freshly uploaded files on the end.
    //
    // Then throw all the old rows away and write the combined list.
    // Working out which individual rows changed would be far more code
    // for no benefit, and this way the order is always exactly what
    // the seller saw on the form.
    const keptPaths = toArray(req.body.keepImages);
    const newPaths = filesToPaths(req);
    const allPaths = keptPaths.concat(newPaths);

    await conn.query('DELETE FROM PRODUCT_IMAGE WHERE ProductID = ?', [productId]);
    await writeImages(conn, productId, allPaths);
    // Note: the removed files stay on disk. Deleting them would be a
    // handful of fs.unlink calls, but a stray file costs nothing and
    // deleting the wrong one is a real risk. Left alone on purpose.

    await conn.commit();
    res.json({ success: true, message: 'Product updated.' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------
//  DELETE /api/seller/products/:id
//
//  A product that was never ordered can be deleted outright. One that
//  HAS been ordered cannot, because ORDER_ITEM points at it and the
//  foreign key refuses - deleting it would destroy an invoice.
//  We catch that specific error and explain it instead of crashing.
// ---------------------------------------------------------------------
async function deleteProduct(req, res) {
  const sellerId = req.user.userId;
  const productId = req.params.id;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [own] = await conn.query(
      'SELECT ProductID FROM PRODUCT WHERE ProductID = ? AND SellerID = ?',
      [productId, sellerId]
    );
    if (own.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Product not found' });
    }

    // These three tables point at PRODUCT too, but losing their rows
    // costs nobody anything, so clear them first.
    await conn.query('DELETE FROM PRODUCT_IMAGE WHERE ProductID = ?', [productId]);
    await conn.query('DELETE FROM CART_ITEM     WHERE ProductID = ?', [productId]);
    await conn.query('DELETE FROM WISHLIST_ITEM WHERE ProductID = ?', [productId]);
    await conn.query('DELETE FROM REVIEW        WHERE ProductID = ?', [productId]);

    await conn.query('DELETE FROM PRODUCT WHERE ProductID = ? AND SellerID = ?',
      [productId, sellerId]);

    await conn.commit();
    res.json({ success: true, message: 'Product deleted.' });
  } catch (err) {
    await conn.rollback();

    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({
        message: 'This product appears in past orders and cannot be deleted. Set it Inactive instead.'
      });
    }
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------
//  PATCH /api/seller/products/:id/mode
//  Active <-> Inactive. Switching ON needs a new stock number,
//  exactly as you specified.
// ---------------------------------------------------------------------
async function updateProductMode(req, res) {
  try {
    const sellerId = req.user.userId;
    const productId = req.params.id;
    const { mode, stockQuantity } = req.body;

    const [rows] = await db.query(
      'SELECT Status FROM PRODUCT WHERE ProductID = ? AND SellerID = ?',
      [productId, sellerId]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Product not found' });

    if (rows[0].Status === 'Pending') {
      return res.status(409).json({ message: 'Wait for admin approval first.' });
    }

    if (mode === 'off') {
      await db.query(
        "UPDATE PRODUCT SET Status = 'Inactive' WHERE ProductID = ?", [productId]);
      return res.json({ success: true, message: 'Product switched off.' });
    }

    if (mode === 'on') {
      if (stockQuantity === undefined || Number(stockQuantity) < 0) {
        return res.status(400).json({ message: 'A new stock quantity is required' });
      }
      await db.query(
        "UPDATE PRODUCT SET Status = 'Active', StockQuantity = ? WHERE ProductID = ?",
        [stockQuantity, productId]);
      return res.json({ success: true, message: 'Product is live again.' });
    }

    res.status(400).json({ message: 'mode must be "on" or "off"' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

// ---------------------------------------------------------------------
//  GET /api/seller/orders?status=pending
// ---------------------------------------------------------------------
async function getOrders(req, res) {
  try {
    const sellerId = req.user.userId;
    const status = req.query.status || 'all';

    let where = 'WHERE p.SellerID = ?';
    if (status === 'pending')         where += " AND o.OrderStatus = 'Pending'";
    else if (status === 'processing') where += " AND o.OrderStatus = 'Processing'";
    else if (status === 'shipped')    where += " AND o.OrderStatus = 'Shipped'";
    else if (status === 'delivered')  where += " AND o.OrderStatus = 'Delivered'";
    else if (status === 'cancelled')  where += " AND o.OrderStatus = 'Cancelled'";
    else if (status === 'todeliver')  where += " AND o.OrderStatus IN ('Pending','Processing','Shipped')";

    const [rows] = await db.query(
      `SELECT o.OrderID, o.OrderDate, o.OrderStatus, o.PaymentStatus,
              p.ProductName, oi.Quantity, oi.UnitPrice, oi.SubTotal,
              u.FullName AS CustomerName
       FROM \`ORDER\` o
       JOIN ORDER_ITEM oi ON oi.OrderID = o.OrderID
       JOIN PRODUCT p     ON p.ProductID = oi.ProductID
       JOIN \`USER\` u    ON u.UserID = o.CustomerID
       ${where}
       ORDER BY o.OrderDate DESC`,
      [sellerId]
    );

    res.json({ success: true, status, orders: rows, nextStatus: NEXT_STATUS });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

// ---------------------------------------------------------------------
//  PATCH /api/seller/orders/:orderId/status
//
//  The single most careful function in the file, because it moves money.
// ---------------------------------------------------------------------
async function updateOrderStatus(req, res) {
  const sellerId = req.user.userId;
  const orderId = req.params.orderId;
  const { newStatus } = req.body;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Does this order contain a product belonging to THIS seller?
    //    Without this check any seller could move anyone's orders.
    const [owns] = await conn.query(
      `SELECT COUNT(*) AS total
       FROM ORDER_ITEM oi
       JOIN PRODUCT p ON p.ProductID = oi.ProductID
       WHERE oi.OrderID = ? AND p.SellerID = ?`,
      [orderId, sellerId]
    );
    if (owns[0].total === 0) {
      await conn.rollback();
      return res.status(403).json({ message: 'This order is not yours' });
    }

    // 2. What state is it in right now?
    const [orders] = await conn.query(
      'SELECT OrderStatus, PaymentStatus, CustomerID, TotalAmount FROM `ORDER` WHERE OrderID = ?',
      [orderId]
    );
    if (orders.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Order not found' });
    }
    const order = orders[0];

    // 3. Is the requested move legal?
    //    The frontend hides illegal buttons, but the frontend can be
    //    edited by anyone. This is the check that actually counts.
    const allowed = NEXT_STATUS[order.OrderStatus] || [];
    if (!allowed.includes(newStatus)) {
      await conn.rollback();
      return res.status(409).json({
        message: `An order that is ${order.OrderStatus} cannot become ${newStatus}.`
      });
    }

    // 4. Make the move.
    await conn.query('UPDATE `ORDER` SET OrderStatus = ? WHERE OrderID = ?',
      [newStatus, orderId]);

    // 5. Cancelling a PAID order refunds the customer.
    //    Three writes that must all happen or none:
    //      - order marked Refunded
    //      - money added back to the wallet
    //      - a TRANSACTION row so there is a trace
    //    This is exactly why the whole function runs in a transaction.
    if (newStatus === 'Cancelled' && order.PaymentStatus === 'Paid') {
      await conn.query(
        "UPDATE `ORDER` SET PaymentStatus = 'Refunded' WHERE OrderID = ?", [orderId]);

      const [wallets] = await conn.query(
        'SELECT WalletID FROM WALLET WHERE CustomerID = ?', [order.CustomerID]);

      if (wallets.length > 0) {
        const walletId = wallets[0].WalletID;

        await conn.query(
          `UPDATE WALLET
           SET CurrentBalance = CurrentBalance + ?, LastUpdated = NOW()
           WHERE WalletID = ?`,
          [order.TotalAmount, walletId]
        );

        await conn.query(
          `INSERT INTO TRANSACTION
             (WalletID, OrderID, TransactionType, Amount, Status)
           VALUES (?, ?, 'Refund', ?, 'Success')`,
          [walletId, orderId, order.TotalAmount]
        );
      }
    }

    await conn.commit();
    res.json({ success: true, message: `Order #${orderId} is now ${newStatus}.` });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
}

module.exports = {
  getMe, getDashboard,
  getProducts, getProductById, getMeta,
  createProduct, updateProduct, deleteProduct, updateProductMode,
  getOrders, updateOrderStatus
};