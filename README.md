# Ecommerce Project

A full-stack ecommerce application built with vanilla HTML, CSS and JavaScript, Node.js/Express, and MySQL.

## Requirements

Install these programs before starting:

- Node.js and npm
- MySQL Server
- MySQL Workbench (recommended for importing the schema)

## 1. Install dependencies

Open PowerShell in the project folder:

```powershell
cd D:\projects\Ecommerce
npm install
```

If PowerShell blocks `npm.ps1`, use:

```powershell
npm.cmd install
```

## 2. Create the MySQL database

The authoritative schema is:

```text
db/ecommerce_dump.sql
```

Using MySQL Workbench:

1. Start MySQL Server and open MySQL Workbench.
2. Open your local MySQL connection.
3. Select **File > Open SQL Script**.
4. Open `D:\projects\Ecommerce\db\ecommerce_dump.sql`.
5. Click the lightning-bolt **Execute** button.
6. Refresh **Schemas** and confirm that the `ecommerce` database contains 18 tables.

Do not use `mydb.sql`; the application-compatible schema is `db/ecommerce_dump.sql`.

## 3. Configure environment variables

Create a file named `.env` in the project root if it does not already exist:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=ecommerce
JWT_SECRET=replace_with_a_long_random_secret
PORT=3000
```

Notes:

- Use the MySQL username and password configured on your computer.
- Keep `DB_NAME=ecommerce` unless you also change the database used by the schema.
- `PORT` is the Express server port, not the MySQL port.
- The current database connection uses MySQL's standard/default port.
- Never commit `.env`; it is already excluded by `.gitignore`.

## 4. Load demonstration data (optional)

The project includes a large demonstration dataset:

```powershell
node scripts/seedData.js
```

Warning: this is a reset script. It uses `TRUNCATE TABLE` and permanently deletes all existing records from the configured database before inserting sample data.

The seed creates approximately:

- 80 users
- 13 sellers, 68 customers and 2 admins
- 24 categories and 25 brands
- 300 products and 769 product images
- 300 orders and 858 order items
- 205 reviews
- Wallets, transactions, carts, wishlists, addresses and search history

All seeded account passwords are:

```text
123456
```

Useful demonstration accounts:

| Role | Email |
|---|---|
| Admin | `admin@gmail.com` |
| Admin | `admin2@gmail.com` |
| Seller | `seller@gmail.com` |
| Seller | `seller2@gmail.com` |
| Customer | `rafiq@gmail.com` |
| Customer | `sadia@gmail.com` |
| Customer + Seller | `farhana@gmail.com` |

## 5. Start the application

From the project root, run:

```powershell
node server.js
```

Keep that terminal open while using the application. A successful start prints:

```text
Server running at http://localhost:3000/login.html
```

Open this URL in a browser:

```text
http://localhost:3000/login.html
```

Main pages after authentication:

- Customer: `http://localhost:3000/customer.html`
- Seller: `http://localhost:3000/seller.html`
- Admin: `http://localhost:3000/admin.html`

Stop the server with `Ctrl+C`.

## Troubleshooting

### Browser says the site cannot be reached

- Confirm the terminal running `node server.js` is still open.
- Confirm no startup error appeared.
- Confirm port 3000 is not already in use.
- If `PORT` is changed in `.env`, open the matching port in the browser.

### Database connection errors

- Confirm MySQL Server is running.
- Check `DB_HOST`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` in `.env`.
- Confirm `db/ecommerce_dump.sql` was executed successfully.
- Confirm the `ecommerce` schema contains all 18 tables.

### Empty pages

Run the optional seed command after confirming that it is safe to erase existing local data:

```powershell
node scripts/seedData.js
```

## Project structure

```text
controllers/   Request handling and database operations
db/            MySQL connection and authoritative schema
middleware/    Authentication, role checks and image uploads
public/        HTML, CSS, browser JavaScript and generated uploads
routes/        Express API routes
scripts/       Development seed script
server.js      Express application entry point
```

