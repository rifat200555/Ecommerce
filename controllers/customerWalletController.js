const db = require('../db/connection');

async function getWallet(req, res) {
  try {
    const customerId = req.user.userId;
    const [wallets] = await db.query(
      `SELECT WalletID, CurrentBalance, RewardPoints, LastUpdated
       FROM WALLET
       WHERE CustomerID = ?`,
      [customerId]
    );

    if (wallets.length === 0) {
      return res.json({ success: true, wallet: null, transactions: [] });
    }

    const wallet = wallets[0];
    const [transactions] = await db.query(
      `SELECT t.TransactionID, t.TransactionType, t.Amount,
              t.TransactionDate, t.Status,
              CASE WHEN o.CustomerID = ? THEN t.OrderID ELSE NULL END AS OrderID
       FROM \`TRANSACTION\` t
       LEFT JOIN \`ORDER\` o ON o.OrderID = t.OrderID
       WHERE t.WalletID = ?
       ORDER BY t.TransactionDate DESC, t.TransactionID DESC`,
      [customerId, wallet.WalletID]
    );

    res.json({ success: true, wallet, transactions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { getWallet };
