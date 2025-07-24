import { asyncHandler } from "../utils/asyncHandler.js";
import { ErrorHandler } from "../utils/errorHandler.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../services/cloudinary.js";
import { ResponseHandler } from "../utils/responseHandler.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

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
  if (!username && !email) {
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

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;
  if (!incomingRefreshToken) {
    throw new ErrorHandler("Refresh token is required!", 401);
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken?._id);
    if (!user) {
      throw new ErrorHandler("User not found! Invalid refresh token", 404);
    }

    if (user?.refreshToken !== incomingRefreshToken) {
      throw new ErrorHandler("Refresh token is expired or used", 401);
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
      user._id
    );

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
          { accessToken, refreshToken },
          "Tokens refreshed successfully"
        )
      );
  } catch (error) {
    throw new ErrorHandler(error?.message || "Invalid refresh token", 401);
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    throw new ErrorHandler("Old and new passwords are required", 400);
  }

  const user = await User.findById(req.user?._id);
  if (!user) {
    throw new ErrorHandler("User not found", 404);
  }

  const isPasswordValid = await user.isPasswordCorrect(oldPassword);
  if (!isPasswordValid) {
    throw new ErrorHandler("Old password is incorrect", 401);
  }
  if (newPassword.length < 6) {
    throw new ErrorHandler(
      "New password must be at least 6 characters long",
      400
    );
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ResponseHandler(200, {}, "Password changed successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user?._id).select(
    "-password -refreshToken"
  );
  if (!user) {
    throw new ErrorHandler("User not found", 404);
  }
  return res
    .status(200)
    .json(new ResponseHandler(200, user, "Current user fetched successfully"));
});

const updateUserDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;
  if (!fullName || !email) {
    throw new ErrorHandler("Full name and email are required", 400);
  }

  if (!email.includes("@") || !email.includes(".")) {
    throw new ErrorHandler("Invalid email format", 400);
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        fullName,
        email,
      },
    },
    {
      new: true,
    }
  ).select("-password -refreshToken");
  if (!user) {
    throw new ErrorHandler("User not found", 404);
  }

  return res
    .status(200)
    .json(new ResponseHandler(200, user, "User details updated successfully"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;
  if (!avatarLocalPath) {
    throw new ErrorHandler("Avatar file is required", 400);
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  if (!avatar.url) {
    throw new ErrorHandler("Failed to upload avatar image", 500);
  }
  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatar?.url,
      },
    },
    {
      new: true,
    }
  ).select("-password -refreshToken");
  if (!user) {
    throw new ErrorHandler("User not found", 404);
  }

  return res
    .status(200)
    .json(new ResponseHandler(200, user, "User avatar updated successfully"));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;
  if (!coverImageLocalPath) {
    throw new ErrorHandler("Cover image file is required", 400);
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);
  if (!coverImage.url) {
    throw new ErrorHandler("Failed to upload cover image", 500);
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        coverImage: coverImage?.url,
      },
    },
    {
      new: true,
    }
  ).select("-password -refreshToken");
  if (!user) {
    throw new ErrorHandler("User not found", 404);
  }

  return res
    .status(200)
    .json(
      new ResponseHandler(200, user, "User cover image updated successfully")
    );
});

const getUserChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;
  if (!username?.trim()) {
    throw new ErrorHandler("Username is required", 400);
  }

  const channel = await User.aggregate([
    {
      $match: {
        username: username?.toLowerCase(),
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers",
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },
    {
      $addFields: {
        subscribersCount: { $size: "$subscribers" },
        subscribedToCount: { $size: "$subscribedTo" },
        isSubsribed: {
          $cond: {
            if: { $in: [req.user?._id, "$subscribers.subscriber"] },
            then: true,
            else: false,
          },
        },
      },
    },
    {
      $project: {
        fullName: 1,
        username: 1,
        avatar: 1,
        coverImage: 1,
        subscribersCount: 1,
        subscribedToCount: 1,
        isSubsribed: 1,
        email: 1,
        createdAt: 1,
      },
    },
  ]);

  if (!channel || channel?.length === 0) {
    throw new ErrorHandler("Channel not found", 404);
  }

  return res
    .status(200)
    .json(
      new ResponseHandler(
        200,
        channel[0],
        "User channel profile fetched successfully"
      )
    );
});

const getWatchHistory = asyncHandler(async (req, res) => {
  const user = await User.aggregate([
    {
      $match: {
        _id: mongoose.Types.ObjectId(req.user._id),
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    username: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              owner: {
                $first: "$owner",
              },
            },
          },
        ],
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ResponseHandler(
        200,
        user[0].watchHistory,
        "Watch history fetched successfully"
      )
    );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  changeCurrentPassword,
  getCurrentUser,
  updateUserDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory,
  generateAccessAndRefreshTokens,
  refreshAccessToken,
};
