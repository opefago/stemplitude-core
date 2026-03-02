# STEAMplitude Deployment Guide

## Quick Start

Your development server is running at: **http://localhost:5174/**

## Environment Setup

### Node Version Note
The app is currently running despite the Vite warning. If you want to upgrade Node.js:
- Update to Node.js 22.12+ or 20.19+
- Or continue using current version (it still works)

## Deployment Options

### 1. Vercel (Recommended - Zero Config)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

**Advantages:**
- Automatic deployments from Git
- Built-in SSL
- Global CDN
- Serverless functions for forms

### 2. Netlify

```bash
# Install Netlify CLI
npm install netlify-cli -g

# Build
npm run build

# Deploy
netlify deploy --prod
```

**Build Settings:**
- Build command: `npm run build`
- Publish directory: `dist`

### 3. GitHub Pages

```bash
# Install gh-pages
npm install --save-dev gh-pages

# Add to package.json scripts:
"predeploy": "npm run build",
"deploy": "gh-pages -d dist"

# Deploy
npm run deploy
```

**Note:** Update `vite.config.js` to add `base: '/steamplitude/'`

## Backend Integrations

### Airtable Setup for Forms

1. **Create Airtable Base**
   - Tables: `Contacts`, `Enrollments`, `Newsletter`
   - Fields match form data

2. **Create Serverless Function** (Vercel example)

Create `/api/contact.js`:
```javascript
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const Airtable = require('airtable');
  const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
    .base(process.env.AIRTABLE_BASE_ID);

  try {
    await base('Contacts').create([
      { fields: req.body }
    ]);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

3. **Environment Variables**
   ```
   AIRTABLE_API_KEY=your_api_key
   AIRTABLE_BASE_ID=your_base_id
   ```

4. **Update Form Submit Handler**
   ```javascript
   const response = await fetch('/api/contact', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(formData)
   });
   ```

### Stripe Payment Integration

1. **Install Stripe**
   ```bash
   npm install @stripe/stripe-js
   ```

2. **Create Checkout Session** (Serverless function)

Create `/api/create-checkout-session.js`:
```javascript
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price: req.body.priceId,
      quantity: 1,
    }],
    mode: 'subscription',
    success_url: `${process.env.DOMAIN}/enrollment?success=true`,
    cancel_url: `${process.env.DOMAIN}/enrollment?canceled=true`,
  });

  res.status(200).json({ sessionId: session.id });
}
```

3. **Update Enrollment Form**
   ```javascript
   import { loadStripe } from '@stripe/stripe-js';
   
   const stripePromise = loadStripe(process.env.VITE_STRIPE_PUBLIC_KEY);
   
   const handleCheckout = async () => {
     const response = await fetch('/api/create-checkout-session', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ priceId: 'price_xyz' })
     });
     
     const { sessionId } = await response.json();
     const stripe = await stripePromise;
     await stripe.redirectToCheckout({ sessionId });
   };
   ```

### Email Service (Newsletter)

**Mailchimp Integration:**

```javascript
const response = await fetch('https://YOURDATACENTER.api.mailchimp.com/3.0/lists/YOUR_LIST_ID/members', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.MAILCHIMP_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email_address: email,
    status: 'subscribed',
    merge_fields: {
      FNAME: name
    }
  })
});
```

## Environment Variables

Create `.env` file:
```env
# Airtable
AIRTABLE_API_KEY=your_key
AIRTABLE_BASE_ID=your_base_id

# Stripe
STRIPE_SECRET_KEY=sk_test_...
VITE_STRIPE_PUBLIC_KEY=pk_test_...

# Email
MAILCHIMP_API_KEY=your_key
MAILCHIMP_LIST_ID=your_list_id

# Site
DOMAIN=https://steamplitude.com
```

**Important:** Add `.env` to `.gitignore`!

## Performance Optimization

### 1. Image Optimization
- Add actual images to `/public` folder
- Use WebP format for smaller file sizes
- Lazy load images below fold

### 2. Code Splitting
Already implemented via React Router lazy loading (can add):
```javascript
const Home = lazy(() => import('./pages/Home'));
```

### 3. Caching
Add to `vite.config.js`:
```javascript
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          animations: ['framer-motion']
        }
      }
    }
  }
})
```

## SEO Optimization

### 1. Meta Tags
Add to each page (example for Home):
```javascript
import { Helmet } from 'react-helmet-async';

<Helmet>
  <title>STEAMplitude | Kids STEAM Education</title>
  <meta name="description" content="..." />
</Helmet>
```

### 2. sitemap.xml
Generate after deployment at `/public/sitemap.xml`

### 3. robots.txt
Create `/public/robots.txt`:
```
User-agent: *
Allow: /
Sitemap: https://steamplitude.com/sitemap.xml
```

## Analytics

### Google Analytics
```javascript
// Add to index.html
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

## Testing Checklist

- [ ] All pages load without errors
- [ ] Navigation works on mobile
- [ ] Forms submit successfully
- [ ] Animations perform smoothly
- [ ] Responsive on all screen sizes
- [ ] No console errors
- [ ] Fast loading times (<3s)
- [ ] SEO meta tags present
- [ ] SSL certificate active
- [ ] Analytics tracking

## Support

For deployment issues:
- Vercel: https://vercel.com/docs
- Netlify: https://docs.netlify.com
- Contact: info@steamplitude.com

---

🚀 **Your site is ready to launch!**
