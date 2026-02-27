// User Model - Người dùng hệ thống
import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";
import { IUser } from "../../types";

// Extend IUser với Document methods
export interface IUserDocument extends IUser, Document {
  comparePassword(candidatePassword: string): Promise<boolean>;
}

// Schema definition
const userSchema = new Schema<IUserDocument>(
  {
    name: {
      type: String,
      required: [true, "Tên là bắt buộc"],
      trim: true,
      maxlength: [100, "Tên không được quá 100 ký tự"],
    },
    email: {
      type: String,
      required: [true, "Email là bắt buộc"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Email không hợp lệ"],
    },
<<<<<<< HEAD
=======
    phone: {
      type: String,
      trim: true,
      default: "",
    },
>>>>>>> 88316e3796a554084c42223fe02bd664f932e5f9
    password: {
      type: String,
      required: [true, "Mật khẩu là bắt buộc"],
      minlength: [6, "Mật khẩu phải có ít nhất 6 ký tự"],
      select: false, // Không trả về password trong query
    },
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    otpCode: {
      type: String,
      select: false,
    },
    otpExpiry: {
      type: Date,
      select: false,
    },
    activePackageId: {
      type: Schema.Types.ObjectId,
      ref: "UserPackage",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Index cho tìm kiếm
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });

// Hash password trước khi save
userSchema.pre("save", async function (next) {
  // Chỉ hash nếu password được thay đổi
  if (!this.isModified("password")) return next();

  // Hash password với salt rounds = 12
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method so sánh password
userSchema.methods.comparePassword = async function (
  candidatePassword: string,
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Export model
export const User = mongoose.model<IUserDocument>("User", userSchema);
