// =====================================================================
//  scripts/seedData.js
//
//  Fills an EMPTY database with a full set of test data:
//  11 users, 32 products, 26 orders, reviews, wallets, carts, wishlists.
//
//  It also writes a placeholder image file for every product, so the
//  image carousel actually shows something instead of broken links.
//
//  Run it with:   node scripts/seedData.js
//
//  ---------------------------------------------------------------
//  WARNING: this DELETES everything in the database first.
//  It is a reset button, not an add-more-data button.
//  Every password it creates is  123456
//  ---------------------------------------------------------------
//
//  HOW THIS FILE IS BUILT
//  The data lives in plain JavaScript arrays near the top. The code at
//  the bottom loops over them and writes the SQL. That way prices,
//  discounts and order totals are CALCULATED, never typed twice - so
//  they can never disagree with each other.
// =====================================================================

require('dotenv').config();
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const db = require('../db/connection');

// =====================================================================
//  SECTION 1 - THE DATA
// =====================================================================

// UserID is written out so the tables below can point at each other.
const USERS = [
  { id: 1,  name: 'Rakibul Hasan',   email: 'seller@gmail.com',  phone: '01711000001', joined: '2026-01-10' },
  { id: 2,  name: 'Nusrat Jahan',    email: 'seller2@gmail.com', phone: '01711000002', joined: '2026-01-22' },
  { id: 3,  name: 'Imran Kabir',     email: 'seller3@gmail.com', phone: '01711000003', joined: '2026-02-14' },
  { id: 4,  name: 'Site Admin',      email: 'admin@gmail.com',   phone: '01711000004', joined: '2026-01-01' },
  { id: 5,  name: 'Shakib Moderator',email: 'admin2@gmail.com',  phone: '01711000005', joined: '2026-01-05' },
  { id: 6,  name: 'Rafiq Islam',     email: 'rafiq@gmail.com',   phone: '01711000006', joined: '2026-02-05' },
  { id: 7,  name: 'Sadia Akter',     email: 'sadia@gmail.com',   phone: '01711000007', joined: '2026-02-20' },
  { id: 8,  name: 'Tanvir Ahmed',    email: 'tanvir@gmail.com',  phone: '01711000008', joined: '2026-03-02' },
  { id: 9,  name: 'Mim Chowdhury',   email: 'mim@gmail.com',     phone: '01711000009', joined: '2026-03-18' },
  { id: 10, name: 'Arif Hossain',    email: 'arif@gmail.com',    phone: '01711000010', joined: '2026-04-09' },
  { id: 11, name: 'Farhana Rahman',  email: 'farhana@gmail.com', phone: '01711000011', joined: '2026-04-25' }
];

const SELLERS = [
  { id: 1,  store: 'Hasan Electronics',   email: 'store@hasan.com',   phone: '01811000001', lic: 'TL-10001', status: 'Verified', joined: '2026-01-10' },
  { id: 2,  store: 'Nusrat Fashion',      email: 'store@nusrat.com',  phone: '01811000002', lic: 'TL-10002', status: 'Verified', joined: '2026-01-22' },
  { id: 3,  store: 'Kabir Home & Living', email: 'store@kabir.com',   phone: '01811000003', lic: 'TL-10003', status: 'Pending',  joined: '2026-02-14' },
  // Farhana is a CUSTOMER as well as a seller. Your ERD marks the
  // specialization "Overlapping", and this is what that looks like in
  // real rows: one USER row, one SELLER row, one CUSTOMER row.
  { id: 11, store: 'Farhana Crafts',      email: 'store@farhana.com', phone: '01811000011', lic: 'TL-10011', status: 'Pending',  joined: '2026-04-25' }
];

const ADMINS = [
  { id: 4, level: 'Super' },
  { id: 5, level: 'Standard' }
];

const CUSTOMERS = [
  { id: 6,  gender: 'Male',   dob: '1999-06-15' },
  { id: 7,  gender: 'Female', dob: '2001-11-02' },
  { id: 8,  gender: 'Male',   dob: '1997-01-28' },
  { id: 9,  gender: 'Female', dob: '2000-08-19' },
  { id: 10, gender: 'Male',   dob: '1995-12-04' },
  { id: 11, gender: 'Female', dob: '1998-03-27' }
];

// parent = null means a top-level category
const CATEGORIES = [
  { id: 1,  name: 'Electronics',   desc: 'All electronic goods',      parent: null },
  { id: 2,  name: 'Smartphone',    desc: 'Mobile phones',             parent: 1 },
  { id: 3,  name: 'Laptop',        desc: 'Laptops and notebooks',     parent: 1 },
  { id: 4,  name: 'Audio',         desc: 'Headphones and speakers',   parent: 1 },
  { id: 5,  name: 'Accessories',   desc: 'Cables, chargers, cases',   parent: 1 },
  { id: 6,  name: 'Fashion',       desc: 'Clothing and apparel',      parent: null },
  { id: 7,  name: "Men's Wear",    desc: 'Clothing for men',          parent: 6 },
  { id: 8,  name: "Women's Wear",  desc: 'Clothing for women',        parent: 6 },
  { id: 9,  name: 'Home & Living', desc: 'Household goods',           parent: null },
  { id: 10, name: 'Kitchen',       desc: 'Cookware and utensils',     parent: 9 },
  { id: 11, name: 'Furniture',     desc: 'Tables, chairs, storage',   parent: 9 },
  { id: 12, name: 'Bags',          desc: 'Bags and luggage',          parent: null }
];

const BRANDS = [
  { id: 1,  name: 'Apple' },     { id: 2,  name: 'Samsung' },
  { id: 3,  name: 'Xiaomi' },    { id: 4,  name: 'Anker' },
  { id: 5,  name: 'Sony' },      { id: 6,  name: 'Asus' },
  { id: 7,  name: 'HP' },        { id: 8,  name: 'Logitech' },
  { id: 9,  name: 'Aarong' },    { id: 10, name: 'Generic' }
];

