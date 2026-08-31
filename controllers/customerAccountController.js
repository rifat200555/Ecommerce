const db = require('../db/connection');

async function getMe(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT u.UserID, u.FullName, u.Email, u.Phone,
              c.Gender, c.DateOfBirth
       FROM CUSTOMER c
       JOIN \`USER\` u ON u.UserID = c.UserID
       WHERE c.UserID = ?`,
      [req.user.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    res.json({ success: true, customer: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { getMe };
