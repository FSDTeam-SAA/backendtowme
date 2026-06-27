# TOW ME - Backend API

Tow Truck & Roadside Assistance Platform Backend

## Tech Stack
- **Node.js** + **Express.js** (v5)
- **MongoDB** + **Mongoose**
- **JWT** Authentication
- **Cloudinary** (image/document uploads)
- **Nodemailer** (email OTP)

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Create `.env` file
Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

Required environment variables:
```
PORT=5000
MONGO_DB_URL=mongodb://localhost:27017/towme_db
JWT_ACCESS_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
```

### 3. Seed Admin Account
```bash
npm run seed:admin
```
Default admin credentials:
- Email: `admin@towme.com`
- Password: `Admin@1234`

### 4. Run the server
```bash
npm run dev     # development (nodemon)
npm start       # production
```

---

## API Endpoints

Base URL: `http://localhost:5000/api/v1`

### Auth (`/api/v1/auth`)
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/customer/register` | Register customer | Public |
| POST | `/customer/login` | Customer login | Public |
| POST | `/driver/login` | Driver login | Public |
| POST | `/admin/login` | Admin login | Public |
| POST | `/verify-otp` | Verify OTP | Public |
| POST | `/forget-password` | Request reset OTP | Public |
| POST | `/verify-reset-otp` | Verify reset OTP | Public |
| POST | `/reset-password` | Reset password | Public |
| POST | `/refresh-token` | Refresh access token | Public |
| POST | `/logout` | Logout | Auth |

### Drivers (`/api/v1/drivers`)
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/` | Create driver | Admin |
| GET | `/` | Get all drivers | Admin |
| GET | `/:id` | Get driver by ID | Admin |
| PUT | `/:id` | Update driver | Admin |
| PATCH | `/:id/toggle-block` | Block/unblock driver | Admin |
| DELETE | `/:id` | Delete driver | Admin |
| GET | `/me/profile` | Get my profile | Driver |
| PUT | `/me/profile` | Update my profile | Driver |
| PATCH | `/me/availability` | Set availability | Driver |
| PATCH | `/me/location` | Update GPS location | Driver |
| GET | `/me/trips` | Get my trips | Driver |
| GET | `/me/financials` | Get earnings history | Driver |

### Trips (`/api/v1/trips`)
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/` | Create trip request | Customer |
| GET | `/my` | Get my trips | Customer |
| POST | `/:id/cancel` | Cancel trip | Customer |
| POST | `/:id/rate` | Rate trip | Customer |
| POST | `/:id/accept` | Accept trip | Driver |
| POST | `/:id/reject` | Reject trip | Driver |
| POST | `/:id/start` | Start trip | Driver |
| POST | `/:id/complete` | Complete trip | Driver |
| GET | `/` | Get all trips | Admin |
| POST | `/:id/admin-cancel` | Cancel trip | Admin |
| POST | `/:id/assign-driver` | Assign driver | Admin |
| GET | `/:id` | Get trip details | Auth |

### Customers (`/api/v1/customers`)
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/me/profile` | Get my profile | Customer |
| PUT | `/me/profile` | Update my profile | Customer |
| PUT | `/me/change-password` | Change password | Customer |
| GET | `/` | Get all customers | Admin |
| GET | `/:id` | Get customer by ID | Admin |
| PATCH | `/:id/toggle-block` | Block/unblock | Admin |
| PATCH | `/:id/toggle-vip` | Toggle VIP | Admin |
| DELETE | `/:id` | Delete customer | Admin |

### Support (`/api/v1/support`)
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/` | Create ticket | Customer |
| GET | `/my` | Get my tickets | Customer |
| POST | `/:id/message` | Send message | Customer |
| GET | `/` | Get all tickets | Admin |
| GET | `/:id` | Get ticket details | Admin |
| POST | `/:id/reply` | Admin reply | Admin |
| PATCH | `/:id/status` | Update status | Admin |
| POST | `/:id/quick-action` | Quick actions | Admin |

### Analytics (`/api/v1/analytics`)
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/dashboard` | Dashboard stats | Admin |
| GET | `/financials` | Financial analytics | Admin |
| PATCH | `/financials/driver/:driverId/payment` | Mark payment | Admin |

### Notifications (`/api/v1/notifications`)
| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/` | Get my notifications | Auth |
| PATCH | `/:id/read` | Mark as read | Auth |
| PATCH | `/mark-all-read` | Mark all read | Auth |
| DELETE | `/:id` | Delete notification | Auth |

---

## Roles
- **admin** — Full system access (web panel)
- **driver** — Mobile driver app
- **customer** — Mobile customer app

## Trip Status Flow
```
pending → accepted → in_progress → completed
                  ↘ cancelled (by customer/admin)
```

## File Upload (multipart/form-data)
- Driver profile: `profileImage`
- Driver docs: `vehicleRegistration`, `insuranceDocument`
- Customer profile: `profileImage`
