const db = require('../db/connection');

async function adminMiddleware(req, res, next) {
  try {
    const [rows] = await db.query(
      'SELECT UserID FROM ADMIN WHERE UserID = ?',
      [req.user.userId]      // set by authMiddleware, which runs first
    );

    if (rows.length === 0) {
      return res.status(403).json({ message: 'Admin access only' });
    }

    // your ERD has LastActionTime — this is a reasonable place to touch it
    await db.query('UPDATE ADMIN SET LastActionTime = NOW() WHERE UserID = ?', [req.user.userId]);

    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = adminMiddleware;