// s = seller, c = category, b = brand
// The Status column is the whole story of a product:
//   Active   approved and on sale     (stock 0 = "out of stock")
//   Pending  waiting for an admin
//   Inactive the seller switched it off
//   Rejected the admin refused it
const PRODUCTS = [
  // ---- Hasan Electronics (seller 1) : ACTIVE, in stock ----
  { id: 1,  s: 1, c: 2,  b: 1,  name: 'iPhone 15 Pro',          price: 145000, disc: 8,  stock: 12,  status: 'Active',   warranty: '1 Year',  weight: 0.19, created: '2026-03-02', desc: '6.1 inch Super Retina XDR, A17 Pro chip, 256GB storage.' },
  { id: 2,  s: 1, c: 2,  b: 2,  name: 'Samsung Galaxy S24',     price: 120000, disc: 10, stock: 9,   status: 'Active',   warranty: '1 Year',  weight: 0.17, created: '2026-03-09', desc: 'Snapdragon 8 Gen 3, 120Hz AMOLED, 256GB.' },
  { id: 3,  s: 1, c: 4,  b: 1,  name: 'AirPods Pro 2',          price: 26500,  disc: 5,  stock: 30,  status: 'Active',   warranty: '1 Year',  weight: 0.06, created: '2026-03-15', desc: 'Active noise cancellation with USB-C charging case.' },
  { id: 4,  s: 1, c: 4,  b: 5,  name: 'Sony WH-1000XM5',        price: 38000,  disc: 12, stock: 7,   status: 'Active',   warranty: '1 Year',  weight: 0.25, created: '2026-03-21', desc: 'Over-ear wireless headphones, 30 hour battery.' },
  { id: 5,  s: 1, c: 5,  b: 4,  name: 'Anker PowerCore 20000',  price: 4200,   disc: 0,  stock: 40,  status: 'Active',   warranty: '1 Year',  weight: 0.42, created: '2026-04-02', desc: 'Dual port power bank with fast charging.' },
  { id: 6,  s: 1, c: 5,  b: 10, name: 'USB-C Cable 2m',         price: 950,    disc: 0,  stock: 120, status: 'Active',   warranty: '3 Month', weight: 0.08, created: '2026-04-11', desc: 'Braided nylon cable, 60W power delivery.' },
  { id: 7,  s: 1, c: 5,  b: 8,  name: 'Logitech MX Master 3S',  price: 11500,  disc: 7,  stock: 15,  status: 'Active',   warranty: '2 Year',  weight: 0.14, created: '2026-04-19', desc: 'Silent wireless mouse with MagSpeed scroll wheel.' },
  { id: 8,  s: 1, c: 3,  b: 6,  name: 'Asus Vivobook 15',       price: 68000,  disc: 5,  stock: 6,   status: 'Active',   warranty: '2 Year',  weight: 1.70, created: '2026-05-04', desc: 'Core i5 13th gen, 16GB RAM, 512GB SSD.' },
  { id: 9,  s: 1, c: 5,  b: 4,  name: 'Fast Charger 65W',       price: 3200,   disc: 0,  stock: 55,  status: 'Active',   warranty: '1 Year',  weight: 0.12, created: '2026-05-18', desc: 'GaN charger with two USB-C and one USB-A port.' },
  { id: 10, s: 1, c: 4,  b: 2,  name: 'Galaxy Buds 2 Pro',      price: 17500,  disc: 15, stock: 22,  status: 'Active',   warranty: '1 Year',  weight: 0.05, created: '2026-06-01', desc: 'Compact earbuds with 360 audio.' },

  // ---- Hasan Electronics : ACTIVE but stock hit zero (out of stock) ----
  { id: 11, s: 1, c: 2,  b: 3,  name: 'Xiaomi Redmi Note 13',   price: 28000,  disc: 6,  stock: 0,   status: 'Active',   warranty: '1 Year',  weight: 0.19, created: '2026-04-26', desc: 'Budget 5G phone, 108MP camera, 128GB.' },
  { id: 12, s: 1, c: 5,  b: 10, name: 'Screen Protector Pack',  price: 650,    disc: 0,  stock: 0,   status: 'Active',   warranty: null,      weight: 0.02, created: '2026-05-27', desc: 'Pack of three tempered glass protectors.' },
  { id: 13, s: 1, c: 5,  b: 7,  name: 'HP Laptop Sleeve 15',    price: 1800,   disc: 0,  stock: 0,   status: 'Active',   warranty: '6 Month', weight: 0.30, created: '2026-06-14', desc: 'Padded sleeve for 15 inch laptops.' },

  // ---- Hasan Electronics : PENDING (waiting for the admin) ----
  { id: 14, s: 1, c: 3,  b: 1,  name: 'iPad Air M2',            price: 92000,  disc: 0,  stock: 8,   status: 'Pending',  warranty: '1 Year',  weight: 0.46, created: '2026-08-20', desc: '11 inch Liquid Retina, M2 chip, WiFi 128GB.' },
  { id: 15, s: 1, c: 5,  b: 3,  name: 'Smart Watch Pro S2',     price: 8900,   disc: 0,  stock: 25,  status: 'Pending',  warranty: '1 Year',  weight: 0.04, created: '2026-08-22', desc: 'AMOLED display, heart rate and SpO2 tracking.' },
  { id: 16, s: 1, c: 5,  b: 4,  name: 'USB-C Hub 7in1',         price: 2900,   disc: 0,  stock: 18,  status: 'Pending',  warranty: '6 Month', weight: 0.15, created: '2026-08-24', desc: 'HDMI, SD card, three USB-A and 100W passthrough.' },
  { id: 17, s: 1, c: 5,  b: 10, name: 'Mechanical Keyboard K7', price: 6400,   disc: 0,  stock: 12,  status: 'Pending',  warranty: '1 Year',  weight: 0.85, created: '2026-08-25', desc: 'Hot-swappable switches with RGB backlight.' },
  { id: 18, s: 1, c: 5,  b: 8,  name: 'Webcam 1080p',           price: 3500,   disc: 0,  stock: 20,  status: 'Pending',  warranty: '1 Year',  weight: 0.11, created: '2026-08-26', desc: 'Full HD webcam with built-in microphone.' },

  // ---- Hasan Electronics : INACTIVE (seller switched them off) ----
  { id: 19, s: 1, c: 4,  b: 10, name: 'Old Wired Headphone',    price: 1200,   disc: 0,  stock: 5,   status: 'Inactive', warranty: null,      weight: 0.30, created: '2026-02-11', desc: 'Basic wired over-ear headphone with 3.5mm jack.' },
  { id: 20, s: 1, c: 4,  b: 10, name: 'Mini Bluetooth Speaker', price: 2400,   disc: 0,  stock: 8,   status: 'Inactive', warranty: '6 Month', weight: 0.28, created: '2026-02-25', desc: 'Portable speaker, 8 hour playback.' },

  // ---- Hasan Electronics : REJECTED by the admin ----
  { id: 21, s: 1, c: 5,  b: 10, name: 'Cheap Power Adapter',    price: 300,    disc: 0,  stock: 50,  status: 'Rejected', warranty: null,      weight: 0.09, created: '2026-08-18', desc: 'Unbranded wall adapter.' },

  // ---- Nusrat Fashion (seller 2) ----
  { id: 22, s: 2, c: 8,  b: 9,  name: 'Handloom Cotton Saree',  price: 4500,   disc: 0,  stock: 20,  status: 'Active',   warranty: null,      weight: 0.45, created: '2026-02-28', desc: 'Traditional handloom cotton saree with blouse piece.' },
  { id: 23, s: 2, c: 8,  b: 9,  name: 'Silk Saree Premium',     price: 12000,  disc: 10, stock: 8,   status: 'Active',   warranty: null,      weight: 0.50, created: '2026-03-30', desc: 'Pure silk saree with zari border.' },
  { id: 24, s: 2, c: 7,  b: 9,  name: "Men's Panjabi",          price: 2400,   disc: 5,  stock: 30,  status: 'Active',   warranty: null,      weight: 0.38, created: '2026-04-14', desc: 'Full sleeve cotton panjabi, embroidered collar.' },
  { id: 25, s: 2, c: 8,  b: 10, name: 'Kurti Set',              price: 3200,   disc: 0,  stock: 0,   status: 'Active',   warranty: null,      weight: 0.40, created: '2026-05-09', desc: 'Three piece kurti set with dupatta.' },
  { id: 26, s: 2, c: 7,  b: 10, name: 'Denim Jacket',           price: 3800,   disc: 0,  stock: 15,  status: 'Pending',  warranty: null,      weight: 0.75, created: '2026-08-23', desc: 'Washed denim jacket, unisex fit.' },
  { id: 27, s: 2, c: 8,  b: 10, name: 'Winter Shawl',           price: 1900,   disc: 0,  stock: 25,  status: 'Pending',  warranty: null,      weight: 0.35, created: '2026-08-25', desc: 'Woollen shawl, hand-woven pattern.' },

  // ---- Kabir Home & Living (seller 3) ----
  { id: 28, s: 3, c: 10, b: 10, name: 'Non-stick Frypan 26cm',  price: 2200,   disc: 0,  stock: 18,  status: 'Active',   warranty: '1 Year',  weight: 0.90, created: '2026-03-06', desc: 'Granite coated frypan, induction compatible.' },
  { id: 29, s: 3, c: 11, b: 10, name: 'Wooden Study Table',     price: 9500,   disc: 5,  stock: 5,   status: 'Active',   warranty: '2 Year',  weight: 18.0, created: '2026-04-20', desc: 'Solid wood table with two drawers.' },
  { id: 30, s: 3, c: 10, b: 10, name: 'Ceramic Dinner Set 24pc',price: 6800,   disc: 0,  stock: 10,  status: 'Pending',  warranty: null,      weight: 7.50, created: '2026-08-24', desc: 'Twenty-four piece ceramic dinner set.' },
  { id: 31, s: 3, c: 11, b: 10, name: 'LED Table Lamp',         price: 1450,   disc: 0,  stock: 0,   status: 'Active',   warranty: '1 Year',  weight: 0.60, created: '2026-06-08', desc: 'Dimmable LED lamp with USB charging port.' },

  // ---- Farhana Crafts (seller 11) ----
  { id: 32, s: 11, c: 12, b: 10, name: 'Handmade Jute Bag',     price: 850,    disc: 0,  stock: 40,  status: 'Active',   warranty: null,      weight: 0.22, created: '2026-05-15', desc: 'Eco-friendly jute tote bag, hand stitched.' }
];

