import mongoose from 'mongoose';

export interface IPasswordResetToken {
  _id: mongoose.Types.ObjectId;
  userId: string;
  username: string;
  token: string;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
  createdBy: string; // Admin who created the token
}

const PasswordResetTokenSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  username: {
    type: String,
    required: true,
  },
  token: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
  },
  used: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  createdBy: {
    type: String,
    required: true,
  },
});

// Auto-delete expired tokens
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PasswordResetToken = mongoose.models.PasswordResetToken ||
  mongoose.model<IPasswordResetToken>('PasswordResetToken', PasswordResetTokenSchema);

export default PasswordResetToken;