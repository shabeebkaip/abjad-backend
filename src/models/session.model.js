const mongoose = require("mongoose");
const { Schema } = mongoose;

const sessionSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    refresh_token_hash: { type: String, required: true },
    device_fingerprint: { type: String },
    ip_address: { type: String },
    user_agent: { type: String },
    remember_device: { type: Boolean, default: false },
    expires_at: { type: Date, required: true },
  },
  { timestamps: true },
);

// TTL — MongoDB auto-deletes expired sessions
sessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ user_id: 1 });
sessionSchema.index({ refresh_token_hash: 1 }, { unique: true });

const Session = mongoose.model("Session", sessionSchema);

module.exports = Session;