const ADDRESSES = [
  { id: 1,  user: 6,  label: 'Home',   name: 'Rafiq Islam',    phone: '01711000006', street: 'House 12, Road 5, Dhanmondi', city: 'Dhaka',      district: 'Dhaka',      post: '1205', def: 1 },
  { id: 2,  user: 6,  label: 'Office', name: 'Rafiq Islam',    phone: '01711000006', street: 'Gulshan 1, Plot 22',          city: 'Dhaka',      district: 'Dhaka',      post: '1212', def: 0 },
  { id: 3,  user: 7,  label: 'Home',   name: 'Sadia Akter',    phone: '01711000007', street: 'Flat 3B, Mirpur 10',          city: 'Dhaka',      district: 'Dhaka',      post: '1216', def: 1 },
  { id: 4,  user: 8,  label: 'Home',   name: 'Tanvir Ahmed',   phone: '01711000008', street: 'GEC Circle, Level 4',         city: 'Chattogram', district: 'Chattogram', post: '4000', def: 1 },
  { id: 5,  user: 9,  label: 'Home',   name: 'Mim Chowdhury',  phone: '01711000009', street: 'Zindabazar Main Road',        city: 'Sylhet',     district: 'Sylhet',     post: '3100', def: 1 },
  { id: 6,  user: 10, label: 'Home',   name: 'Arif Hossain',   phone: '01711000010', street: 'Kazi Nazrul Ave, Sector 7',   city: 'Dhaka',      district: 'Dhaka',      post: '1230', def: 1 },
  { id: 7,  user: 10, label: 'Office', name: 'Arif Hossain',   phone: '01711000010', street: 'Motijheel C/A, Building 9',   city: 'Dhaka',      district: 'Dhaka',      post: '1000', def: 0 },
  { id: 8,  user: 11, label: 'Home',   name: 'Farhana Rahman', phone: '01711000011', street: 'Shahjadpur, Block C',         city: 'Dhaka',      district: 'Dhaka',      post: '1212', def: 1 }
];

