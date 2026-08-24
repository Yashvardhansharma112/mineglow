# Mine Glow Organics — Simple eCommerce Frontend

This is a lightweight static storefront to sell a cream product with Razorpay online payments and Cash on Delivery.

Customer accounts

Customers can register with a name, email, phone number, and password, sign in, and view orders placed while signed in. Guest checkout remains available, but guest orders cannot be shown in account history. Account and order APIs run from `backend.js`; the old `server.ps1` static server does not provide these features.

Forgot password creates a single-use link valid for 15 minutes. In local development, the link is printed by `server.js` and opened automatically by the demo UI. Configure a transactional email provider before production; never return reset tokens from the production API.

Quick start

1. Run the local server described below, or open `index.html` in a browser.
2. Add a product to the bag, open checkout, and choose Razorpay or Cash on Delivery.

Configuration

- Edit `script.js` and replace `RAZORPAY_KEY_ID` with your Razorpay **Key ID** from Dashboard > Account & Settings > API Keys. The current value is a test key.
- Never put the Razorpay Key Secret in `script.js` or any browser-delivered file.
- Razorpay order creation and signature verification are handled by `backend.js`. For production, persist pending/paid orders in a database and move email/order notifications to the server.
- WhatsApp remains available as customer support through the footer link; it is not the payment flow.
- You can change the product details in the `PRODUCTS` array inside `script.js`.
Place your brand logo image (the one you provided) into `assets/originals/` and name it `logo.png` (or `logo.jpg` / `logo-source.jpg`). Then run the import helper to generate optimized logo files used by the site.

The current product images in `assets/` are:
	 - `01_front_product.jpg`
	 - `02_open_jar.jpg`
	 - `03_box_and_jar.jpg`
	 - `04_candlelit_product.jpg`
	 - `05_product_benefits.jpg`
	The product showcase and product cards will use these files. Recommended: JPEG or PNG, at least 1200px on the long edge for good quality.

Image optimization

1. Create an `assets/originals/` folder and copy the source images there.
2. Install dependencies and run the optimizer:

```bash
npm install
npm run optimize-images
```

This script uses `sharp` to create resized `jpg` and `webp` outputs in the `assets/` folder. The site currently uses the `jpg` files by default.

Logo import helper

1. Copy your provided logo image into `assets/originals/` and name it `logo.png` (or `logo.jpg` / `logo-source.jpg`).
2. Run the import script to generate `assets/logo.png`, `assets/logo@2x.png` and `assets/logo.webp`:

```bash
npm run import-logo
```

This requires `sharp` (already listed in `package.json`).

Deployment

This is static — host on GitHub Pages, Netlify, Vercel, or any static host.

GitHub Pages (automatic)

This repository includes a GitHub Actions workflow that will publish the repository root to GitHub Pages whenever you push to the `main` branch.

Steps to deploy:

1. Create a GitHub repository and push this project to it (branch `main`).

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:<your-username>/<repo>.git
git push -u origin main
```

2. The workflow will run on push and publish the site to GitHub Pages automatically. Visit `https://<your-username>.github.io/<repo>/` after the workflow completes (check Actions tab for progress).

If you prefer manual or alternative deployment, use Netlify or Vercel by connecting the repository.

Local server

From the project directory in PowerShell:

```powershell
npm install
$env:RAZORPAY_KEY_ID = 'rzp_test_your_key_id'
$env:RAZORPAY_KEY_SECRET = 'your_test_secret'
npm start
```

Then open `http://localhost:5500/`. The Razorpay secret is read only by `backend.js` and is never sent to the browser.

GitHub Pages only hosts static files and cannot run the payment API. Deploy `backend.js` on a Node host such as Render, Railway, or a serverless platform, set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` there, and configure the frontend API base URL before production deployment.

The server writes account and order data to `data/store.json`. Keep the `data/` directory private and use a managed database, persistent disk, HTTPS, rate limiting, and session storage appropriate for production traffic.
