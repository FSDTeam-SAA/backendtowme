import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { v2 as cloudinary } from "cloudinary";
import nodemailer from "nodemailer";

// Generate a random OTP
export const generateOTP = (length = 6) => {
  // numeric OTP
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
};

export const hashOTP = (otp) => {
  return crypto.createHash("sha256").update(String(otp)).digest("hex");
};

export const isOtpExpired = (expiresAt) =>
  !expiresAt || expiresAt.getTime() < Date.now();

//Generate unique ID
export const generateUniqueId = () => {
  const timestamp = Date.now().toString(36); // Convert current timestamp to base36 string
  const randomPart = Math.random().toString(36).substr(2, 6); // Get 6 random characters

  const uniquePart = timestamp + randomPart;
  const uniqueId = uniquePart.substring(0, 8);

  return `BK${uniqueId}`;
};

//password hashing
export const hashPassword = async (newPassword) => {
  const salt = await bcrypt.genSalt(Number.parseInt(10));
  const hashedPassword = await bcrypt.hash(newPassword, salt);
  return Promise.resolve(hashedPassword);
};

export const uniqueTransactionId = () => {
  return uuidv4().replace(/-/g, "").substr(0, 12).toUpperCase();
};

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendOTP = async (email, code) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Verification Code",
    text: `Your verification code is: ${code}`,
  };
  await transporter.sendMail(mailOptions);
};

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const isPlaceholder = (value) => {
  if (!value) return true;
  const v = String(value).trim().toLowerCase();
  return (
    v.startsWith("your_") ||
    v.includes("your_cloud") ||
    v.includes("your_api") ||
    v === "changeme"
  );
};

const isCloudinaryConfigured = () => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
    process.env;
  return (
    !isPlaceholder(CLOUDINARY_CLOUD_NAME) &&
    !isPlaceholder(CLOUDINARY_API_KEY) &&
    !isPlaceholder(CLOUDINARY_API_SECRET)
  );
};

const publicBaseUrl = () => {
  const configured = (process.env.BASE_URL || "").replace(/\/$/, "");
  if (configured) return configured;
  const port = process.env.PORT || 5001;
  return `http://localhost:${port}`;
};

/** Local disk upload used when Cloudinary credentials are missing/placeholder. */
const uploadLocally = async (fileBuffer, options = {}) => {
  const folder = String(options.folder || "uploads")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.\./g, "");
  const dir = path.join(process.cwd(), "public", folder);
  await fs.mkdir(dir, { recursive: true });

  const filename = `${Date.now()}-${uuidv4().slice(0, 8)}.jpg`;
  const filepath = path.join(dir, filename);
  await fs.writeFile(filepath, fileBuffer);

  // Verify the file landed on disk before returning a public URL.
  await fs.access(filepath);

  const url = `${publicBaseUrl()}/public/${folder}/${filename}`;
  return {
    public_id: `${folder}/${filename}`,
    secure_url: url,
    url,
  };
};

export const uploadOnCloudinary = async (fileBuffer, options = {}) => {
  if (!isCloudinaryConfigured()) {
    console.warn(
      "Cloudinary not configured — saving upload locally under /public"
    );
    return uploadLocally(fileBuffer, options);
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { ...options },
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          // Dev-friendly fallback if remote credentials fail at runtime.
          uploadLocally(fileBuffer, options).then(resolve).catch(reject);
          return;
        }
        resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
};
