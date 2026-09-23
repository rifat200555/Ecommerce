const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db/connection');
const authMiddleware = require('../middleware/authMiddleware');

const AUTH_COOKIE_MAX_AGE = 24 * 60 * 60 * 1000;

function setAuthCookie(res, token) {
  res.cookie(authMiddleware.cookieName, token, {
    ...authMiddleware.cookieOptions,
    maxAge: AUTH_COOKIE_MAX_AGE
  });
}

async function getRoles(queryable, userId) {
  const [admins] = await queryable.query(
    'SELECT UserID FROM ADMIN WHERE UserID = ?', [userId]
  );
  const [sellers] = await queryable.query(
    'SELECT UserID FROM SELLER WHERE UserID = ?', [userId]
  );
  const [customers] = await queryable.query(
    'SELECT UserID FROM CUSTOMER WHERE UserID = ?', [userId]
  );

  const roles = [];
  if (customers.length > 0) roles.push('customer');
  if (sellers.length > 0) roles.push('seller');
  if (admins.length > 0) roles.push('admin');
  return roles;
}

function redirectForRole(role) {
  return {
    customer: '/customer.html',
    seller: '/seller.html',
    admin: '/admin.html'
  }[role];
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const [users] = await db.query(
      'SELECT UserID, Email, PasswordHash, FullName FROM `USER` WHERE Email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const user = users[0];

    const passwordOk = await bcrypt.compare(password, user.PasswordHash);
    if (!passwordOk) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const roles = await getRoles(db, user.UserID);
    if (roles.length === 0) {
      return res.status(403).json({ message: 'This account has no type assigned' });
    }

    const token = jwt.sign(
      { userId: user.UserID },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    await db.query('UPDATE `USER` SET LastLogin = NOW() WHERE UserID = ?', [user.UserID]);

    const redirect = roles.length === 1
      ? redirectForRole(roles[0])
      : '/role-selection.html';

    setAuthCookie(res, token);
    res.json({ success: true, token, fullName: user.FullName, roles, redirect });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function register_seller(req, res) {
  const {
    fullName, email, password, phone, storeName,
    businessEmail, businessPhone, tradeLicenseNumber
  } = req.body;

  if (!fullName || !email || !password || !storeName) {
    return res.status(400).json({
      message: 'Full name, email, password and store name are required'
    });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [users] = await conn.query(
      'SELECT UserID, PasswordHash FROM `USER` WHERE Email = ? FOR UPDATE',
      [email]
    );

    let userId;
    if (users.length > 0) {
      const passwordOk = await bcrypt.compare(password, users[0].PasswordHash);
      if (!passwordOk) {
        await conn.rollback();
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      userId = users[0].UserID;
      const [roles] = await conn.query(
        'SELECT UserID FROM SELLER WHERE UserID = ?', [userId]
      );
      if (roles.length > 0) {
        await conn.rollback();
        return res.status(409).json({
          message: 'This account is already registered as a seller'
        });
      }
    } else {
      const passwordHash = await bcrypt.hash(password, 10);
      const [userResult] = await conn.query(
        'INSERT INTO `USER` (FullName, Email, PasswordHash, Phone) VALUES (?, ?, ?, ?)',
        [fullName, email, passwordHash, phone || null]
      );
      userId = userResult.insertId;
    }

    await conn.query(
      `INSERT INTO SELLER
         (UserID, StoreName, BusinessEmail, BusinessPhone, TradeLicenseNumber, VerificationStatus)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId, storeName, businessEmail || email, businessPhone || null,
        tradeLicenseNumber || null, 'Pending'
      ]
    );

    await conn.commit();

    const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1d' });
    setAuthCookie(res, token);
    res.status(201).json({
      success: true,
      message: 'Seller role added.',
      token,
      redirect: '/seller.html'
    });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That email or seller role is already registered' });
    }
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
}

async function register_customer(req, res) {
  const { fullName, email, password, phone, gender, dateOfBirth } = req.body;

  if (!fullName || !email || !password) {
    return res.status(400).json({ message: 'Full name, email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [users] = await conn.query(
      'SELECT UserID, PasswordHash FROM `USER` WHERE Email = ? FOR UPDATE',
      [email]
    );

    let userId;
    if (users.length > 0) {
      const passwordOk = await bcrypt.compare(password, users[0].PasswordHash);
      if (!passwordOk) {
        await conn.rollback();
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      userId = users[0].UserID;
      const [roles] = await conn.query(
        'SELECT UserID FROM CUSTOMER WHERE UserID = ?', [userId]
      );
      if (roles.length > 0) {
        await conn.rollback();
        return res.status(409).json({
          message: 'This account is already registered as a customer'
        });
      }
    } else {
      const passwordHash = await bcrypt.hash(password, 10);
      const [userResult] = await conn.query(
        'INSERT INTO `USER` (FullName, Email, PasswordHash, Phone) VALUES (?, ?, ?, ?)',
        [fullName, email, passwordHash, phone || null]
      );
      userId = userResult.insertId;
    }

    await conn.query(
      'INSERT INTO CUSTOMER (UserID, Gender, DateOfBirth) VALUES (?, ?, ?)',
      [userId, gender || null, dateOfBirth || null]
    );

    await conn.commit();

    const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1d' });
    setAuthCookie(res, token);
    res.status(201).json({
      success: true,
      message: 'Customer role added.',
      token,
      redirect: '/customer.html'
    });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That email or customer role is already registered' });
    }
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
}

async function getMyRoles(req, res) {
  try {
    const roles = await getRoles(db, req.user.userId);
    res.json({ success: true, roles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function selectRole(req, res) {
  try {
    const { role } = req.body;
    const redirect = redirectForRole(role);
    if (!redirect) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const roles = await getRoles(db, req.user.userId);
    if (!roles.includes(role)) {
      return res.status(403).json({ message: 'That role is not assigned to this account' });
    }

    res.json({ success: true, redirect });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

function logout(req, res) {
  res.clearCookie(authMiddleware.cookieName, authMiddleware.cookieOptions);
  res.json({ success: true });
}

module.exports = {
  login,
  register_customer,
  register_seller,
  getMyRoles,
  selectRole,
  logout
};
