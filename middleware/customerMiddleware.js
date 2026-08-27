const db = require('../db/connection');

async function customerMiddleware(req, res, next) {
  try {
    const [rows] = await db.query(
      'SELECT UserID FROM CUSTOMER WHERE UserID = ?',
      [req.user.userId]      // set by authMiddleware, which always runs first
    );

    if (rows.length === 0) {
      return res.status(403).json({ message: 'Customer access only' });
    }

    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = customerMiddleware;