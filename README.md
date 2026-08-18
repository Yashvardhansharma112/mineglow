# GlowCream — Simple eCommerce Frontend

This is a lightweight static storefront to sell a cream product and let customers place orders via WhatsApp.

Quick start

1. Open `index.html` in a browser.
2. Click the product's "Add to cart" button, then open the cart and press "Order via WhatsApp".

Configuration

- Edit `script.js` and replace the `WHATSAPP_NUMBER` value (string) with your WhatsApp phone number in international format without the plus sign. Example: `15551234567` for +1 555 123 4567.
- You can change the product details in the `PRODUCTS` array inside `script.js`.
Place your brand logo image (the one you provided) into `assets/originals/` and name it `logo.png` (or `logo.jpg` / `logo-source.jpg`). Then run the import helper to generate optimized logo files used by the site.

Save the 5 product images you uploaded to the `assets/` folder with these exact filenames:
	 - `img1.jpg`
	 - `img2.jpg`
	 - `img3.jpg`
	 - `img4.jpg`
	 - `img5.jpg`
	The product showcase and product cards will use these files. Recommended: JPEG or PNG, at least 1200px on the long edge for good quality.

Image optimization

1. Create an `assets/originals/` folder and copy the five original images there (the filenames should be img1.jpg ... img5.jpg).
2. Install dependencies and run the optimizer:

```bash
npm install
npm run optimize-images
```

This script uses `sharp` to create resized `jpg` and `webp` outputs in the `assets/` folder (e.g. `img1.jpg`, `img1.webp`). The site will use the `jpg` files by default.

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
