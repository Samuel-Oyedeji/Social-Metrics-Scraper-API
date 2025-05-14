# 🌐 Social Metrics Scraper API

![Node.js](https://img.shields.io/badge/Node.js-18.x-green?logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-4.x-blue?logo=typescript)
![Playwright](https://img.shields.io/badge/Playwright-Tested%20on%20Chromium-purple?logo=microsoft)
![License](https://img.shields.io/badge/license-MIT-lightgrey)
![Status](https://img.shields.io/badge/status-Active-brightgreen)

> 🚀 Scrape **Instagram** and **Twitter (X)** profiles for public engagement metrics using a simple POST API powered by **Node.js**, **TypeScript**, and **Playwright**.

---

## 🎯 What It Does

Send a profile URL and get back key metrics:

### 📸 Instagram
- 📊 **Followers**
- 📝 **Post Count**
- 🖼️ **Latest 15 Posts**
  - 💗 Likes
  - 💬 Comments
  - 🔗 Post Link

### 🐦 Twitter (X)
- 👥 **Followers**
- 📝 **Post Count**
- 🧵 **Latest 15 Tweets**
  - 💗 Likes
  - 💬 Comments (Replies)
  - 🔁 Retweets
  - 🔗 Tweet Link

---

## 🔧 Use Cases

✨ Perfect for:
- Marketing dashboards 📊  
- Influencer analysis tools 🧑‍💼  
- Competitive insights 📉  
- Social media monitoring 🕵️‍♂️  
- Research projects 📚  

---

## 🚀 Quickstart Guide

### 1. 📥 Clone This Repository

```bash
git clone https://github.com/your-username/social-metrics-scraper.git
cd social-metrics-scraper
```

### 2. 📦 Install Dependencies

```bash
npm install
```

### 3. 🧪 Install Playwright with Chromium

```bash
npx playwright install --with-deps chromium
```

### 4. 🔐 Set Up Environment Variables

Create a `.env` file in the root directory:

```env
PORT=3000

```Optional rotating proxy; omit or leave blank to skip proxy:
PROXY=http://user:pass@proxyhost:port

```

---

## ▶️ Start the Server

```bash
npm run dev
```

Your API is now running at:  
📡 `http://localhost:3000/scrape`

Go here for health checks
📡 `http://localhost:3000/`
---

## 💻 API Usage

### 🔁 POST `/scrape`

#### 🔨 Headers
| Key           | Value              |
|---------------|--------------------|
| Content-Type  | application/json   |

#### 📤 Body (JSON)
```json
{
  "url": "https://instagram.com/instagram"
}
```
Or for Twitter/X:
```json
{
  "url": "https://x.com/TwitterDev"
}
```

#### 📥 Sample Response (Instagram)
```json
{
    "success": true,
    "data": {
        "followers": "689,000,000",
        "following": "181",
        "postCount": "8,020",
        "posts": [
            {
                "post": "art imitates life 🌸🌺🌸🌺\n\n#InTheMoment\n\nVideo by @emma.schill \nMusic by @baby.panna",
                "likes": "171,000",
                "comments": "3,294"
            },
        ]
    },
    "timestamp": "2025-05-14T09:40:17.546Z"
}
```

#### 📥 Sample Response (Twitter/X)
```json
{
  "success": true,
  "data": {
      "followers": "3,858,157",
      "following": "3",
      "tweetCount": "8,645,344",
      "tweets": [
          {
              "post": "Messi",
              "likes": "147965",
              "retweets": "18170",
              "replies": "1435",
              "bookmarks": "2298",
              "views": "2180283"
          },
      ]
  },
  "timestamp": "2025-05-14T09:54:10.641Z"
}
```

---

## 🧪 Test With Postman

1. **Open Postman**
2. Click `➕ New` → `Request`
3. Name it e.g. `Scrape Instagram` or `Scrape Twitter`
4. Select `POST` method
5. URL: `http://localhost:3000/scrape`
6. Set Headers:
   - `Content-Type: application/json`
7. Go to `Body` → `raw` → `JSON`, then paste:

```json
{
  "url": "https://instagram.com/instagram"
}
```

🔄 Or

```json
{
  "url": "https://x.com/TwitterDev"
}
```

✅ Click **Send**  
📬 View the scraped metrics in the response panel.

---

## 📁 Folder Structure

```
.
├── package-lock.json
├── package.json
├── tsconfig.json
└── src
    └── index.ts
```

---

## 🧰 Tech Stack

- 🟦 TypeScript
- 🎭 Playwright (Chromium)
- 🌐 Node.js
- 🔐 dotenv

---

## 📌 Roadmap

- [x] Instagram support
- [x] Twitter/X support
- [ ] Error handling improvements
- [ ] Docker container
- [ ] Rate-limiting & caching

---

## 📄 License

MIT License — feel free to use and modify 🚀

---

## 👤 Author

**Oyedeji Samuel**  
📫 [GitHub](https://github.com/Samuel-Oyedeji) • 🌐 [LinkedIn](www.linkedin.com/in/samuel-oyedeji004)

---
