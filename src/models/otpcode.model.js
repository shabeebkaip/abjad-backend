const mongoose = require("mongoose");
const { Schema } = mongoose;

const otpSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User" },
    mobile_number: { type: String, required: true },
    code_hash: { type: String, required: true },
    purpose: {
      type: String,
      enum: ["registration", "login", "verify_email"],
      required: true,
    },
    expires_at: { type: Date, required: true },
    used_at: { type: Date },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// TTL — MongoDB auto-deletes expired OTPs
otpSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
otpSchema.index({ mobile_number: 1, purpose: 1, used_at: 1 });
otpSchema.index({ user_id: 1 });

const OtpCode = mongoose.model("OtpCode", otpSchema);

module.exports = OtpCode;
