# Aashirshiya FaceTime

A premium, professional video calling application built with **React**, **Node.js**, **Express**, **MongoDB**, and **Socket.io**.

## ✨ Features
- **Full HD Video**: 1080p high-fidelity transmission.
- **Glassmorphic UI**: Premium Apple-style design with advanced blurs.
- **Ultra-Fast Reconnection**: Sub-second recovery after page refresh.
- **Google OAuth**: One-tap secure authentication.
- **Glass-Morphic Dashboard**: Professional contact management.

## 🚀 Deployment Guide

### 📂 Repository Structure
- `/frontend`: Vite + React application.
- `/backend`: Node.js + Express API & Socket.io server.

### 🌐 Frontend (Vercel Recommended)
1.  Connect your repository to Vercel.
2.  Set the **Root Directory** to `frontend`.
3.  Add the following **Environment Variables**:
    - `VITE_API_URL`: URL of your deployed backend.
    - `VITE_GOOGLE_CLIENT_ID`: Your Google OAuth Client ID.

### 📡 Backend (Persistent Host Recommended)
> [!IMPORTANT]
> **Avoid Vercel for the backend**. Standard Vercel Serverless Functions **do not support persistent WebSockets**. 
> For the best experience, use a persistent host like **Render.com**, **Railway.app**, or **Railway**.

1.  Connect your repository to your chosen host.
2.  Set the **Root Directory** to `backend`.
3.  Add the following **Environment Variables**:
    - `MONGO_URI`: Your MongoDB connection string.
    - `JWT_SECRET`: A secure random string for tokens.
    - `GOOGLE_CLIENT_ID`: Your Google OAuth Client ID.
    - `FRONTEND_URL`: URL of your deployed frontend.

## 🛠️ Local Setup
1.  **Backend**: `cd backend && npm install && npm run dev`
2.  **Frontend**: `cd frontend && npm install && npm run dev`

---
*Created with ❤️ for Aashirshiya FaceTime.*
