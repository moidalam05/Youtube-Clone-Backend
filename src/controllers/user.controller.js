import { asyncHandler } from "../utils/asyncHandler.js";
import { ErrorHandler } from "../utils/errorHandler.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../services/cloudinary.js";
import { ResponseHandler } from "../utils/responseHandler.js";

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new ErrorHandler("User not found", 404);
    }
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });
    return { accessToken, refreshToken };
  } catch (error) {
    throw new ErrorHandler("Failed to generate tokens", 500);
  }
};

const registerUser = asyncHandler(async (req, res) => {
  const { username, email, password, fullName } = req.body;

  if (!username || !email || !password || !fullName) {
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

const loginUser = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email) {
    throw new ErrorHandler("Username or email are required", 400);
  }

  if (!password) {
    throw new ErrorHandler("Password is required", 400);
  }

  if (!email.includes("@") || !email.includes(".")) {
    throw new ErrorHandler("Invalid email format", 400);
  }

  if (password.length < 6) {
    throw new ErrorHandler("Password must be at least 6 characters long", 400);
  }

  const user = await User.findOne({
    $or: [{ email }, { username }],
  });

  if (!user) {
    throw new ErrorHandler("User not found", 404);
  }

  const isPasswordValid = await user.isPasswordCorrect(password);
  if (!isPasswordValid) {
    throw new ErrorHandler("Invalid password!", 401);
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );
  if (!loggedInUser) {
    throw new ErrorHandler("Something went wrong! User login failed!", 500);
  }

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("refreshToken", refreshToken, options)
    .cookie("accessToken", accessToken, options)
    .json(
      new ResponseHandler(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged in successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined,
      },
    },
    {
      new: true,
    }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("refreshToken", options)
    .clearCookie("accessToken", options)
    .json(new ResponseHandler(200, {}, "User logged out successfully"));
});

export { registerUser, loginUser, logoutUser, generateAccessAndRefreshTokens };
