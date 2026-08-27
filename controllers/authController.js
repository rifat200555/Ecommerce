const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db/connection');

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // STEP 1 — find the USER by email
    const [users] = await db.query(
      'SELECT UserID, Email, PasswordHash, FullName FROM `USER` WHERE Email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const user = users[0];

    // STEP 2 — compare the typed password against the stored hash
    const passwordOk = await bcrypt.compare(password, user.PasswordHash);
    if (!passwordOk) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // STEP 3 — which specialization tables contain this UserID?
    const [admins] = await db.query(
      'SELECT UserID FROM ADMIN WHERE UserID = ?', [user.UserID]
    );
    const [sellers] = await db.query(
      'SELECT UserID FROM SELLER WHERE UserID = ?', [user.UserID]
    );
    const [customers] = await db.query(
      'SELECT UserID FROM CUSTOMER WHERE UserID = ?', [user.UserID]
    );

    const isAdmin    = admins.length > 0;
    const isSeller   = sellers.length > 0;
    const isCustomer = customers.length > 0;

    if (!isAdmin && !isSeller && !isCustomer) {
      return res.status(403).json({ message: 'This account has no type assigned' });
    }

    // STEP 4 — create the JWT. Payload holds nothing but the UserID.
    const token = jwt.sign(
      { userId: user.UserID },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    await db.query('UPDATE `USER` SET LastLogin = NOW() WHERE UserID = ?', [user.UserID]);

    // STEP 5 — where does the browser go? admin > seller > customer
    let redirect = '/customer.html';
    if (isSeller) redirect = '/seller.html';
    if (isAdmin)  redirect = '/admin.html';

    res.json({ success: true, token, fullName: user.FullName, redirect });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}





async function register_seller(req, res) {
  const { fullName, email, password, phone, storeName, businessEmail, businessPhone, tradeLicenseNumber } = req.body;

  // STEP 1 — basic validation
  if (!fullName || !email || !password || !storeName) {
    return res.status(400).json({ message: 'Full name, email, password and store name are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  // STEP 2 — hash the password BEFORE it ever touches the database
  const passwordHash = await bcrypt.hash(password, 10);

  // STEP 3 — grab a single connection so we can run a transaction
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [userResult] = await conn.query(
      'INSERT INTO `USER` (FullName, Email, PasswordHash, Phone) VALUES (?, ?, ?, ?)',
      [fullName, email, passwordHash, phone || null]
    );

    const userId = userResult.insertId;

    await conn.query(
      `INSERT INTO SELLER
         (UserID, StoreName, BusinessEmail, BusinessPhone, TradeLicenseNumber, VerificationStatus)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, storeName, businessEmail || email, businessPhone || null, tradeLicenseNumber || null, 'Pending']
    );

    await conn.commit();   // both inserts succeeded -> save them for real

    //res.status(201).json({ success: true, message: 'Account created. You can log in now.' });
        await conn.commit();

    const token = jwt.sign(
      { userId },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(201).json({
      success: true,
      message: 'Account created.',
      token,
      redirect: '/seller.html'
    });

  } catch (err) {
    await conn.rollback();   // something failed -> undo BOTH inserts

    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That email is already registered' });
    }
    console.error(err);
    res.status(500).json({ message: 'Server error' });

  } finally {
    conn.release();   // always give the connection back to the pool
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

  const passwordHash = await bcrypt.hash(password, 10);
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [userResult] = await conn.query(
      'INSERT INTO `USER` (FullName, Email, PasswordHash, Phone) VALUES (?, ?, ?, ?)',
      [fullName, email, passwordHash, phone || null]
    );
    const userId = userResult.insertId;

    await conn.query(
      'INSERT INTO CUSTOMER (UserID, Gender, DateOfBirth) VALUES (?, ?, ?)',
      [userId, gender || null, dateOfBirth || null]
    );

    await conn.commit();
   // res.status(201).json({ success: true, message: 'Account created. You can log in now.' });
        await conn.commit();

    // the account is real now, so we can hand out a token immediately
    const token = jwt.sign(
      { userId },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(201).json({
      success: true,
      message: 'Account created.',
      token,
      redirect: '/customer.html'
    });

    
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That email is already registered' });
    }
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
}

module.exports = { login , register_customer ,register_seller };