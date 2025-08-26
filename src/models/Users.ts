import mongoose, { Schema } from "mongoose";
import { User } from "types/UserTypes";
import bcrypt from "bcrypt";

const UserSchema: Schema = new Schema<User>(
  {
    name: {
      type: String,
      required: true,
    },
    lastname: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    whatsapp: {
      type: String,
      required: [true, "El número de WhatsApp es requerido"],
      trim: true,
    },
    password: {
      type: String,
      required: true,
      trim: true,
    },
    permissions: {
      type: [String],
      default: [],
    },
    roles: [
      {
        type: Schema.Types.ObjectId,
        ref: "Roles",
      },
    ],
    age: {
      type: Number,
    },
    subscription: {
      type: {
        type: String,
        enum: ["monthly", "annual"],
      },
      status: {
        type: String,
        enum: ["active", "inactive", "cancelled", "expired"],
        default: "inactive",
      },
      expirationDate: {
        type: Date,
      },
      paymentId: {
        type: String,
      },
    },
    couponUsed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true, versionKey: false }
);

UserSchema.pre<User>("save", async function (next) {
  if (this.isModified("password") || this.isNew) {
    const salt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash(this.password, salt);
    this.password = hash;
  }
  next();
});

UserSchema.method(
  "comparePassword",
  async function (password: string): Promise<boolean> {
    return await bcrypt.compare(password, this.password as string);
  }
);

UserSchema.methods.toJSON = function () {
  const userObj = this.toObject();
  delete userObj.password;
  return userObj;
};

export const UserModel = mongoose.model<User>("User", UserSchema);
