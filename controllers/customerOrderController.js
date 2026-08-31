const db = require('../db/connection');

const DELIVERY_CHARGE = 60;

async function getCheckoutOptions(req, res) {
  try {
    const customerId = req.user.userId;
    const [paymentMethods] = await db.query(
      `SELECT PaymentMethodID, MethodName, Description
       FROM PAYMENT_METHOD
       WHERE IsActive = 1
       ORDER BY PaymentMethodID`
    );
    const [wallets] = await db.query(
      `SELECT WalletID, CurrentBalance, RewardPoints
       FROM WALLET
       WHERE CustomerID = ?`,
      [customerId]
    );

    res.json({
      success: true,
      deliveryCharge: DELIVERY_CHARGE,
      paymentMethods,
      wallet: wallets.length > 0 ? wallets[0] : null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function getOrders(req, res) {
  try {
    const customerId = req.user.userId;
    const status = String(req.query.status || 'all').toLowerCase();
    const sort = String(req.query.sort || 'newest').toLowerCase();
    const statuses = {
      pending: 'Pending',
      processing: 'Processing',
      shipped: 'Shipped',
      delivered: 'Delivered',
      cancelled: 'Cancelled'
    };

    if (status !== 'all' && !statuses[status]) {
      return res.status(400).json({ message: 'Invalid order status' });
    }
    if (!['newest', 'oldest'].includes(sort)) {
      return res.status(400).json({ message: 'Invalid order sort' });
    }

    let sql = `SELECT o.OrderID, o.OrderDate, o.TotalAmount,
                      o.OrderStatus, o.PaymentStatus
               FROM \`ORDER\` o
               WHERE o.CustomerID = ?`;
    const params = [customerId];

    if (status !== 'all') {
      sql += ' AND o.OrderStatus = ?';
      params.push(statuses[status]);
    }
    sql += sort === 'oldest'
      ? ' ORDER BY o.OrderDate ASC, o.OrderID ASC'
      : ' ORDER BY o.OrderDate DESC, o.OrderID DESC';

    const [orders] = await db.query(sql, params);
    res.json({ success: true, orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function getOrderDetails(req, res) {
  try {
    const customerId = req.user.userId;
    const orderId = Number(req.params.orderId);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ message: 'Invalid order ID' });
    }

    const [orders] = await db.query(
      `SELECT o.OrderID, o.OrderDate, o.TotalAmount, o.DiscountAmount,
              o.DeliveryCharge, o.OrderStatus, o.PaymentStatus,
              a.AddressLabel, a.ReceiverName, a.PhoneNumber,
              a.StreetAddress, a.City, a.District, a.PostalCode, a.Country,
              pm.MethodName AS PaymentMethod, pm.Description AS PaymentDescription
       FROM \`ORDER\` o
       LEFT JOIN ADDRESS a ON a.AddressID = o.AddressID
       LEFT JOIN PAYMENT_METHOD pm ON pm.PaymentMethodID = o.PaymentMethodID
       WHERE o.OrderID = ? AND o.CustomerID = ?`,
      [orderId, customerId]
    );

    if (orders.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const [items] = await db.query(
      `SELECT oi.ItemNo, oi.ProductID, oi.Quantity, oi.UnitPrice,
              oi.Discount, oi.SubTotal, p.ProductName, p.Status AS ProductStatus,
              (SELECT pi.ImageURL
               FROM PRODUCT_IMAGE pi
               WHERE pi.ProductID = oi.ProductID
               ORDER BY pi.IsPrimary DESC, pi.DisplayOrder ASC, pi.ImageNumber ASC
               LIMIT 1) AS ImageURL
       FROM ORDER_ITEM oi
       JOIN PRODUCT p ON p.ProductID = oi.ProductID
       WHERE oi.OrderID = ?
       ORDER BY oi.ItemNo`,
      [orderId]
    );

    const [transactions] = await db.query(
      `SELECT TransactionID, Status, TransactionDate, TransactionType, Amount
       FROM \`TRANSACTION\`
       WHERE OrderID = ?
       ORDER BY TransactionDate DESC, TransactionID DESC`,
      [orderId]
    );

    res.json({ success: true, order: orders[0], items, transactions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function placeOrder(req, res) {
  const customerId = req.user.userId;
  const addressId = Number(req.body.addressId);
  const paymentMethodId = Number(req.body.paymentMethodId);
  const useRewardPoints = req.body.useRewardPoints === true;

  if (req.body.useRewardPoints !== undefined &&
      typeof req.body.useRewardPoints !== 'boolean') {
    return res.status(400).json({ message: 'Invalid reward-points option' });
  }

  if (!Number.isInteger(addressId) || addressId <= 0 ||
      !Number.isInteger(paymentMethodId) || paymentMethodId <= 0) {
    return res.status(400).json({ message: 'Address and payment method are required' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [addresses] = await conn.query(
      `SELECT AddressID FROM ADDRESS
       WHERE AddressID = ? AND UserID = ?
       FOR UPDATE`,
      [addressId, customerId]
    );
    if (addresses.length === 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'Selected address is invalid' });
    }

    const [methods] = await conn.query(
      `SELECT PaymentMethodID, MethodName FROM PAYMENT_METHOD
       WHERE PaymentMethodID = ? AND IsActive = 1
       FOR UPDATE`,
      [paymentMethodId]
    );
    if (methods.length === 0) {
      await conn.rollback();
      return res.status(400).json({ message: 'Selected payment method is unavailable' });
    }

    const methodName = String(methods[0].MethodName).trim().toLowerCase();
    const supportedMethods = ['cash on delivery', 'wallet', 'card', 'bkash'];
    if (!supportedMethods.includes(methodName)) {
      await conn.rollback();
      return res.status(400).json({ message: 'Selected payment method is not supported' });
    }

    const [items] = await conn.query(
      `SELECT ci.ProductID, ci.Quantity,
              p.ProductName, p.UnitPrice, p.Discount,
              p.StockQuantity, p.Status
       FROM CART_ITEM ci
       LEFT JOIN PRODUCT p ON p.ProductID = ci.ProductID
       WHERE ci.CustomerID = ?
       ORDER BY ci.AddedAt
       FOR UPDATE`,
      [customerId]
    );
    if (items.length === 0) {
      await conn.rollback();
      return res.status(409).json({ message: 'Your cart is empty' });
    }

    let subtotal = 0;
    let discountAmount = 0;
    const orderItems = [];
    const cartProblems = [];

    for (const item of items) {
      if (!item.ProductName || item.Status !== 'Active') {
        cartProblems.push(item.ProductName
          ? `${item.ProductName} is no longer available`
          : `Product ${item.ProductID} no longer exists`);
        continue;
      }

      const quantity = Number(item.Quantity);
      const stock = Number(item.StockQuantity);
      const unitPrice = Number(item.UnitPrice);
      const discount = Number(item.Discount);

      if (!Number.isInteger(quantity) || quantity <= 0) {
        cartProblems.push(`${item.ProductName} has an invalid cart quantity`);
        continue;
      }
      if (quantity > stock) {
        cartProblems.push(`${item.ProductName}: requested ${quantity}, but only ${stock} is available`);
        continue;
      }

      const original = quantity * unitPrice;
      const saved = original * (discount / 100);
      const lineTotal = Number((original - saved).toFixed(2));

      subtotal += original;
      discountAmount += saved;
      orderItems.push({
        productId: item.ProductID,
        quantity,
        unitPrice,
        discount,
        lineTotal
      });
    }

    if (cartProblems.length > 0) {
      await conn.rollback();
      return res.status(409).json({
        message: `Please update your cart. ${cartProblems.join('; ')}`
      });
    }

    subtotal = Number(subtotal.toFixed(2));
    discountAmount = Number(discountAmount.toFixed(2));
    const grandTotal = Number((subtotal - discountAmount + DELIVERY_CHARGE).toFixed(2));
    const isRewardPayment = useRewardPoints;
    const isWallet = methodName === 'wallet' && !isRewardPayment;
    let wallet = null;

    if (isRewardPayment && methodName !== 'wallet') {
      await conn.rollback();
      return res.status(400).json({ message: 'Reward Points must use the wallet payment option' });
    }

    if (isWallet || isRewardPayment) {
      const [wallets] = await conn.query(
        `SELECT WalletID, CurrentBalance, RewardPoints FROM WALLET
         WHERE CustomerID = ?
         FOR UPDATE`,
        [customerId]
      );
      if (wallets.length === 0) {
        await conn.rollback();
        return res.status(409).json({ message: 'No wallet is available for this account' });
      }
      if (isWallet && Number(wallets[0].CurrentBalance) < grandTotal) {
        await conn.rollback();
        return res.status(409).json({ message: 'Insufficient wallet balance' });
      }
      wallet = wallets[0];

      if (isRewardPayment && !Number.isInteger(grandTotal)) {
        await conn.rollback();
        return res.status(409).json({
          message: 'Reward Points can only pay a whole-taka order total'
        });
      }
      if (isRewardPayment && Number(wallet.RewardPoints) < grandTotal) {
        await conn.rollback();
        return res.status(409).json({ message: 'Insufficient Reward Points' });
      }
    }

    const paymentStatus = (isWallet || isRewardPayment) ? 'Paid' : 'Unpaid';
    const [orderResult] = await conn.query(
      `INSERT INTO \`ORDER\`
         (CustomerID, AddressID, PaymentMethodID, OrderStatus, PaymentStatus,
          TotalAmount, DiscountAmount, DeliveryCharge)
       VALUES (?, ?, ?, 'Pending', ?, ?, ?, ?)`,
      [customerId, addressId, paymentMethodId, paymentStatus,
       grandTotal, discountAmount, DELIVERY_CHARGE]
    );
    const orderId = orderResult.insertId;

    let itemNo = 1;
    for (const item of orderItems) {
      await conn.query(
        `INSERT INTO ORDER_ITEM
           (OrderID, ItemNo, ProductID, Quantity, UnitPrice, Discount, SubTotal)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [orderId, itemNo, item.productId, item.quantity,
         item.unitPrice, item.discount, item.lineTotal]
      );

      const [stockResult] = await conn.query(
        `UPDATE PRODUCT
         SET StockQuantity = StockQuantity - ?
         WHERE ProductID = ? AND Status = 'Active' AND StockQuantity >= ?`,
        [item.quantity, item.productId, item.quantity]
      );
      if (stockResult.affectedRows === 0) {
        throw new Error('Stock changed while placing the order');
      }
      itemNo++;
    }

    if (isWallet) {
      await conn.query(
        `UPDATE WALLET
         SET CurrentBalance = CurrentBalance - ?, LastUpdated = NOW()
         WHERE WalletID = ?`,
        [grandTotal, wallet.WalletID]
      );
      await conn.query(
        `INSERT INTO \`TRANSACTION\`
           (WalletID, OrderID, TransactionType, Amount, Status)
         VALUES (?, ?, 'Payment', ?, 'Success')`,
        [wallet.WalletID, orderId, grandTotal]
      );
    }

    if (isRewardPayment) {
      const [pointsResult] = await conn.query(
        `UPDATE WALLET
         SET RewardPoints = RewardPoints - ?, LastUpdated = NOW()
         WHERE WalletID = ? AND RewardPoints >= ?`,
        [grandTotal, wallet.WalletID, grandTotal]
      );
      if (pointsResult.affectedRows === 0) {
        throw new Error('Reward Points changed while placing the order');
      }

      await conn.query(
        "INSERT INTO `TRANSACTION` " +
        "(WalletID, OrderID, TransactionType, Amount, Status) " +
        "VALUES (?, ?, 'Reward Payment', ?, 'Success')",
        [wallet.WalletID, orderId, grandTotal]
      );
    }

    await conn.query(
      'DELETE FROM CART_ITEM WHERE CustomerID = ?',
      [customerId]
    );

    await conn.commit();
    res.status(201).json({
      success: true,
      orderId,
      paymentStatus,
      totalAmount: grandTotal,
      rewardPointsUsed: isRewardPayment ? grandTotal : 0,
      message: `Order #${orderId} placed successfully.`
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
}

module.exports = { getCheckoutOptions, getOrders, getOrderDetails, placeOrder };