const PAYMENT_METHODS = [
  { id: 1, name: 'Cash on Delivery', desc: 'Pay the rider when the parcel arrives' },
  { id: 2, name: 'bKash',            desc: 'Mobile financial service' },
  { id: 3, name: 'Card',             desc: 'Visa / Mastercard' },
  { id: 4, name: 'Wallet',           desc: 'Pay from in-app wallet balance' }
];

// cust = CustomerID, addr = AddressID, pay = PaymentMethodID
// items = [{ p: ProductID, q: Quantity }]
//
// Prices are NOT written here. The script looks each product up in
// PRODUCTS and works out UnitPrice, Discount, SubTotal and the order
// total. That is why the numbers can never drift apart.
const ORDERS = [
  // ---------- DELIVERED (these make up Total Sales) ----------
  { id: 1001, cust: 6,  addr: 1, pay: 2, date: '2026-05-06 10:20:00', status: 'Delivered', paid: 'Paid',     items: [{ p: 1, q: 1 }] },
  { id: 1002, cust: 7,  addr: 3, pay: 3, date: '2026-05-14 14:05:00', status: 'Delivered', paid: 'Paid',     items: [{ p: 3, q: 1 }, { p: 6, q: 2 }] },
  { id: 1003, cust: 8,  addr: 4, pay: 1, date: '2026-05-23 09:45:00', status: 'Delivered', paid: 'Paid',     items: [{ p: 5, q: 2 }] },
  { id: 1004, cust: 6,  addr: 1, pay: 4, date: '2026-06-02 16:30:00', status: 'Delivered', paid: 'Paid',     items: [{ p: 11, q: 1 }, { p: 12, q: 1 }] },
  { id: 1005, cust: 9,  addr: 5, pay: 2, date: '2026-06-11 11:00:00', status: 'Delivered', paid: 'Paid',     items: [{ p: 4, q: 1 }] },
  { id: 1006, cust: 10, addr: 6, pay: 3, date: '2026-06-19 19:10:00', status: 'Delivered', paid: 'Paid',     items: [{ p: 8, q: 1 }, { p: 13, q: 1 }] },
  { id: 1007, cust: 7,  addr: 3, pay: 2, date: '2026-06-28 08:25:00', status: 'Delivered', paid: 'Paid',     items: [{ p: 22, q: 1 }, { p: 24, q: 2 }] },
  { id: 1008, cust: 11, addr: 8, pay: 1, date: '2026-07-04 13:40:00', status: 'Delivered', paid: 'Paid',     items: [{ p: 28, q: 1 }] },
  { id: 1009, cust: 8,  addr: 4, pay: 4, date: '2026-07-12 17:55:00', status: 'Delivered', paid: 'Paid',     items: [{ p: 7, q: 1 }, { p: 9, q: 1 }] },
  { id: 1010, cust: 9,  addr: 5, pay: 2, date: '2026-07-21 12:15:00', status: 'Delivered', paid: 'Paid',     items: [{ p: 10, q: 2 }] },
  { id: 1011, cust: 6,  addr: 2, pay: 3, date: '2026-07-29 20:35:00', status: 'Delivered', paid: 'Paid',     items: [{ p: 23, q: 1 }] },
  { id: 1012, cust: 10, addr: 7, pay: 1, date: '2026-08-03 10:05:00', status: 'Delivered', paid: 'Paid',     items: [{ p: 2, q: 1 }] },

  // ---------- CANCELLED ----------
  { id: 1013, cust: 7,  addr: 3, pay: 2, date: '2026-07-08 15:20:00', status: 'Cancelled', paid: 'Refunded', items: [{ p: 6, q: 3 }] },
  { id: 1014, cust: 9,  addr: 5, pay: 1, date: '2026-08-06 09:10:00', status: 'Cancelled', paid: 'Unpaid',   items: [{ p: 29, q: 1 }] },

  // ---------- SHIPPED ----------
  { id: 1015, cust: 6,  addr: 1, pay: 3, date: '2026-08-14 11:30:00', status: 'Shipped',   paid: 'Paid',     items: [{ p: 3, q: 2 }] },
  { id: 1016, cust: 8,  addr: 4, pay: 2, date: '2026-08-16 14:45:00', status: 'Shipped',   paid: 'Paid',     items: [{ p: 32, q: 3 }] },
  { id: 1017, cust: 10, addr: 6, pay: 1, date: '2026-08-18 18:00:00', status: 'Shipped',   paid: 'Unpaid',   items: [{ p: 9, q: 2 }, { p: 6, q: 1 }] },

  // ---------- PROCESSING ----------
  { id: 1018, cust: 7,  addr: 3, pay: 4, date: '2026-08-20 09:25:00', status: 'Processing',paid: 'Paid',     items: [{ p: 4, q: 1 }] },
  { id: 1019, cust: 11, addr: 8, pay: 2, date: '2026-08-21 16:40:00', status: 'Processing',paid: 'Paid',     items: [{ p: 24, q: 1 }, { p: 22, q: 1 }] },
  { id: 1020, cust: 9,  addr: 5, pay: 1, date: '2026-08-22 12:55:00', status: 'Processing',paid: 'Unpaid',   items: [{ p: 28, q: 2 }] },

  // ---------- PENDING (the seller has not accepted them yet) ----------
  { id: 1021, cust: 6,  addr: 1, pay: 2, date: '2026-08-23 10:15:00', status: 'Pending',   paid: 'Paid',     items: [{ p: 1, q: 1 }] },
  { id: 1022, cust: 8,  addr: 4, pay: 1, date: '2026-08-24 13:20:00', status: 'Pending',   paid: 'Unpaid',   items: [{ p: 10, q: 1 }, { p: 5, q: 1 }] },
  { id: 1023, cust: 10, addr: 6, pay: 4, date: '2026-08-25 08:50:00', status: 'Pending',   paid: 'Paid',     items: [{ p: 7, q: 2 }] },
  { id: 1024, cust: 7,  addr: 3, pay: 1, date: '2026-08-25 19:05:00', status: 'Pending',   paid: 'Unpaid',   items: [{ p: 8, q: 1 }] },
  { id: 1025, cust: 9,  addr: 5, pay: 2, date: '2026-08-26 11:35:00', status: 'Pending',   paid: 'Paid',     items: [{ p: 23, q: 1 }, { p: 25, q: 1 }] },
  { id: 1026, cust: 11, addr: 8, pay: 3, date: '2026-08-26 17:10:00', status: 'Pending',   paid: 'Unpaid',   items: [{ p: 29, q: 1 }] }
];

