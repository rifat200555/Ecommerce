const db = require('../db/connection');

function addressFromBody(body) {
  return {
    addressLabel:  String(body.addressLabel || '').trim(),
    receiverName:  String(body.receiverName || '').trim(),
    phoneNumber:   String(body.phoneNumber || '').trim(),
    streetAddress: String(body.streetAddress || '').trim(),
    city:          String(body.city || '').trim(),
    district:      String(body.district || '').trim(),
    postalCode:    String(body.postalCode || '').trim(),
    country:       String(body.country || '').trim()
  };
}

function addressError(address) {
  if (!address.receiverName || !address.phoneNumber || !address.streetAddress ||
      !address.city || !address.district) {
    return 'Receiver name, phone, street address, city and district are required';
  }
  if (address.addressLabel.length > 100 || address.receiverName.length > 100 ||
      address.phoneNumber.length > 20 || address.streetAddress.length > 255 ||
      address.city.length > 50 || address.district.length > 50 ||
      address.postalCode.length > 50 || address.country.length > 50) {
    return 'One or more address fields are too long';
  }
  return null;
}

async function getAddresses(req, res) {
  try {
    const [addresses] = await db.query(
      `SELECT AddressID, AddressLabel, ReceiverName, PhoneNumber,
              StreetAddress, City, District, PostalCode, Country, IsDefault
       FROM ADDRESS
       WHERE UserID = ?
       ORDER BY IsDefault DESC, AddressID DESC`,
      [req.user.userId]
    );
    res.json({ success: true, addresses });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function createAddress(req, res) {
  try {
    const customerId = req.user.userId;
    const address = addressFromBody(req.body);
    const validationError = addressError(address);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const [result] = await db.query(
      `INSERT INTO ADDRESS
         (UserID, AddressLabel, ReceiverName, PhoneNumber, StreetAddress,
          City, District, PostalCode, Country, IsDefault)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [customerId, address.addressLabel || null, address.receiverName,
       address.phoneNumber, address.streetAddress, address.city,
       address.district, address.postalCode || null, address.country || null]
    );

    res.status(201).json({
      success: true,
      addressId: result.insertId,
      message: 'Address added.'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function updateAddress(req, res) {
  const customerId = req.user.userId;
  const addressId = Number(req.params.addressId);
  const address = addressFromBody(req.body);

  if (!Number.isInteger(addressId) || addressId <= 0) {
    return res.status(400).json({ message: 'Invalid address' });
  }
  const validationError = addressError(address);
  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [owned] = await conn.query(
      `SELECT AddressID, IsDefault FROM ADDRESS
       WHERE AddressID = ? AND UserID = ?
       FOR UPDATE`,
      [addressId, customerId]
    );
    if (owned.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Address not found' });
    }

    const [orders] = await conn.query(
      'SELECT OrderID FROM `ORDER` WHERE AddressID = ? LIMIT 1',
      [addressId]
    );

    if (orders.length > 0) {
      const wasDefault = Number(owned[0].IsDefault) === 1;
      const [result] = await conn.query(
        `INSERT INTO ADDRESS
           (UserID, AddressLabel, ReceiverName, PhoneNumber, StreetAddress,
            City, District, PostalCode, Country, IsDefault)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [customerId, address.addressLabel || null, address.receiverName,
         address.phoneNumber, address.streetAddress, address.city,
         address.district, address.postalCode || null,
         address.country || null, wasDefault ? 1 : 0]
      );

      if (wasDefault) {
        await conn.query(
          'UPDATE ADDRESS SET IsDefault = 0 WHERE AddressID = ? AND UserID = ?',
          [addressId, customerId]
        );
      }

      await conn.commit();
      return res.json({
        success: true,
        addressId: result.insertId,
        message: 'A new address was saved so previous orders keep their original address.'
      });
    }

    await conn.query(
      `UPDATE ADDRESS SET
         AddressLabel = ?, ReceiverName = ?, PhoneNumber = ?,
         StreetAddress = ?, City = ?, District = ?, PostalCode = ?, Country = ?
       WHERE AddressID = ? AND UserID = ?`,
      [address.addressLabel || null, address.receiverName, address.phoneNumber,
       address.streetAddress, address.city, address.district,
       address.postalCode || null, address.country || null,
       addressId, customerId]
    );

    await conn.commit();
    res.json({ success: true, addressId, message: 'Address updated.' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
}

async function deleteAddress(req, res) {
  try {
    const customerId = req.user.userId;
    const addressId = Number(req.params.addressId);
    if (!Number.isInteger(addressId) || addressId <= 0) {
      return res.status(400).json({ message: 'Invalid address' });
    }

    const [result] = await db.query(
      'DELETE FROM ADDRESS WHERE AddressID = ? AND UserID = ?',
      [addressId, customerId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Address not found' });
    }

    res.json({ success: true, message: 'Address deleted.' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({
        message: 'This address is used by an order and cannot be deleted'
      });
    }
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}

async function setDefaultAddress(req, res) {
  const customerId = req.user.userId;
  const addressId = Number(req.params.addressId);
  if (!Number.isInteger(addressId) || addressId <= 0) {
    return res.status(400).json({ message: 'Invalid address' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [owned] = await conn.query(
      `SELECT AddressID FROM ADDRESS
       WHERE AddressID = ? AND UserID = ?
       FOR UPDATE`,
      [addressId, customerId]
    );
    if (owned.length === 0) {
      await conn.rollback();
      return res.status(404).json({ message: 'Address not found' });
    }

    await conn.query(
      'UPDATE ADDRESS SET IsDefault = 0 WHERE UserID = ?',
      [customerId]
    );
    await conn.query(
      'UPDATE ADDRESS SET IsDefault = 1 WHERE AddressID = ? AND UserID = ?',
      [addressId, customerId]
    );

    await conn.commit();
    res.json({ success: true, message: 'Default address updated.' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  } finally {
    conn.release();
  }
}

module.exports = { getAddresses, createAddress, updateAddress, deleteAddress, setDefaultAddress };
