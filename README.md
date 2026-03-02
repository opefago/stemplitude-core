# STEAMplitude - Kids STEAM Education Center

A modern, beautiful, and animated React website for a kids STEAM center focusing on coding, robotics, electronics, 3D printing, 3D modelling, and AI education.

## 🌟 Features

### Pages
- **Home** - Hero section with animations, programs snapshot, testimonials, and newsletter signup
- **Programs** - Detailed information about all 6 STEAM programs
- **Camps** - Seasonal camp offerings (Spring, Summer, Winter)
- **Demo Days** - Student projects, competition achievements, and upcoming events
- **About** - Mission, vision, team, and values
- **Contact** - Contact form with program selection dropdown
- **Enrollment** - Multi-step enrollment form with payment integration ready
- **FAQ** - Comprehensive FAQ with collapsible sections

### Tech Stack
- **React 19** - Latest React with hooks
- **React Router DOM** - Client-side routing
- **Framer Motion** - Smooth animations and transitions
- **Lucide React** - Beautiful icon library
- **Vite** - Fast build tool and dev server

### Design Features
- 🎨 Modern gradient-based color scheme
- ✨ Smooth animations and transitions
- 📱 Fully responsive design
- 🎯 Kid-friendly and eye-catching visuals
- 🚀 Fast performance with optimized assets
- ♿ Accessible components

## 🚀 Getting Started

### Prerequisites
- Node.js 22.x or higher
- npm 10.x or higher

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to:
```
http://localhost:5173
```

### Build for Production

```bash
npm run build
```

The optimized production build will be in the `dist` folder.

### Preview Production Build

```bash
npm run preview
```

## 📁 Project Structure

```
steamplitude/
├── src/
│   ├── components/
│   │   ├── Navbar.jsx
│   │   ├── Navbar.css
│   │   ├── Footer.jsx
│   │   └── Footer.css
│   ├── pages/
│   │   ├── Home.jsx
│   │   ├── Home.css
│   │   ├── Programs.jsx
│   │   ├── Programs.css
│   │   ├── Camps.jsx
│   │   ├── Camps.css
│   │   ├── DemoDays.jsx
│   │   ├── DemoDays.css
│   │   ├── About.jsx
│   │   ├── About.css
│   │   ├── Contact.jsx
│   │   ├── Contact.css
│   │   ├── Enrollment.jsx
│   │   ├── Enrollment.css
│   │   ├── FAQ.jsx
│   │   └── FAQ.css
│   ├── App.jsx
│   ├── App.css
│   ├── main.jsx
│   └── index.css
├── public/
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## 🎨 Color Palette

- **Primary**: #6366f1 (Indigo)
- **Secondary**: #ec4899 (Pink)
- **Accent**: #f59e0b (Amber)
- **Success**: #10b981 (Green)
- **Gradient STEAM**: Linear gradient from Indigo → Pink → Amber

## 📋 Integration Points

### Airtable Integration (Contact & Enrollment Forms)
The Contact and Enrollment forms are ready for Airtable integration. You'll need to:

1. Create an Airtable base with appropriate tables
2. Set up a serverless function (Vercel/Netlify) to handle form submissions
3. Update form submit handlers to POST to your endpoint

### Stripe Payment Integration (Enrollment)
The Enrollment page is ready for Stripe Checkout integration:

1. Set up Stripe account and get API keys
2. Create products/prices in Stripe Dashboard
3. Integrate Stripe Checkout or Elements
4. Update the enrollment submit handler

### Email Service (Newsletter)
Newsletter form on homepage can be integrated with:
- Mailchimp
- SendGrid
- ConvertKit
- Any email marketing platform

## 🎯 Programs Offered

1. **Coding** - Python, JavaScript, Web Development, Game Development
2. **Robotics** - VEX, FIRST, Arduino, Raspberry Pi
3. **Electronics** - Circuit Design, Sensors, IoT Projects
4. **3D Printing** - Design to Physical Objects
5. **3D Modelling** - Blender, Tinkercad, Animation
6. **Artificial Intelligence** - Machine Learning, Neural Networks, Computer Vision

## 📱 Responsive Breakpoints

- Mobile: < 768px
- Tablet: 768px - 1024px
- Desktop: > 1024px

## 🔧 Customization

### Colors
Edit colors in `src/App.css` under the `:root` selector:

```css
:root {
  --primary: #6366f1;
  --secondary: #ec4899;
  --accent: #f59e0b;
  /* ... other colors */
}
```

### Content
All content is in the respective page components. Simply edit the text, arrays, and data objects in each `.jsx` file.

### Animations
Animations use Framer Motion. Adjust animation settings in the `motion` components:

```jsx
<motion.div
  initial={{ opacity: 0, y: 30 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.8 }}
>
```

## 🚀 Deployment

### Vercel (Recommended)
1. Push your code to GitHub
2. Import project in Vercel
3. Deploy automatically

### Netlify
1. Push your code to GitHub
2. Connect repository in Netlify
3. Build command: `npm run build`
4. Publish directory: `dist`

### Other Platforms
Build the project and serve the `dist` folder as a static site.

## 📄 License

This project is proprietary software for STEAMplitude.

## 🤝 Support

For questions or support, contact: info@steamplitude.com

---

Built with ❤️ for inspiring the next generation of innovators