// cust = who wrote it, p = which product. Only products the customer
// actually received (a Delivered order) get a review.
const REVIEWS = [
  { cust: 6,  p: 1,  rating: 5, votes: 24, date: '2026-05-12', text: 'Battery easily lasts a full day. Camera is superb in low light.' },
  { cust: 6,  p: 11, rating: 3, votes: 4,  date: '2026-06-09', text: 'Decent for the price but the screen scratches easily.' },
  { cust: 6,  p: 12, rating: 4, votes: 2,  date: '2026-06-09', text: 'Fits well, no bubbles when applied carefully.' },
  { cust: 7,  p: 3,  rating: 5, votes: 18, date: '2026-05-20', text: 'Noise cancelling is genuinely impressive on a bus.' },
  { cust: 7,  p: 6,  rating: 4, votes: 3,  date: '2026-05-20', text: 'Braiding feels sturdy. Charges my laptop fine.' },
  { cust: 7,  p: 22, rating: 5, votes: 11, date: '2026-07-06', text: 'Fabric quality is lovely and the colour did not run.' },
  { cust: 7,  p: 24, rating: 4, votes: 6,  date: '2026-07-06', text: 'Good stitching. Slightly loose around the shoulders.' },
  { cust: 8,  p: 5,  rating: 4, votes: 9,  date: '2026-05-30', text: 'Charges my phone three times over. A bit heavy to carry.' },
  { cust: 8,  p: 7,  rating: 5, votes: 15, date: '2026-07-19', text: 'The scroll wheel alone is worth the money.' },
  { cust: 8,  p: 9,  rating: 5, votes: 7,  date: '2026-07-19', text: 'Small, fast, and it charges the laptop and phone together.' },
  { cust: 9,  p: 4,  rating: 5, votes: 21, date: '2026-06-18', text: 'Best headphones I have owned. Very comfortable for long flights.' },
  { cust: 9,  p: 10, rating: 4, votes: 5,  date: '2026-07-27', text: 'Sound is great, case feels a little plasticky.' },
  { cust: 10, p: 8,  rating: 4, votes: 12, date: '2026-06-26', text: 'Handles my coursework easily. Fan gets loud under load.' },
  { cust: 10, p: 13, rating: 3, votes: 1,  date: '2026-06-26', text: 'Does the job but the padding is thinner than expected.' },
  { cust: 10, p: 2,  rating: 5, votes: 8,  date: '2026-08-10', text: 'The 120Hz screen makes everything feel smooth.' },
  { cust: 11, p: 28, rating: 4, votes: 6,  date: '2026-07-11', text: 'Nothing sticks to it. Handle gets warm though.' },
  { cust: 6,  p: 23, rating: 5, votes: 14, date: '2026-08-05', text: 'Gorgeous zari work, exactly like the photos.' }
];

const WALLETS = [
  { id: 1, cust: 6,  balance: 5000.00,  points: 320 },
  { id: 2, cust: 7,  balance: 1250.50,  points: 140 },
  { id: 3, cust: 8,  balance: 800.00,   points: 60  },
  { id: 4, cust: 9,  balance: 12400.00, points: 510 },
  { id: 5, cust: 10, balance: 340.75,   points: 25  },
  { id: 6, cust: 11, balance: 2600.00,  points: 180 }
];

const CART_ITEMS = [
  { cust: 6,  p: 3,  q: 1 }, { cust: 6,  p: 9,  q: 2 },
  { cust: 7,  p: 1,  q: 1 }, { cust: 7,  p: 10, q: 1 },
  { cust: 8,  p: 22, q: 2 }, { cust: 9,  p: 8,  q: 1 },
  { cust: 10, p: 5,  q: 3 }, { cust: 11, p: 28, q: 1 },
  { cust: 11, p: 29, q: 1 }
];

const WISHLIST_ITEMS = [
  { cust: 6,  p: 2  }, { cust: 6,  p: 8  }, { cust: 7,  p: 4 },
  { cust: 7,  p: 23 }, { cust: 8,  p: 1  }, { cust: 9,  p: 7 },
  { cust: 9,  p: 32 }, { cust: 10, p: 10 }, { cust: 11, p: 22 }
];

