// =====================================================================
//  controllers/adminController.js
//
//  The admin's job in this milestone is small: look at products that
//  sellers submitted, and approve or reject them.
// =====================================================================

const db = require('../db/connection');
const bcrypt = require('bcrypt');

async function registerAdmin(req, res) {
  const { fullName, email, password, phone } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [users] = await conn.query(
      'SELECT UserID FROM `USER` WHERE Email = ? FOR UPDATE',
      [email]
    );

    let userId;
    if (users.length > 0) {
      userId = users[0].UserID;
      const [admins] = await conn.query(
        'SELECT UserID FROM ADMIN WHERE UserID = ?', [userId]
      );
      if (admins.length > 0) {
        await conn.rollback();
        return res.status(409).json({ message: 'This account is already an admin' });
      }
    } else {
      if (!fullName || !password) {
        await conn.rollback();
        return res.status(400).json({
          message: 'Full name and password are required for a new account'
        });
      }
      if (password.length < 6) {
        await conn.rollback();
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const [result] = await conn.query(
        'INSERT INTO `USER` (FullName, Email, PasswordHash, Phone) VALUES (?, ?, ?, ?)',
        [fullName, email, passwordHash, phone || null]
      );
      userId = result.insertId;
    }

    await conn.query('INSERT INTO ADMIN (UserID) VALUES (?)', [userId]);
    await conn.commit();

    res.status(201).json({
      success: true,
      message: 'Admin role added successfully.',
      userId
    });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That email or admin role already exists' });
    }
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
}

async function getCustomers(req, res) {
  try {
    const [customers] = await db.query(
      `SELECT c.UserID AS CustomerID, u.FullName, u.Email,
              COALESCE(w.RewardPoints, 0) AS RewardPoints
       FROM CUSTOMER c
       JOIN \`USER\` u ON u.UserID = c.UserID
       LEFT JOIN WALLET w ON w.CustomerID = c.UserID
       ORDER BY u.FullName, c.UserID`
    );
    res.json({ success: true, customers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function addRewardPoints(req, res) {
  const customerId = Number(req.params.customerId);
  const points = Number(req.body.points);

  if (!Number.isInteger(customerId) || customerId <= 0) {
    return res.status(400).json({ message: 'Invalid customer ID' });
  }
  if (!Number.isInteger(points) || points <= 0) {
    return res.status(400).json({ message: 'Points must be a positive whole number' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [customers] = await conn.query(
      'SELECT UserID FROM CUSTOMER WHERE UserID = ? FOR UPDATE',
      [customerId]
    );
    if (customers.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Customer not found' });
    }

    const [wallets] = await conn.query(
      `SELECT WalletID, RewardPoints FROM WALLET
       WHERE CustomerID = ? FOR UPDATE`,
      [customerId]
    );

    let walletId;
    if (wallets.length === 0) {
      const [walletResult] = await conn.query(
        `INSERT INTO WALLET (CustomerID, RewardPoints, LastUpdated)
         VALUES (?, ?, NOW())`,
        [customerId, points]
      );
      walletId = walletResult.insertId;
    } else {
      walletId = wallets[0].WalletID;
      await conn.query(
        `UPDATE WALLET
         SET RewardPoints = RewardPoints + ?, LastUpdated = NOW()
         WHERE WalletID = ?`,
        [points, walletId]
      );
    }

    await conn.query(
      "INSERT INTO `TRANSACTION` " +
      "(WalletID, OrderID, TransactionType, Amount, Status) " +
      "VALUES (?, NULL, 'Reward Credit', ?, 'Success')",
      [walletId, points]
    );

    const [updated] = await conn.query(
      'SELECT RewardPoints FROM WALLET WHERE WalletID = ?', [walletId]
    );

    await conn.commit();
    res.json({
      success: true,
      message: `${points} Reward Points added successfully.`,
      rewardPoints: updated[0].RewardPoints
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
}

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

module.exports = {
  getMe,
  getProducts,
  updateProductStatus,
  registerAdmin,
  getCustomers,
  addRewardPoints
};
