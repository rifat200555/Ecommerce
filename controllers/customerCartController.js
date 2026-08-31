const db = require('../db/connection');

async function getCart(req, res) {
  try {
    const customerId = req.user.userId;
    const [items] = await db.query(
      `SELECT ci.ProductID, ci.Quantity,
              p.ProductName, p.UnitPrice, p.Discount,
              p.StockQuantity, p.Status,
              (SELECT pi.ImageURL
               FROM PRODUCT_IMAGE pi
               WHERE pi.ProductID = p.ProductID
               ORDER BY pi.IsPrimary DESC, pi.DisplayOrder ASC, pi.ImageNumber ASC
               LIMIT 1) AS ImageURL
       FROM CART_ITEM ci
       JOIN PRODUCT p ON p.ProductID = ci.ProductID
       WHERE ci.CustomerID = ?
       ORDER BY ci.AddedAt DESC`,
      [customerId]
    );

    let subtotal = 0;
    let discount = 0;
    let total = 0;
    let hasUnavailable = false;

    for (const item of items) {
      const available = item.Status === 'Active' &&
        Number(item.StockQuantity) > 0 &&
        Number(item.Quantity) <= Number(item.StockQuantity);
      const original = Number(item.UnitPrice) * Number(item.Quantity);
      const saved = original * (Number(item.Discount) / 100);

      item.IsAvailable = available ? 1 : 0;
      item.LineSubtotal = Number((original - saved).toFixed(2));

      if (available) {
        subtotal += original;
        discount += saved;
        total += original - saved;
      } else {
        hasUnavailable = true;
      }
    }

    res.json({
      success: true,
      items,
      summary: {
        subtotal: Number(subtotal.toFixed(2)),
        discount: Number(discount.toFixed(2)),
        total: Number(total.toFixed(2)),
        hasUnavailable
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function addToCart(req, res) {
  const customerId = req.user.userId;
  const productId = Number(req.body.productId);
  const quantity = req.body.quantity === undefined ? 1 : Number(req.body.quantity);

  if (!Number.isInteger(productId) || productId <= 0 ||
      !Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ message: 'Invalid product or quantity' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [products] = await conn.query(
      `SELECT StockQuantity FROM PRODUCT
       WHERE ProductID = ? AND Status = 'Active'
       FOR UPDATE`,
      [productId]
    );

    if (products.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Product is not available' });
    }
    if (products[0].StockQuantity === 0) {
      await conn.rollback();
      return res.status(409).json({ message: 'Product is out of stock' });
    }

    const [items] = await conn.query(
      `SELECT Quantity FROM CART_ITEM
       WHERE CustomerID = ? AND ProductID = ?
       FOR UPDATE`,
      [customerId, productId]
    );

    const currentQuantity = items.length > 0 ? Number(items[0].Quantity) : 0;
    const requestedQuantity = currentQuantity + quantity;
    const availableStock = Number(products[0].StockQuantity);
    if (requestedQuantity > availableStock) {
      await conn.rollback();
      return res.status(409).json({
        message: `Requested quantity is ${requestedQuantity}, but only ${availableStock} is available`
      });
    }

    if (items.length > 0) {
      await conn.query(
        `UPDATE CART_ITEM SET Quantity = Quantity + ?
         WHERE CustomerID = ? AND ProductID = ?`,
        [quantity, customerId, productId]
      );
    } else {
      await conn.query(
        `INSERT INTO CART_ITEM (CustomerID, ProductID, Quantity)
         VALUES (?, ?, ?)`,
        [customerId, productId, quantity]
      );
    }

    await conn.commit();
    res.json({ success: true, message: 'Product added to cart.' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
}

async function updateCartItem(req, res) {
  const customerId = req.user.userId;
  const productId = Number(req.params.productId);
  const quantity = Number(req.body.quantity);

  if (!Number.isInteger(productId) || productId <= 0 ||
      !Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ message: 'Quantity must be a positive whole number' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [items] = await conn.query(
      `SELECT Quantity FROM CART_ITEM
       WHERE CustomerID = ? AND ProductID = ?
       FOR UPDATE`,
      [customerId, productId]
    );
    if (items.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Cart item not found' });
    }

    const [products] = await conn.query(
      `SELECT Status, StockQuantity FROM PRODUCT
       WHERE ProductID = ?
       FOR UPDATE`,
      [productId]
    );
    if (products.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Product no longer exists' });
    }

    const currentQuantity = Number(items[0].Quantity);
    const isDecrease = quantity < currentQuantity;
    const availableStock = Number(products[0].StockQuantity);
    if (!isDecrease && products[0].Status !== 'Active') {
      await conn.rollback();
      return res.status(409).json({ message: 'Product is no longer available' });
    }
    if (!isDecrease && quantity > availableStock) {
      await conn.rollback();
      return res.status(409).json({
        message: `Requested quantity is ${quantity}, but only ${availableStock} is available`
      });
    }

    await conn.query(
      `UPDATE CART_ITEM SET Quantity = ?
       WHERE CustomerID = ? AND ProductID = ?`,
      [quantity, customerId, productId]
    );

    await conn.commit();
    res.json({ success: true, message: 'Cart updated.' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
}

async function removeCartItem(req, res) {
  try {
    const customerId = req.user.userId;
    const productId = Number(req.params.productId);

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ message: 'Invalid product' });
    }

    const [result] = await db.query(
      'DELETE FROM CART_ITEM WHERE CustomerID = ? AND ProductID = ?',
      [customerId, productId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Cart item not found' });
    }

    res.json({ success: true, message: 'Product removed from cart.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { getCart, addToCart, updateCartItem, removeCartItem };
