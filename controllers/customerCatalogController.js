const db = require('../db/connection');

async function getProducts(req, res) {
  try {
    const customerId = req.user.userId;
    const search = String(req.query.search || '').trim();
    const categoryId = req.query.categoryId;
    const brandId = req.query.brandId;
    const minPrice = req.query.minPrice;
    const maxPrice = req.query.maxPrice;
    const sort = req.query.sort || 'newest';

    if (search.length > 200) {
      return res.status(400).json({ message: 'Search keyword must be 200 characters or less' });
    }

    if (minPrice !== undefined && (minPrice === '' || !Number.isFinite(Number(minPrice)) || Number(minPrice) < 0)) {
      return res.status(400).json({ message: 'Minimum price must be zero or more' });
    }
    if (maxPrice !== undefined && (maxPrice === '' || !Number.isFinite(Number(maxPrice)) || Number(maxPrice) < 0)) {
      return res.status(400).json({ message: 'Maximum price must be zero or more' });
    }
    if (minPrice !== undefined && maxPrice !== undefined && Number(minPrice) > Number(maxPrice)) {
      return res.status(400).json({ message: 'Minimum price cannot be greater than maximum price' });
    }
    if (categoryId !== undefined && !/^\d+$/.test(categoryId)) {
      return res.status(400).json({ message: 'Invalid category' });
    }
    if (brandId !== undefined && !/^\d+$/.test(brandId)) {
      return res.status(400).json({ message: 'Invalid brand' });
    }

    const orderBy = {
      newest:    'p.CreatedAt DESC',
      price_asc:  '(p.UnitPrice * (1 - p.Discount / 100)) ASC',
      price_desc: '(p.UnitPrice * (1 - p.Discount / 100)) DESC',
      rating:     'p.AverageRating DESC',
      name:       'p.ProductName ASC'
    }[sort];

    if (!orderBy) {
      return res.status(400).json({ message: 'Invalid sort option' });
    }

    let where = "WHERE p.Status = 'Active'";
    const params = [customerId];

    if (search) {
      where += ' AND (p.ProductName LIKE ? OR p.Description LIKE ?)';
      const keyword = `%${search}%`;
      params.push(keyword, keyword);
    }
    if (categoryId !== undefined) {
      where += ' AND p.CategoryID = ?';
      params.push(categoryId);
    }
    if (brandId !== undefined) {
      where += ' AND p.BrandID = ?';
      params.push(brandId);
    }
    if (minPrice !== undefined) {
      where += ' AND (p.UnitPrice * (1 - p.Discount / 100)) >= ?';
      params.push(minPrice);
    }
    if (maxPrice !== undefined) {
      where += ' AND (p.UnitPrice * (1 - p.Discount / 100)) <= ?';
      params.push(maxPrice);
    }

    const [products] = await db.query(
      `SELECT p.ProductID, p.ProductName, p.UnitPrice, p.Discount,
              p.AverageRating, p.StockQuantity,
              c.CategoryName, b.BrandName,
              (SELECT pi.ImageURL
               FROM PRODUCT_IMAGE pi
               WHERE pi.ProductID = p.ProductID
               ORDER BY pi.IsPrimary DESC, pi.DisplayOrder ASC, pi.ImageNumber ASC
               LIMIT 1) AS ImageURL,
              EXISTS(
                SELECT 1 FROM WISHLIST_ITEM wi
                WHERE wi.ProductID = p.ProductID AND wi.CustomerID = ?
              ) AS IsWishlisted
       FROM PRODUCT p
       LEFT JOIN CATEGORY c ON c.CategoryID = p.CategoryID
       LEFT JOIN BRAND b    ON b.BrandID = p.BrandID
       ${where}
       ORDER BY ${orderBy}`,
      params
    );

    const [categories] = await db.query(
      `SELECT DISTINCT c.CategoryID, c.CategoryName
       FROM CATEGORY c
       JOIN PRODUCT p ON p.CategoryID = c.CategoryID
       WHERE p.Status = 'Active'
       ORDER BY c.CategoryName`
    );

    const [brands] = await db.query(
      `SELECT DISTINCT b.BrandID, b.BrandName
       FROM BRAND b
       JOIN PRODUCT p ON p.BrandID = b.BrandID
       WHERE p.Status = 'Active'
      ORDER BY b.BrandName`
    );

    if (search) {
      await db.query(
        `INSERT INTO SEARCH_HISTORY (CustomerID, SearchKeyword, TotalResult)
         VALUES (?, ?, ?)`,
        [customerId, search, products.length]
      );
    }

    res.json({ success: true, products, categories, brands });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function getProductById(req, res) {
  try {
    const customerId = req.user.userId;
    const productId = Number(req.params.productId);

    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ message: 'Invalid product' });
    }

    const [products] = await db.query(
      `SELECT p.ProductID, p.ProductName, p.Description, p.UnitPrice,
              p.Discount, p.AverageRating, p.StockQuantity, p.Weight,
              p.Warranty, p.Status,
              c.CategoryName, b.BrandName,
              s.StoreName, s.AverageRating AS SellerRating,
              EXISTS(
                SELECT 1 FROM WISHLIST_ITEM wi
                WHERE wi.ProductID = p.ProductID AND wi.CustomerID = ?
              ) AS IsWishlisted,
              EXISTS(
                SELECT 1
                FROM \`ORDER\` o
                JOIN ORDER_ITEM oi ON oi.OrderID = o.OrderID
                WHERE o.CustomerID = ?
                  AND oi.ProductID = p.ProductID
                  AND o.OrderStatus = 'Delivered'
              ) AS CanReview
       FROM PRODUCT p
       JOIN SELLER s        ON s.UserID = p.SellerID
       LEFT JOIN CATEGORY c ON c.CategoryID = p.CategoryID
       LEFT JOIN BRAND b    ON b.BrandID = p.BrandID
       WHERE p.ProductID = ? AND p.Status = 'Active'`,
      [customerId, customerId, productId]
    );

    if (products.length === 0) {
      return res.status(404).json({ message: 'Product is unavailable or no longer exists' });
    }

    const [images] = await db.query(
      `SELECT ImageNumber, ImageURL, Caption, IsPrimary
       FROM PRODUCT_IMAGE
       WHERE ProductID = ?
       ORDER BY IsPrimary DESC, DisplayOrder ASC, ImageNumber ASC`,
      [productId]
    );

    const [reviews] = await db.query(
      `SELECT r.ReviewID, r.Rating, r.ReviewText, r.ReviewDate,
              r.HelpfulVotes, u.FullName
       FROM REVIEW r
       JOIN \`USER\` u ON u.UserID = r.CustomerID
       WHERE r.ProductID = ?
       ORDER BY r.ReviewDate DESC, r.ReviewID DESC`,
      [productId]
    );

    res.json({ success: true, product: products[0], images, reviews });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function getSearchHistory(req, res) {
  try {
    const [history] = await db.query(
      `SELECT SearchID, SearchKeyword, SearchTime, TotalResult
       FROM SEARCH_HISTORY
       WHERE CustomerID = ?
       ORDER BY SearchTime DESC, SearchID DESC`,
      [req.user.userId]
    );
    res.json({ success: true, history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function deleteSearchHistory(req, res) {
  try {
    const searchId = Number(req.params.searchId);
    if (!Number.isInteger(searchId) || searchId <= 0) {
      return res.status(400).json({ message: 'Invalid search history ID' });
    }

    const [result] = await db.query(
      'DELETE FROM SEARCH_HISTORY WHERE SearchID = ? AND CustomerID = ?',
      [searchId, req.user.userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Search history entry not found' });
    }
    res.json({ success: true, message: 'Search history entry deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function clearSearchHistory(req, res) {
  try {
    await db.query(
      'DELETE FROM SEARCH_HISTORY WHERE CustomerID = ?',
      [req.user.userId]
    );
    res.json({ success: true, message: 'Search history cleared.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function createReview(req, res) {
  const customerId = req.user.userId;
  const productId = Number(req.params.productId);
  const rating = Number(req.body.rating);
  const reviewText = String(req.body.reviewText || '').trim();

  if (!Number.isInteger(productId) || productId <= 0 ||
      !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Rating must be between 1 and 5' });
  }
  if (!reviewText) {
    return res.status(400).json({ message: 'Review text is required' });
  }
  if (reviewText.length > 1000) {
    return res.status(400).json({ message: 'Review text must be 1000 characters or less' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [products] = await conn.query(
      `SELECT ProductID FROM PRODUCT
       WHERE ProductID = ? AND Status = 'Active'
       FOR UPDATE`,
      [productId]
    );
    if (products.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Product is unavailable or no longer exists' });
    }

    const [delivered] = await conn.query(
      `SELECT o.OrderID
       FROM \`ORDER\` o
       JOIN ORDER_ITEM oi ON oi.OrderID = o.OrderID
       WHERE o.CustomerID = ? AND oi.ProductID = ?
         AND o.OrderStatus = 'Delivered'
       LIMIT 1`,
      [customerId, productId]
    );
    if (delivered.length === 0) {
      await conn.rollback();
      return res.status(403).json({ message: 'Only customers who received this product can review it' });
    }

    await conn.query(
      `INSERT INTO REVIEW (CustomerID, ProductID, Rating, ReviewText)
       VALUES (?, ?, ?, ?)`,
      [customerId, productId, rating, reviewText]
    );

    await conn.query(
      `UPDATE PRODUCT p
       SET AverageRating = COALESCE(
         (SELECT AVG(r.Rating) FROM REVIEW r WHERE r.ProductID = p.ProductID), 0
       )
       WHERE p.ProductID = ?`,
      [productId]
    );

    await conn.commit();
    res.status(201).json({ success: true, message: 'Review submitted.' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
}

async function markReviewHelpful(req, res) {
  try {
    const reviewId = Number(req.params.reviewId);
    if (!Number.isInteger(reviewId) || reviewId <= 0) {
      return res.status(400).json({ message: 'Invalid review' });
    }

    const [result] = await db.query(
      `UPDATE REVIEW r
       JOIN PRODUCT p ON p.ProductID = r.ProductID
       SET r.HelpfulVotes = r.HelpfulVotes + 1
       WHERE r.ReviewID = ? AND p.Status = 'Active'`,
      [reviewId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Review not found' });
    }

    const [rows] = await db.query(
      'SELECT HelpfulVotes FROM REVIEW WHERE ReviewID = ?',
      [reviewId]
    );
    res.json({
      success: true,
      helpfulVotes: rows[0].HelpfulVotes,
      message: 'Marked as helpful.'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { getProducts, getProductById, getSearchHistory, deleteSearchHistory, clearSearchHistory, createReview, markReviewHelpful };
