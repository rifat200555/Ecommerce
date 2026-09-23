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
            'SELECT UserID FROM `USER` WHERE Email = ? FOR UPDATE', [email]
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
                'INSERT INTO `USER` (FullName, Email, PasswordHash, Phone) VALUES (?, ?, ?, ?)', [fullName, email, passwordHash, phone || null]
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

    try {
        const [resultSets] = await db.query(
            'CALL sp_add_reward_points(?, ?)', [customerId, points]
        );
        const result = resultSets[0][0];

        if (!result || Number(result.CustomerFound) === 0) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        res.json({
            success: true,
            message: `${points} Reward Points added successfully.`,
            rewardPoints: result.RewardPoints
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
}

async function getMe(req, res) {
    try {
        const [rows] = await db.query(
            `SELECT u.UserID, u.FullName, u.Email,
              a.AccessLevel, a.LastActionTime
       FROM ADMIN a
       JOIN \`USER\` u ON u.UserID = a.UserID
       WHERE a.UserID = ?`, [req.user.userId]
        );
        if (rows.length === 0) return res.status(404).json({ message: 'Admin not found' });
        res.json({ success: true, admin: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
}

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
            'UPDATE PRODUCT SET Status = ? WHERE ProductID = ?', [newStatus, productId]
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

async function getDashboard(req, res) {
    try {
        const [rows] = await db.query(
            `SELECT
               (SELECT COUNT(*) FROM CUSTOMER) AS TotalCustomers,
               (SELECT COUNT(*) FROM SELLER) AS TotalSellers,
               (SELECT COUNT(*) FROM PRODUCT) AS TotalProducts,
               (SELECT COUNT(*) FROM PRODUCT WHERE Status = 'Pending') AS PendingProducts,
               (SELECT COUNT(*) FROM SELLER WHERE VerificationStatus = 'Pending') AS PendingSellers,
               (SELECT COUNT(*) FROM \`ORDER\`) AS TotalOrders,
               (SELECT COUNT(*) FROM \`ORDER\` WHERE OrderStatus = 'Delivered') AS DeliveredOrders,
               (SELECT COUNT(*) FROM \`ORDER\` WHERE OrderStatus = 'Cancelled') AS CancelledOrders,
               (SELECT COALESCE(SUM(TotalAmount), 0)
                FROM \`ORDER\` WHERE OrderStatus = 'Delivered') AS TotalSales`
        );

        res.json({ success: true, stats: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
}

async function getUsers(req, res) {
    try {
        const [users] = await db.query(
            `SELECT u.UserID, u.FullName, u.Email, u.RegistrationDate,
                    CONCAT_WS(', ',
                      CASE WHEN c.UserID IS NOT NULL THEN 'Customer' END,
                      CASE WHEN s.UserID IS NOT NULL THEN 'Seller' END,
                      CASE WHEN a.UserID IS NOT NULL THEN 'Admin' END
                    ) AS \`Role\`,
                    'Not tracked' AS AccountStatus
             FROM \`USER\` u
             LEFT JOIN CUSTOMER c ON c.UserID = u.UserID
             LEFT JOIN SELLER s ON s.UserID = u.UserID
             LEFT JOIN ADMIN a ON a.UserID = u.UserID
             ORDER BY u.RegistrationDate DESC, u.UserID DESC`
        );

        res.json({ success: true, users });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
}

async function getSellers(req, res) {
    try {
        const status = String(req.query.status || 'all');
        const allowed = ['all', 'Pending', 'Verified', 'Rejected'];
        if (!allowed.includes(status)) {
            return res.status(400).json({ message: 'Invalid seller status' });
        }

        let where = '';
        const params = [];
        if (status !== 'all') {
            where = 'WHERE s.VerificationStatus = ?';
            params.push(status);
        }

        const [sellers] = await db.query(
            `SELECT s.UserID AS SellerID, s.StoreName, s.BusinessEmail,
                    s.BusinessPhone, s.TradeLicenseNumber,
                    s.VerificationStatus, s.JoinedDate,
                    u.FullName, u.Email
             FROM SELLER s
             JOIN \`USER\` u ON u.UserID = s.UserID
             ${where}
             ORDER BY s.JoinedDate DESC, s.UserID DESC`,
            params
        );

        res.json({ success: true, status, sellers });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
}

async function updateSellerStatus(req, res) {
    try {
        const sellerId = Number(req.params.sellerId);
        const { newStatus } = req.body;
        if (!Number.isInteger(sellerId) || sellerId <= 0) {
            return res.status(400).json({ message: 'Invalid seller ID' });
        }
        if (!['Pending', 'Verified', 'Rejected'].includes(newStatus)) {
            return res.status(400).json({ message: 'Invalid seller status' });
        }

        const [result] = await db.query(
            'UPDATE SELLER SET VerificationStatus = ? WHERE UserID = ?',
            [newStatus, sellerId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Seller not found' });
        }

        res.json({ success: true, message: `Seller #${sellerId} set to ${newStatus}.` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
}

async function getOrders(req, res) {
    try {
        const status = String(req.query.status || 'all');
        const allowed = ['all', 'Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
        if (!allowed.includes(status)) {
            return res.status(400).json({ message: 'Invalid order status' });
        }

        let where = '';
        const params = [];
        if (status !== 'all') {
            where = 'WHERE o.OrderStatus = ?';
            params.push(status);
        }

        const [orders] = await db.query(
            `SELECT o.OrderID, o.OrderDate, o.TotalAmount,
                    o.OrderStatus, o.PaymentStatus,
                    u.FullName AS CustomerName, u.Email AS CustomerEmail
             FROM \`ORDER\` o
             JOIN \`USER\` u ON u.UserID = o.CustomerID
             ${where}
             ORDER BY o.OrderDate DESC, o.OrderID DESC`,
            params
        );

        res.json({ success: true, status, orders });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
}

async function getSalesReport(req, res) {
    try {
        const [[summary], [salesByMonth], [topProducts], [topSellers]] = await Promise.all([
            db.query(
                `SELECT
                   COALESCE(SUM(CASE WHEN OrderStatus = 'Delivered' THEN TotalAmount ELSE 0 END), 0) AS TotalSales,
                   COALESCE(SUM(OrderStatus = 'Delivered'), 0) AS DeliveredOrders,
                   COALESCE(SUM(OrderStatus = 'Cancelled'), 0) AS CancelledOrders,
                   COALESCE(SUM(PaymentStatus = 'Refunded'), 0) AS RefundedOrders
                 FROM \`ORDER\``
            ),
            db.query(
                `SELECT DATE_FORMAT(OrderDate, '%Y-%m') AS SalesMonth,
                        COUNT(*) AS DeliveredOrders,
                        SUM(TotalAmount) AS TotalSales
                 FROM \`ORDER\`
                 WHERE OrderStatus = 'Delivered'
                 GROUP BY DATE_FORMAT(OrderDate, '%Y-%m')
                 ORDER BY SalesMonth DESC
                 LIMIT 12`
            ),
            db.query(
                `SELECT p.ProductID, p.ProductName,
                        SUM(oi.Quantity) AS QuantitySold,
                        SUM(oi.SubTotal) AS ProductSales
                 FROM ORDER_ITEM oi
                 JOIN PRODUCT p ON p.ProductID = oi.ProductID
                 JOIN \`ORDER\` o ON o.OrderID = oi.OrderID
                 WHERE o.OrderStatus = 'Delivered'
                 GROUP BY p.ProductID, p.ProductName
                 ORDER BY QuantitySold DESC, ProductSales DESC
                 LIMIT 10`
            ),
            db.query(
                `SELECT s.UserID AS SellerID, s.StoreName,
                        COUNT(DISTINCT o.OrderID) AS DeliveredOrders,
                        SUM(oi.SubTotal) AS SellerSales
                 FROM ORDER_ITEM oi
                 JOIN PRODUCT p ON p.ProductID = oi.ProductID
                 JOIN SELLER s ON s.UserID = p.SellerID
                 JOIN \`ORDER\` o ON o.OrderID = oi.OrderID
                 WHERE o.OrderStatus = 'Delivered'
                 GROUP BY s.UserID, s.StoreName
                 ORDER BY SellerSales DESC
                 LIMIT 10`
            )
        ]);

        res.json({
            success: true,
            summary: summary[0],
            salesByMonth,
            topProducts,
            topSellers
        });
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
    addRewardPoints,
    getDashboard,
    getUsers,
    getSellers,
    updateSellerStatus,
    getOrders,
    getSalesReport
};
