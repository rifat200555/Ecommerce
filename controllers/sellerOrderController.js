const db = require('../db/connection');

const NEXT_STATUS = {
  Pending:    ['Processing', 'Cancelled'],
  Processing: ['Shipped', 'Cancelled'],
  Shipped:    ['Delivered', 'Cancelled'],
  Delivered:  [],
  Cancelled:  []
};

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
              u.FullName AS CustomerName,
              EXISTS(
                SELECT 1
                FROM ORDER_ITEM oi2
                JOIN PRODUCT p2 ON p2.ProductID = oi2.ProductID
                WHERE oi2.OrderID = o.OrderID AND p2.SellerID <> ?
              ) AS IsMultiSeller
       FROM \`ORDER\` o
       JOIN ORDER_ITEM oi ON oi.OrderID = o.OrderID
       JOIN PRODUCT p     ON p.ProductID = oi.ProductID
       JOIN \`USER\` u    ON u.UserID = o.CustomerID
       ${where}
       ORDER BY o.OrderDate DESC`,
      [sellerId, sellerId]
    );

    res.json({ success: true, status, orders: rows, nextStatus: NEXT_STATUS });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function updateOrderStatus(req, res) {
  const sellerId = req.user.userId;
  const orderId = req.params.orderId;
  const { newStatus } = req.body;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1. The order must belong wholly to this seller. With one status on
    //    ORDER, an individual seller cannot safely act on a mixed order.
    const [ownership] = await conn.query(
      `SELECT COUNT(DISTINCT p.SellerID) AS SellerCount,
              SUM(p.SellerID = ?) AS OwnItemCount
       FROM ORDER_ITEM oi
       JOIN PRODUCT p ON p.ProductID = oi.ProductID
       WHERE oi.OrderID = ?`,
      [sellerId, orderId]
    );
    if (Number(ownership[0].OwnItemCount) === 0) {
      await conn.rollback();
      return res.status(403).json({ message: 'This order is not yours' });
    }
    if (Number(ownership[0].SellerCount) > 1) {
      await conn.rollback();
      return res.status(409).json({
        message: 'A multi-seller order cannot be updated by an individual seller'
      });
    }

    // 2. What state is it in right now?
    const [orders] = await conn.query(
      `SELECT OrderStatus, PaymentStatus, CustomerID, TotalAmount, PaymentMethodID
       FROM \`ORDER\` WHERE OrderID = ? FOR UPDATE`,
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

    // Cash is collected outside the wallet. Delivery is the approved
    // event that marks a COD order paid, without creating a transaction.
    if (newStatus === 'Delivered' && order.PaymentStatus === 'Unpaid') {
      const [methods] = await conn.query(
        'SELECT MethodName FROM PAYMENT_METHOD WHERE PaymentMethodID = ?',
        [order.PaymentMethodID]
      );
      const methodName = methods.length > 0
        ? String(methods[0].MethodName).trim().toLowerCase()
        : '';
      if (methodName === 'cash on delivery') {
        await conn.query(
          "UPDATE `ORDER` SET PaymentStatus = 'Paid' WHERE OrderID = ?",
          [orderId]
        );
      }
    }

    // Checkout deducts stock for every order item. A cancellation is
    // terminal, so restore it exactly once inside this same transaction.
    if (newStatus === 'Cancelled') {
      await conn.query(
        `UPDATE PRODUCT p
         JOIN (
           SELECT ProductID, SUM(Quantity) AS Quantity
           FROM ORDER_ITEM
           WHERE OrderID = ?
           GROUP BY ProductID
         ) oi ON oi.ProductID = p.ProductID
         SET p.StockQuantity = p.StockQuantity + oi.Quantity`,
        [orderId]
      );
    }

    // 5. Cancelling a paid order returns the payment to its source.
    //    Reward payments restore points; other paid orders keep the
    //    existing wallet-balance refund behavior.
    if (newStatus === 'Cancelled' && order.PaymentStatus === 'Paid') {
      await conn.query(
        "UPDATE `ORDER` SET PaymentStatus = 'Refunded' WHERE OrderID = ?", [orderId]);

      const [rewardPayments] = await conn.query(
        "SELECT WalletID, Amount FROM `TRANSACTION` " +
        "WHERE OrderID = ? AND TransactionType = 'Reward Payment' " +
        "AND Status = 'Success' ORDER BY TransactionID LIMIT 1 FOR UPDATE",
        [orderId]
      );

      if (rewardPayments.length > 0) {
        const rewardPayment = rewardPayments[0];
        await conn.query(
          `UPDATE WALLET
           SET RewardPoints = RewardPoints + ?, LastUpdated = NOW()
           WHERE WalletID = ?`,
          [rewardPayment.Amount, rewardPayment.WalletID]
        );
        await conn.query(
          `INSERT INTO \`TRANSACTION\`
             (WalletID, OrderID, TransactionType, Amount, Status)
           VALUES (?, ?, 'Reward Refund', ?, 'Success')`,
          [rewardPayment.WalletID, orderId, rewardPayment.Amount]
        );
      } else {
      const [wallets] = await conn.query(
        `SELECT WalletID FROM WALLET
         WHERE CustomerID = ? FOR UPDATE`, [order.CustomerID]);

      if (wallets.length > 0) {
        const walletId = wallets[0].WalletID;

        await conn.query(
          `UPDATE WALLET
           SET CurrentBalance = CurrentBalance + ?, LastUpdated = NOW()
           WHERE WalletID = ?`,
          [order.TotalAmount, walletId]
        );

        await conn.query(
          `INSERT INTO \`TRANSACTION\`
             (WalletID, OrderID, TransactionType, Amount, Status)
           VALUES (?, ?, 'Refund', ?, 'Success')`,
          [walletId, orderId, order.TotalAmount]
        );
      }
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

module.exports = { getOrders, updateOrderStatus };
