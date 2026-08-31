const db = require('../db/connection');

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

function filesToPaths(req) {
  if (!req.files) return [];
  return req.files.map(f => '/uploads/products/' + f.filename);
}

function toArray(value) {
  if (value === undefined || value === null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

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
  const price = Number(unitPrice);
  const productDiscount = discount === undefined || discount === '' ? 0 : Number(discount);
  const stock = stockQuantity === undefined || stockQuantity === '' ? 0 : Number(stockQuantity);

  if (!Number.isFinite(price) || price < 0) {
    return res.status(400).json({ message: 'Price must be a non-negative number' });
  }
  if (!Number.isFinite(productDiscount) || productDiscount < 0 || productDiscount > 100) {
    return res.status(400).json({ message: 'Discount must be between 0 and 100' });
  }
  if (!Number.isInteger(stock) || stock < 0) {
    return res.status(400).json({ message: 'Stock must be a non-negative whole number' });
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
       price, productDiscount, stock,
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

module.exports = { getProducts, getProductById, getMeta, createProduct, updateProduct, deleteProduct, updateProductMode };