const SEARCHES = [
  { cust: 6,  word: 'iphone',      results: 2, time: '2026-08-20 10:00:00' },
  { cust: 6,  word: 'charger',     results: 3, time: '2026-08-21 11:30:00' },
  { cust: 7,  word: 'earbuds',     results: 2, time: '2026-08-22 15:45:00' },
  { cust: 7,  word: 'saree',       results: 2, time: '2026-08-23 09:12:00' },
  { cust: 8,  word: 'power bank',  results: 1, time: '2026-08-23 18:20:00' },
  { cust: 9,  word: 'laptop',      results: 1, time: '2026-08-24 14:05:00' },
  { cust: 10, word: 'headphone',   results: 3, time: '2026-08-25 16:40:00' },
  { cust: 11, word: 'jute bag',    results: 1, time: '2026-08-26 08:30:00' },
  { cust: 6,  word: 'keyboard',    results: 0, time: '2026-08-26 21:15:00' }
];

const DELIVERY_CHARGE = 60;

// =====================================================================
//  SECTION 2 - PLACEHOLDER IMAGES
//
//  A database row is only a PATH. The picture itself has to exist on
//  disk or the browser shows a broken image. Since we are not shipping
//  real photos, the script draws simple coloured SVG files instead -
//  SVG is plain text, so no image library is needed.
//
//  Delete these and upload real photos through the Edit form whenever
//  you like; nothing depends on them.
// =====================================================================

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'products');

const COLOURS = ['#1e3a8a', '#065f46', '#7c2d12', '#4c1d95', '#831843',
                 '#0f766e', '#9a3412', '#1e40af', '#3f6212', '#7e22ce'];

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function writePlaceholder(filePath, title, subtitle, colour) {
  const svg =
`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <rect width="600" height="600" fill="${colour}"/>
  <circle cx="300" cy="210" r="86" fill="rgba(255,255,255,0.10)"/>
  <text x="300" y="330" font-family="sans-serif" font-size="30" font-weight="bold"
        fill="#ffffff" text-anchor="middle">${escapeXml(title)}</text>
  <text x="300" y="372" font-family="sans-serif" font-size="20"
        fill="rgba(255,255,255,0.65)" text-anchor="middle">${escapeXml(subtitle)}</text>
</svg>`;
  fs.writeFileSync(filePath, svg, 'utf8');
}

// Long names get cut so they do not run off the edge of the square.
function trim(text, max) {
  const s = String(text);
  return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
}

function buildImages() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const rows = [];
  const views = ['Front view', 'Side view', 'In the box'];

  for (const p of PRODUCTS) {
    const colour = COLOURS[p.id % COLOURS.length];
    // 2 or 3 pictures each, so the carousel arrows have work to do
    const count = (p.id % 3 === 0) ? 3 : 2;

    for (let n = 1; n <= count; n++) {
      const fileName = `p${p.id}-${n}.svg`;
      writePlaceholder(
        path.join(UPLOAD_DIR, fileName),
        trim(p.name, 22),
        views[n - 1],
        colour
      );

      rows.push({
        productId: p.id,
        n,
        url: '/uploads/products/' + fileName,
        caption: views[n - 1],
        primary: n === 1 ? 1 : 0
      });
    }
  }
  return rows;
}

// =====================================================================
//  SECTION 3 - WRITE IT ALL TO THE DATABASE
// =====================================================================

// Turns [[1,'a'], [2,'b']] into "(?,?),(?,?)" plus a flat value list,
// so a whole table goes in with ONE query instead of one per row.
function bulk(rows) {
  const placeholders = rows.map(r => '(' + r.map(() => '?').join(',') + ')').join(',');
  const values = [];
  for (const r of rows) for (const v of r) values.push(v);
  return { placeholders, values };
}

async function insertMany(conn, table, columns, rows) {
  if (rows.length === 0) return;
  const { placeholders, values } = bulk(rows);
  await conn.query(
    `INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders}`,
    values
  );
}

function findProduct(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) throw new Error('Order refers to product ' + id + ' which does not exist');
  return p;
}

