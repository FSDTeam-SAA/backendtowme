import mongoose, { Schema } from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
    },

    phoneNumber: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      validate: {
        validator(value) {
          if (!this.isModified("password")) return true;
          if (this.role === "admin" && !this.isMasterAdmin && this.pinSetupPending) {
            return typeof value === "string" && value.length >= 32;
          }
          return this.role === "admin" && !this.isMasterAdmin && this.adminUsername
            ? /^\d{4}$/.test(value)
            : value.length >= 6;
        },
        message: "Admin PIN must be four digits; other passwords need at least six characters",
      },
    },

    refreshToken: {
      type: String,
      default: null,
    },

    role: {
      type: String,
      enum: ["admin", "driver", "customer"],
      default: "customer",
    },

    adminUsername: { type: String, lowercase: true, trim: true },
    isMasterAdmin: { type: Boolean, default: false },
    authVersion: { type: Number, default: 0 },
    mustChangePin: { type: Boolean, default: false },
    pinSetupPending: { type: Boolean, default: false },
    adminPermissions: [{
      type: String,
      enum: ["dashboard", "drivers", "trips", "customers", "finance", "support", "settings"],
    }],

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    isPhoneVerified: {
      type: Boolean,
      default: false,
    },

    isBlocked: {
      type: Boolean,
      default: false,
    },

    otp: {
      code: { type: String, default: null },
      expiresAt: { type: Date, default: null },
    },

    resetPasswordOtp: {
      code: { type: String, default: null },
      expiresAt: { type: Date, default: null },
    },

    profileImage: {
      public_id: { type: String, default: "" },
      url: { type: String, default: "" },
    },

    // Customer specific
    city: { type: String, default: "" },
    registrationDate: { type: Date, default: Date.now },
    isVip: { type: Boolean, default: false },

    // Push notifications (FCM) — used by driver app for new towing calls
    fcmTokens: {
      type: [String],
      default: [],
    },
    pushNotificationsEnabled: {
      type: Boolean,
      default: true,
    },
    alertSoundsEnabled: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true, sparse: true });

userSchema.pre("save", function () {
  if (this.email == null || this.email === "") {
    this.email = undefined;
  }
});

userSchema.index({ adminUsername: 1 }, {
  unique: true,
  partialFilterExpression: { adminUsername: { $type: "string" } },
});
userSchema.index({ isMasterAdmin: 1 }, {
  unique: true,
  partialFilterExpression: { isMasterAdmin: true },
});

// hash password before save
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function (plainPassword) {
  return await bcrypt.compare(plainPassword, this.password);
};

userSchema.statics.isUserExistsByPhone = async function (phoneNumber) {
  return await this.findOne({ phoneNumber });
};

userSchema.statics.isUserExistsByEmail = async function (email) {
  return await this.findOne({ email });
};

userSchema.statics.isPasswordMatched = async function (plainPassword, hashedPassword) {
  return await bcrypt.compare(plainPassword, hashedPassword);
};

userSchema.methods.setOTP = function (code, expireMinutes = 5) {
  this.otp = {
    code,
    expiresAt: new Date(Date.now() + expireMinutes * 60 * 1000),
  };
};

userSchema.methods.clearOTP = function () {
  this.otp = { code: null, expiresAt: null };
};

userSchema.methods.isOTPValid = function (code) {
  return (
    this.otp?.code === code &&
    this.otp?.expiresAt &&
    this.otp.expiresAt > new Date()
  );
};

userSchema.methods.setResetPasswordOTP = function (code, expireMinutes = 5) {
  this.resetPasswordOtp = {
    code,
    expiresAt: new Date(Date.now() + expireMinutes * 60 * 1000),
  };
};

userSchema.methods.clearResetPasswordOTP = function () {
  this.resetPasswordOtp = { code: null, expiresAt: null };
};

userSchema.methods.isResetPasswordOTPValid = function (code) {
  return (
    this.resetPasswordOtp?.code === code &&
    this.resetPasswordOtp?.expiresAt &&
    this.resetPasswordOtp.expiresAt > new Date()
  );
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.otp;
  delete obj.resetPasswordOtp;
  delete obj.refreshToken;
  return obj;
};

const User = mongoose.model("User", userSchema);
export default User;
