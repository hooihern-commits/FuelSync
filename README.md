# Fuelsync

A mobile-first health and fitness companion that integrates meal tracking,
workout intensity logging, and wearable data to provide personalised,
timing-aware nutrition recommendations.

## Tech Stack
- **Mobile:** React Native (Expo)
- **Backend:** Node.js, Express.js, PostgreSQL
- **ML:** Python, FastAPI, scikit-learn
- **Dashboard:** React.js

## Project Structure
fuelsync/
├── client/       # React Native (Expo) mobile app

├── server/       # Node.js + Express backend API

└── dashboard/    # React.js coach/admin web dashboard

## Getting Started
### Backend
cd server
npm install
cp .env.example .env    # fill in your database credentials
npm run dev

### Mobile App
cd client
npm install
npx expo start

## Team
- Ng Hooi Hern
- Jayden Tam
