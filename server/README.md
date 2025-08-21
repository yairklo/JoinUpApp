# Football Fields API Server

Express.js server for managing football fields, games, and users.

## Features

- **User Management**: Registration, login, profile management
- **Field Management**: CRUD operations for football fields (open/closed)
- **Game Management**: Create, join, leave, and manage games
- **Friends System**: Add/remove friends, get friend recommendations
- **Game Recommendations**: Get personalized game recommendations based on friends' participation
- **Authentication**: JWT-based authentication
- **Data Storage**: JSON file-based storage
- **Admin Features**: Admin-only operations for fields and users

## Installation

```bash
npm install
```

## Running the Server

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

The server will run on `http://localhost:3001`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get current user profile
- `PUT /api/auth/profile` - Update user profile

### Fields
- `GET /api/fields` - Get all fields
- `GET /api/fields/:id` - Get field by ID
- `POST /api/fields` - Create new field (Admin only)
- `PUT /api/fields/:id` - Update field (Admin only)
- `DELETE /api/fields/:id` - Delete field (Admin only)
- `GET /api/fields/search` - Search fields
- `GET /api/fields/type/:type` - Get fields by type (open/closed)

### Games
- `GET /api/games` - Get all games
- `GET /api/games/:id` - Get game by ID
- `POST /api/games` - Create new game
- `POST /api/games/:id/join` - Join game
- `POST /api/games/:id/leave` - Leave game
- `PUT /api/games/:id` - Update game (organizer only)
- `DELETE /api/games/:id` - Delete game (organizer only)
- `GET /api/games/field/:fieldId` - Get games by field
- `GET /api/games/date/:date` - Get games by date
- `GET /api/games/search` - Search games

### Users
- `GET /api/users` - Get all users (Admin only) or find friends (all users)
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user (Admin only)
- `GET /api/users/:id/games` - Get user's games
- `GET /api/users/search` - Search users (Admin only) or find friends (all users)
- `GET /api/users/:id/friends` - Get user's friends
- `POST /api/users/:id/friends` - Add friend
- `DELETE /api/users/:id/friends/:friendId` - Remove friend
- `GET /api/users/:id/shared-games/:friendId` - Get shared games with a specific friend
- `GET /api/users/:id/recommendations` - Get game recommendations based on friends

## Data Structure

### User
```json
{
  "id": "string",
  "name": "string",
  "email": "string",
  "password": "hashed",
  "phone": "string",
  "avatar": "string|null",
  "isAdmin": "boolean",
  "friends": "string[]",
  "createdAt": "ISO string",
  "updatedAt": "ISO string"
}
```

### Field
```json
{
  "id": "string",
  "name": "string",
  "location": "string",
  "price": "number",
  "rating": "number",
  "image": "string",
  "available": "boolean",
  "type": "open|closed",
  "games": "Game[]",
  "createdAt": "ISO string",
  "updatedAt": "ISO string"
}
```

### Game
```json
{
  "id": "string",
  "fieldId": "string",
  "fieldName": "string",
  "fieldLocation": "string",
  "fieldType": "open|closed",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "duration": "number",
  "maxPlayers": "number",
  "currentPlayers": "number",
  "skillLevel": "Beginner|Intermediate|Advanced|Mixed",
  "ageGroup": "Youth|Adult|Senior|Mixed",
  "isOpenToJoin": "boolean",
  "description": "string",
  "organizer": "string",
  "organizerId": "string",
  "price": "number",
  "participants": "Participant[]",
  "createdAt": "ISO string",
  "updatedAt": "ISO string"
}
```

### Participant
```json
{
  "id": "string",
  "name": "string",
  "avatar": "string|null"
}
```

## Authentication

All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

## Error Responses

All endpoints return consistent error responses:
```json
{
  "error": "Error message"
}
```

## Health Check

- `GET /api/health` - Server health check

## Data Files

The server stores data in JSON files in the `data/` directory:
- `users.json` - User data
- `fields.json` - Field data
- `games.json` - Game data

## Friends System

The friends system allows users to:
- Add other users as friends
- Remove friends
- View their friends list
- View friends' profiles and games
- Get shared games with specific friends
- Get personalized game recommendations based on friends' participation

### Friends API Usage

1. **Add a friend**:
   ```bash
   POST /api/users/:id/friends
   Content-Type: application/json
   Authorization: Bearer <token>
   
   {
     "friendId": "user_id_to_add"
   }
   ```

2. **Get friends list**:
   ```bash
   GET /api/users/:id/friends
   Authorization: Bearer <token>
   ```

3. **Remove a friend**:
   ```bash
   DELETE /api/users/:id/friends/:friendId
   Authorization: Bearer <token>
   ```

4. **Get game recommendations**:
   ```bash
   GET /api/users/:id/recommendations
   Authorization: Bearer <token>
   ```

5. **Get shared games with a friend**:
   ```bash
   GET /api/users/:id/shared-games/:friendId
   Authorization: Bearer <token>
   ```

### Game Recommendations

The recommendations endpoint returns games where the user's friends are participating, including:
- Games organized by friends
- Games where friends are participants
- Friend information for each recommended game (name, avatar, role)

Games are sorted by date (closest first) and include detailed friend participation information.

### Friend Features

- **Friend Discovery**: Users can search and view other users to add as friends
- **Friend Status**: The API returns whether a user is already a friend
- **Friend Profiles**: Users can view their friends' profiles and games
- **Shared Games**: Users can see games they played together with specific friends
- **Privacy**: Users can only see profiles and games of their friends (or admins can see all) 