import { Router } from "express";
import {
  changeCurrentPassword,
  getCurrentUser,
  getUserChannelProfile,
  getWatchHistory,
  loginUser,
  logoutUser,
  refreshAccessToken,
  registerUser,
  updateUserAvatar,
  updateUserCoverImage,
  updateUserDetails,
} from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyUser } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/register").post(
  upload.fields([
    {
      name: "avatar",
      maxCount: 1,
    },
    {
      name: "coverImage",
      maxCount: 1,
    },
  ]),
  registerUser
);

router.route("/login").post(loginUser);
router.route("/logout").post(verifyUser, logoutUser);
router.route("/refresh-token").post(refreshAccessToken);
router.route("/change-password").post(verifyUser, changeCurrentPassword);
router.route("/current-user").get(verifyUser, getCurrentUser);
router.route("/update-details").patch(verifyUser, updateUserDetails);

router
  .route("/update-avatar")
  .patch(verifyUser, upload.single("avatar"), updateUserAvatar);

router
  .route("/update-cover-image")
  .patch(verifyUser, upload.single("coverImage"), updateUserCoverImage);

router.route("/c/:username").get(verifyUser, getUserChannelProfile);
router.route("/watch-history").get(verifyUser, getWatchHistory);

export default router;