async function run() {
  const conn = await db.getConnection();

  try {
    // -----------------------------------------------------------------
    //  WIPE
    //
    //  MySQL normally refuses to empty a table another one points at.
    //  Turning the checks off for a moment lets us clear in any order.
    //  TRUNCATE also resets AUTO_INCREMENT to 1, which matters because
    //  the data above hardcodes ids 1, 2, 3...
    // -----------------------------------------------------------------
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    const tables = [
      'TRANSACTION', 'WALLET', 'REVIEW', 'ORDER_ITEM', '`ORDER`',
      'PAYMENT_METHOD', 'SEARCH_HISTORY', 'WISHLIST_ITEM', 'CART_ITEM',
      'ADDRESS', 'PRODUCT_IMAGE', 'PRODUCT', 'BRAND', 'CATEGORY',
      'ADMIN', 'SELLER', 'CUSTOMER', '`USER`'
    ];
    for (const t of tables) await conn.query(`TRUNCATE TABLE ${t}`);

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('cleared all tables');

    // -----------------------------------------------------------------
    //  USERS
    //  One hash reused, because everybody shares the same test password.
    //  bcrypt is deliberately slow, so hashing once instead of eleven
    //  times keeps the script quick.
    // -----------------------------------------------------------------
    const hash = await bcrypt.hash('123456', 10);

    await insertMany(conn, '`USER`',
      ['UserID', 'FullName', 'Email', 'PasswordHash', 'Phone', 'RegistrationDate'],
      USERS.map(u => [u.id, u.name, u.email, hash, u.phone, u.joined]));

    await insertMany(conn, 'SELLER',
      ['UserID', 'StoreName', 'BusinessEmail', 'BusinessPhone',
       'TradeLicenseNumber', 'VerificationStatus', 'JoinedDate'],
      SELLERS.map(s => [s.id, s.store, s.email, s.phone, s.lic, s.status, s.joined]));

    await insertMany(conn, 'ADMIN',
      ['UserID', 'AccessLevel'],
      ADMINS.map(a => [a.id, a.level]));

    await insertMany(conn, 'CUSTOMER',
      ['UserID', 'Gender', 'DateOfBirth'],
      CUSTOMERS.map(c => [c.id, c.gender, c.dob]));

    console.log(`${USERS.length} users  (${SELLERS.length} sellers, ${ADMINS.length} admins, ${CUSTOMERS.length} customers)`);

    // -----------------------------------------------------------------
    //  CATALOGUE
    //  Categories go in parent-first order so the self-referencing
    //  foreign key always finds its target.
    // -----------------------------------------------------------------
    const sortedCats = CATEGORIES.slice().sort((a, b) => (a.parent === null ? -1 : 1));
    await insertMany(conn, 'CATEGORY',
      ['CategoryID', 'CategoryName', 'Description', 'ParentID'],
      sortedCats.map(c => [c.id, c.name, c.desc, c.parent]));

    await insertMany(conn, 'BRAND',
      ['BrandID', 'BrandName', 'LogoURL'],
      BRANDS.map(b => [b.id, b.name, null]));

    await insertMany(conn, 'PRODUCT',
      ['ProductID', 'SellerID', 'CategoryID', 'BrandID', 'ProductName',
       'Description', 'UnitPrice', 'Discount', 'StockQuantity', 'Status',
       'Warranty', 'Weight', 'CreatedAt'],
      PRODUCTS.map(p => [p.id, p.s, p.c, p.b, p.name, p.desc, p.price,
                         p.disc, p.stock, p.status, p.warranty, p.weight, p.created]));

    console.log(`${CATEGORIES.length} categories, ${BRANDS.length} brands, ${PRODUCTS.length} products`);

    // -----------------------------------------------------------------
    //  IMAGES  (files on disk + rows in the database)
    // -----------------------------------------------------------------
    const imageRows = buildImages();
    await insertMany(conn, 'PRODUCT_IMAGE',
      ['ProductID', 'ImageNumber', 'ImageURL', 'Caption', 'IsPrimary', 'DisplayOrder'],
      imageRows.map(i => [i.productId, i.n, i.url, i.caption, i.primary, i.n]));

    console.log(`${imageRows.length} placeholder images written to public/uploads/products/`);

    // -----------------------------------------------------------------
    //  ADDRESSES + PAYMENT METHODS
    // -----------------------------------------------------------------
    await insertMany(conn, 'ADDRESS',
      ['AddressID', 'UserID', 'AddressLabel', 'ReceiverName', 'PhoneNumber',
       'StreetAddress', 'City', 'District', 'PostalCode', 'IsDefault'],
      ADDRESSES.map(a => [a.id, a.user, a.label, a.name, a.phone,
                          a.street, a.city, a.district, a.post, a.def]));

    await insertMany(conn, 'PAYMENT_METHOD',
      ['PaymentMethodID', 'MethodName', 'Description'],
      PAYMENT_METHODS.map(m => [m.id, m.name, m.desc]));

    // -----------------------------------------------------------------
    //  ORDERS
    //
    //  Here is where the calculating happens:
    //     SubTotal    = Quantity * UnitPrice * (1 - Discount/100)
    //     TotalAmount = every SubTotal added up, plus delivery
    //  Nothing is typed twice, so nothing can disagree.
    //
    //  UnitPrice is copied into ORDER_ITEM as a SNAPSHOT. If the seller
    //  raises the price tomorrow, this invoice must still show today's.
    // -----------------------------------------------------------------
    const orderRows = [];
    const itemRows = [];

    for (const o of ORDERS) {
      let total = 0;
      let discountTotal = 0;
      let itemNo = 1;

      for (const it of o.items) {
        const p = findProduct(it.p);
        const gross = it.q * p.price;
        const subTotal = gross * (1 - p.disc / 100);

        total += subTotal;
        discountTotal += gross - subTotal;

        itemRows.push([o.id, itemNo, p.id, it.q, p.price, p.disc,
                       Number(subTotal.toFixed(2))]);
        itemNo++;
      }

      orderRows.push([
        o.id, o.cust, o.addr, o.pay, o.date, o.status, o.paid,
        Number((total + DELIVERY_CHARGE).toFixed(2)),
        Number(discountTotal.toFixed(2)),
        DELIVERY_CHARGE
      ]);
    }

    await insertMany(conn, '`ORDER`',
      ['OrderID', 'CustomerID', 'AddressID', 'PaymentMethodID', 'OrderDate',
       'OrderStatus', 'PaymentStatus', 'TotalAmount', 'DiscountAmount', 'DeliveryCharge'],
      orderRows);

    await insertMany(conn, 'ORDER_ITEM',
      ['OrderID', 'ItemNo', 'ProductID', 'Quantity', 'UnitPrice', 'Discount', 'SubTotal'],
      itemRows);

    console.log(`${ORDERS.length} orders holding ${itemRows.length} items`);

    // -----------------------------------------------------------------
    //  REVIEWS
    // -----------------------------------------------------------------
    await insertMany(conn, 'REVIEW',
      ['ProductID', 'CustomerID', 'Rating', 'ReviewText', 'HelpfulVotes', 'ReviewDate'],
      REVIEWS.map(r => [r.p, r.cust, r.rating, r.text, r.votes, r.date]));

    // PRODUCT.AverageRating is a stored copy of something the REVIEW
    // table already knows. Recalculating it here keeps the two in step.
    // In the real app this same UPDATE should run whenever a review is
    // added - that is still on the to-do list.
    await conn.query(`
      UPDATE PRODUCT p
      SET AverageRating = COALESCE(
        (SELECT AVG(r.Rating) FROM REVIEW r WHERE r.ProductID = p.ProductID), 0)
    `);

    console.log(`${REVIEWS.length} reviews, product ratings recalculated`);

    // -----------------------------------------------------------------
    //  WALLETS + TRANSACTIONS
    //  Every Paid order gets a Payment row; every Refunded one gets a
    //  Refund row. That mirrors what the Cancel button does live.
    // -----------------------------------------------------------------
    await insertMany(conn, 'WALLET',
      ['WalletID', 'CustomerID', 'CurrentBalance', 'RewardPoints'],
      WALLETS.map(w => [w.id, w.cust, w.balance, w.points]));

    const walletOf = {};
    for (const w of WALLETS) walletOf[w.cust] = w.id;

    const txRows = [];
    for (const w of WALLETS) {
      txRows.push([w.id, null, 'TopUp', 10000.00, 'Success', '2026-05-01 09:00:00']);
    }
    for (let i = 0; i < ORDERS.length; i++) {
      const o = ORDERS[i];
      const amount = orderRows[i][7];          // TotalAmount, already computed
      const wid = walletOf[o.cust];
      if (!wid) continue;

      if (o.paid === 'Paid') {
        txRows.push([wid, o.id, 'Payment', amount, 'Success', o.date]);
      } else if (o.paid === 'Refunded') {
        txRows.push([wid, o.id, 'Payment', amount, 'Success', o.date]);
        txRows.push([wid, o.id, 'Refund',  amount, 'Success', o.date]);
      }
    }

    await insertMany(conn, 'TRANSACTION',
      ['WalletID', 'OrderID', 'TransactionType', 'Amount', 'Status', 'TransactionDate'],
      txRows);

    console.log(`${WALLETS.length} wallets, ${txRows.length} transactions`);

    // -----------------------------------------------------------------
    //  CART, WISHLIST, SEARCH HISTORY
    // -----------------------------------------------------------------
    await insertMany(conn, 'CART_ITEM',
      ['CustomerID', 'ProductID', 'Quantity'],
      CART_ITEMS.map(c => [c.cust, c.p, c.q]));

    await insertMany(conn, 'WISHLIST_ITEM',
      ['CustomerID', 'ProductID'],
      WISHLIST_ITEMS.map(w => [w.cust, w.p]));

    await insertMany(conn, 'SEARCH_HISTORY',
      ['CustomerID', 'SearchKeyword', 'TotalResult', 'SearchTime'],
      SEARCHES.map(s => [s.cust, s.word, s.results, s.time]));

    console.log(`${CART_ITEMS.length} cart items, ${WISHLIST_ITEMS.length} wishlist items, ${SEARCHES.length} searches`);

    // -----------------------------------------------------------------
    //  SUMMARY - read the numbers back out so you can check the
    //  dashboard against them.
    // -----------------------------------------------------------------
    console.log('');
    console.log('======================================================');
    console.log('  SEED COMPLETE');
    console.log('======================================================');
    console.log('  Every password is  123456');
    console.log('');
    console.log('  SELLERS');
    console.log('    seller@gmail.com    Hasan Electronics    (Verified)');
    console.log('    seller2@gmail.com   Nusrat Fashion       (Verified)');
    console.log('    seller3@gmail.com   Kabir Home & Living  (Pending)');
    console.log('    farhana@gmail.com   Farhana Crafts       (also a customer)');
    console.log('');
    console.log('  ADMINS');
    console.log('    admin@gmail.com     Super');
    console.log('    admin2@gmail.com    Standard');
    console.log('');
    console.log('  CUSTOMERS');
    console.log('    rafiq@gmail.com   sadia@gmail.com   tanvir@gmail.com');
    console.log('    mim@gmail.com     arif@gmail.com    farhana@gmail.com');
    console.log('');

    for (const s of SELLERS) {
      const [[t]] = await conn.query(
        'SELECT COUNT(*) AS n FROM PRODUCT WHERE SellerID = ?', [s.id]);
      const [[a]] = await conn.query(
        "SELECT COUNT(*) AS n FROM PRODUCT WHERE SellerID = ? AND Status='Active' AND StockQuantity>0", [s.id]);
      const [[pd]] = await conn.query(
        "SELECT COUNT(*) AS n FROM PRODUCT WHERE SellerID = ? AND Status='Pending'", [s.id]);
      const [[oos]] = await conn.query(
        "SELECT COUNT(*) AS n FROM PRODUCT WHERE SellerID = ? AND Status='Active' AND StockQuantity=0", [s.id]);
      const [[po]] = await conn.query(
        `SELECT COUNT(DISTINCT o.OrderID) AS n
         FROM \`ORDER\` o
         JOIN ORDER_ITEM oi ON oi.OrderID = o.OrderID
         JOIN PRODUCT p ON p.ProductID = oi.ProductID
         WHERE p.SellerID = ? AND o.OrderStatus = 'Pending'`, [s.id]);
      const [[sales]] = await conn.query(
        `SELECT COALESCE(SUM(oi.SubTotal),0) AS n
         FROM ORDER_ITEM oi
         JOIN PRODUCT p ON p.ProductID = oi.ProductID
         JOIN \`ORDER\` o ON o.OrderID = oi.OrderID
         WHERE p.SellerID = ? AND o.OrderStatus = 'Delivered'`, [s.id]);

      console.log(`  DASHBOARD - ${s.store}`);
      console.log(`    Total ${t.n} | Active ${a.n} | Pending ${pd.n} | Out of stock ${oos.n}`);
      console.log(`    Pending orders ${po.n} | Total sales ${Number(sales.n).toLocaleString()}`);
      console.log('');
    }

    console.log('  Now start the server:   node server.js');
    console.log('  Then open:              http://localhost:3000/login.html');
    console.log('======================================================');

  } catch (err) {
    console.error('');
    console.error('SEED FAILED:', err.sqlMessage || err.message);
    console.error('');
    console.error('Common causes:');
    console.error('  - the tables do not exist yet   -> run db/schema.sql first');
    console.error('  - wrong DB_PASSWORD in .env');
    console.error('  - the ecommerce database does not exist');
    console.error('');
    console.error(err);
  } finally {
    conn.release();
    await db.end();
  }
}

run();