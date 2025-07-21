import { asyncHandler } from "../utils/asyncHandler.js";
import { ErrorHandler } from "../utils/errorHandler.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../services/cloudinary.js";
import { ResponseHandler } from "../utils/responseHandler.js";

const registerUser = asyncHandler(async (req, res) => {
  const { username, email, password, fullName } = req.body;

  if (!username || !email || !password || !fullName === "") {
    throw new ErrorHandler("All fields are required", 400);
  }
  if (!email.includes("@") || !email.includes(".")) {
    throw new ErrorHandler("Invalid email format", 400);
  }
  if (password.length < 6) {
    throw new ErrorHandler("Password must be at least 6 characters long", 400);
  }

  const alreadyExists = await User.findOne({ $or: [{ email }, { username }] });
  if (alreadyExists) {
    throw new ErrorHandler("User already exists", 409);
  }

  const avatarLocalPath = req.files?.avatar?.[0].path;
  const coverImageLocalPath = req.files?.coverImage?.[0].path;

  if (!avatarLocalPath) {
    throw new ErrorHandler("Avatar file is required", 400);
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);
  if (!avatar) {
    throw new ErrorHandler("Failed to upload avatar image", 500);
  }

  const user = await User.create({
    username,
    email,
    password,
    fullName,
    avatar: avatar?.url,
    coverImage: coverImage?.url || "",
  });
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ErrorHandler("Something went wrong! User creation failed!", 500);
  }

  return res
    .status(201)
    .json(
      new ResponseHandler(200, createdUser, "User registered successfully")
    );
});

export { registerUser };
