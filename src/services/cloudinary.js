import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

import dotenv from "dotenv";
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

console.log(
  process.env.CLOUDINARY_CLOUD_NAME,
  process.env.CLOUDINARY_API_KEY,
  process.env.CLOUDINARY_API_SECRET
);

export const uploadOnCloudinary = async (filePath) => {
  try {
    if (!filePath) return null;
    // upload file to cloudinary
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: "auto",
    });

    // file uploaded successfully
    console.log("file uploaded to cloudinary", result.url);
    return result;
  } catch (error) {
    // delete file if upload fails
    fs.unlinkSync(filePath);
    console.log("Error uploading file to cloudinary", error);
    return null;
  }
};
