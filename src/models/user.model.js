const mongoose = require("mongoose");
const { Schema } = mongoose;

// ─── Schema ──────────────────────────────────────────────────
const userSchema = new Schema(
  {
    mobile_number: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      validate: {
        validator: (v) => /^\+9665[0-9]{8}$/.test(v),
        message: "Invalid Saudi mobile number (+9665xxxxxxxx)",
      },
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true,
      unique: true,
    },
    role: {
      type: String,
      enum: ["teacher", "school", "admin"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "suspended", "blocked", "pending"],
      default: "pending",
    },
    preferred_language: {
      type: String,
      enum: ["ar", "en"],
      default: "ar",
    },
    email_verified: { type: Boolean, default: false },
    mobile_verified: { type: Boolean, default: false },
    last_login_at: { type: Date },
    login_count: { type: Number, default: 0 },
    failed_login_attempts: { type: Number, default: 0 },
    locked_until: { type: Date },
    device_tokens: [{ type: String }],
    suspension_reason: { type: String },
    notification_preferences: {
      type: Schema.Types.Mixed,
      default: { push_enabled: true, email_enabled: true },
    },
  },
  { timestamps: true },
);

// ─── Indexes ─────────────────────────────────────────────────
userSchema.index({ mobile_number: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ createdAt: -1 });

// ─── Instance Methods ─────────────────────────────────────────
userSchema.methods.isLocked = function () {
  return !!(this.locked_until && this.locked_until > new Date());
};

userSchema.methods.incrementFailedAttempts = function () {
  this.failed_login_attempts += 1;
  if (this.failed_login_attempts >= 5) {
    this.locked_until = new Date(Date.now() + 15 * 60 * 1000);
  }
  return this.save();
};

userSchema.methods.resetFailedAttempts = function () {
  this.failed_login_attempts = 0;
  this.locked_until = undefined;
  return this.save();
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.device_tokens;
  delete obj.failed_login_attempts;
  delete obj.locked_until;
  delete obj.__v;
  return obj;
};

// ─── Model ───────────────────────────────────────────────────
const User = mongoose.model("User", userSchema);

module.exports = User;
